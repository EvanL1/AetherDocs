---
title: "CloudLink 可靠传输与生命周期"
description: "了解消息交付、重试、确认、离线恢复、受限的受信连接器来源模型和当前生产限制"
updated: 2026-08-01
status: mixed
---

# CloudLink 可靠传输与生命周期

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/cloudlink-and-core-state-machines.md)。此页面镜像到统一的 AetherIoT 文档中。

本页同时包含可执行的内层基础和规划中的端到端行为。实验性 JSON/MQTT v1 编解码器、应用桥、可独立启动的入口生命周期、结构定义、测试夹具和真实消息代理测试工具现已存在，公开的 AetherContracts alpha.3 版本是唯一的共享权威。需显式启用的真实 Mosquitto 双端测试工具和故障矩阵属于可执行的 alpha 证据。它们不构成生产进程；生产身份验证、完整的收件箱／发件箱组合以及当前的跨仓库一致性仍是门槛。达到生产就绪需要依次完成身份验证、统一的线上配置、共享测试夹具、真实消息代理双端测试工具、故障注入、崩溃耐久的持久化和明确的旧版本切换。事务性的 PostgreSQL 会话、质询、游标和心跳健康持久化现已存在，但它本身并不能证明端到端的生产身份验证。

可部署的只读集成组合根现已存在，但它运行在受限的受信连接器模式下，唯一的身份验证手段是消息代理 ACL。部署之前请阅读[受信连接器来源模型](#受信连接器来源模型a0-只读组合)；它不是网关身份验证。

## CloudLink 的职责

CloudLink 对网关凭据进行身份验证、协商协议版本、隔离会话、传输版本化信封、维护每个流的序列和持久确认游标、施加背压，并在断开连接后续传。它调用应用的摄取和交付用例。

CloudLink 不拥有遥测含义、部署策略、作业执行或告警生命周期。它不能直接写入 SHM、点位或设备寄存器；不能调用任意运行时方法；不能激活未发布的制品；不能绕过作业确认；也不能清除以边缘为权威的告警。

HTTP 在事务性存储和发件箱中创建期望状态和受治理作业。CloudLink 读取由应用拥有的出站邮箱。HTTP 处理程序从不写入活动的边缘套接字。

## 网关登记

已实现的基础：

```text
registered -> awaiting-claim -> claimed
                    |
                 expired
```

规划中的生产扩展：

```text
claimed -> credential-pending -> active <-> suspended -> revoked
                                      network loss      |
                                      changes no state  v
                                                recovery-pending
                                                       |
                                              active (new generation)
```

- `now >= claim.expiresAt` 时拒绝声明。
- 声明请求和凭据请求指纹都相同的请求是幂等重放。不同的请求不能重新绑定已被认领的网关。
- 在证书签发之前成功的声明可以继续完成凭据绑定，无需消耗新令牌。
- 断开连接不会吊销身份。吊销会隔离一个凭据代次；恢复绝不会让它重新生效。
- 注册或声明成功并不证明 CloudLink 身份验证处于活动状态。

## CloudLink 会话

领域／应用／内存基础实现了凭据验证、服务器优先的协议协商、单调会话纪元、旧会话隔离、无损的逐流续传游标、经过身份验证的心跳和租户范围的当前会话查询。实验性 MQTT 层增加了严格的线上解码、主题／会话绑定、强制非保留 QoS-1、应用桥和生命周期组合。多实例套接字所有权、信用流控、完整的持久收件箱／发件箱路径和生产级的网关签名 MQTT 身份验证仍在规划中。目前存在的唯一组合根是下文描述的受限只读模式。

PostgreSQL 适配器持久化会话／质询状态、持久游标和网关签名的心跳观测。经平台授权的健康协调器使用带 `FOR UPDATE SKIP LOCKED` 的可过期 PostgreSQL 租约，使多个 API 实例可以安全地持久化 `active -> suspect -> closed` 转换。每次完成的转换都以原子方式更新会话，并写入审计和发件箱证据。它使用的隔离登录角色是非属主、非超级用户并且 `NOBYPASSRLS`；它可以扫描／更新会话健康行，但不能读取网关身份表，也不能删除会话。与工作进程竞争的心跳恢复通过带修订版检查的正常会话替换来清除租约，而已过期或丢失的租约不能产生证据。

已实现的结构性签名证据不足以构成共享消息代理上的生产身份验证。Alpha.3 先使用已签名的云端质询和网关签名，再用网关签名把通用消息代理上的每条上行消息绑定到该会话。消息代理专用适配器也可以改为对每次发布提供经过验证的带外发布者证明。载荷自带的证明、主题身份或一次成功的 hello 都不能为后续消息提供身份验证。云端质询使用提案中的签名转录文本；alpha.3 的持久应用 ACK 明确不带签名。

```text
authenticating -> negotiating -> resuming -> active -> draining -> closed
       |              |             |          |
    rejected       rejected      rejected    suspect -> active or closed
```

- 每个经过身份验证的连接都会获得一个单调会话纪元。较新的纪元会隔离旧连接，包括来自旧套接字的迟到消息。
- 续传从 AetherCloud 对每个流的最后一次持久确认开始。
- 身份和摘要都相同的是重复消息，会收到相同的确认。身份相同但摘要不同的消息作为安全冲突被隔离。
- 序列出现缺口时请求重放，并且不推进游标。乱序信封可以在有界窗口内持久缓冲。
- 心跳超时把连接投影移到 `suspect` 或 `closed`；它不能证明网关或下游设备已经停止。
- 显式的信用／窗口流控和有界队列防止快速发送方耗尽进程或租户资源。

## 受信连接器来源模型（A0 只读组合）

`apps/cloudlink/src/runtime.ts` 是可执行的组合根，但它运行在有意受限的模式下。它只启用 `aether.cloudlink.integration.v1alpha1`，从不接入受治理的控制路径，也从不接入网关签名的质询签发、网关签名的 hello 接受或逐条上行消息的网关签名验证。这三项依赖之所以缺席，是因为本仓库没有生产级的消息来源密钥源：每个 `resolvePublicKey` 实现都位于测试或测试工具脚本中，唯一的 `GatewayCredentialVerifier` 是内存实现，而 `PostgresGatewayIdentityRepository` 存储的是登记声明指纹，不是活动的签名凭据。

因此，会话通过受信连接器分支打开。`credential_binding.origin_model` 不是 `gateway-signed` 的 `session-hello` 会依据操作员配置来解析：组合根查找线上提供的网关 ID、凭据 ID 和凭据代次，并返回操作员以带外方式绑定到该网关的凭据。凭据证明是只保存在云端进程配置中的机密；它从不经过线路传输，从不被 AetherCloud 持久化，也从不进入日志行、错误消息或审计载荷。

请按字面理解以下内容。它不是对一条原本已通过身份验证的路径所做的补充说明；它描述的就是这种模式下身份验证的全部。

- **身份验证完全依赖消息代理侧按网关配置的 ACL**。如果没有配置这些 ACL，实际上就没有身份验证。用于选择凭据的三个值是取自消息本身的非机密标识符，因此任何能够到达 `{prefix}/v1/gateways/{gatewayId}/up/...` 并且知道这三个值的发布者都能获得会话。
- **入口的消息代理登录不是按网关配置的 ACL**。可选的入口消息代理用户名和密码验证的是 *AetherCloud 自身订阅者连接* 到消息代理的身份。它们不说明哪些发布者可以写入某个网关的上行主题。本仓库没有任何内容配置、强制或验证按网关的发布者 ACL，无论操作员是否创建了它们，入口都能成功启动。
- **不消费任何发布者证明**。经过评审的受信连接器或消息代理专用适配器可以带外 *为每一次发布* 提供经过验证的发布者证明；本组合不消费任何形式的证明。它假定消息代理 ACL 是正确的，并且无法检测它是否不正确。这一缺口就是本模式与验证证明的替代方案之间的差别。
- **适用范围**：这种模式适合操作员自己拥有消息代理、并能以带外方式确认发布者身份的小型部署，例如单个家庭的 Home Assistant 安装。它不是网关身份验证，也不得被描述为网关身份验证。它不支持多租户或多网关规模，本组合也不足以支撑任何此类支持的说法。

通用的共享消息代理部署仍然需要按顺序完成的网关签名路径：云端签名的质询、网关的建立签名，以及后续上行消息上与会话绑定的网关签名。该路径仍在规划中，以 `gateway-signed` 形式出现的业务上行消息在这里继续以失败关闭方式被拒绝。

## 运行时清单上报

已实现的传输中立上报命令只在凭据通过身份验证之后才接受封闭的 AetherEdge 运行时清单 v1 结构。它验证与 AetherEdge 相同的规范 JSON SHA-256 契约，把代次表示为规范的无符号 64 位十进制字符串，并从已验证的凭据而不是载荷中的标识符派生租户、项目和网关范围。

```text
no current -> accepted-latest
older generation -> accepted-late (history only)
same generation + same digest -> replayed
same generation + different digest -> rejected conflict
newer generation -> accepted-latest
```

迟到的观测仍是可查询的历史，但不能让最新的能力投影后退。能力上报是兼容性证据，不是调用边缘方法的授权。实验性的 CloudLink MQTT 上报信封已经实现。PostgreSQL 投影、公开查询传输、持久审计和发件箱仍在规划中。

`adapters/runtime` 只提供内存存储库；不存在 PostgreSQL 运行时清单适配器。因此 A0 CloudLink 组合把已接受的清单保存在进程内存中，这对会话恢复有直接后果：

```text
process restart -> manifest repository empty
  -> RestoreGatewayRuntimeProtocols returns status "absent"
  -> declared protocols empty
  -> Integration topology and observation uplinks fail closed
  -> Gateway re-reports its manifest -> uplinks resume
```

失败关闭是正确的方向；未声明的集成扩展不得投影数据。操作员应当预期每次重启或重新部署之后都会出现这一窗口，这也是投影存储的选择同时决定会话存储库的原因：持久投影绝不能与重启后就消失的会话和清单搭配使用。

## 制品发布

```text
draft -> validated -> published -> deprecated -> withdrawn
                         \---------------------> withdrawn
```

- 一旦内容摘要标识了某个修订版，其字节和兼容性元数据就不可变。更正会创建新的修订版。
- 发布需要验证、来源证明、兼容性和签名策略全部通过。部分验证不会发布。
- 通道是单独审计的可移动引用；移动它不会编辑修订版。
- 撤回会阻止新的部署，但保留审计和恢复所需的 blob、签名和已应用证据。
- 使用相同摘要和幂等键重复上传或发布会返回原始结果；内容冲突时被拒绝。

冻结的领域转换、受治理的发布／查询应用用例，以及原子的内存内容／签名／元数据／审计／发件箱适配器已经实现。上传／定稿、生产对象存储和签名者策略、PostgreSQL 元数据、持久审计／发件箱、通道移动、生命周期 HTTP 和边缘制品交付仍在规划中。各层的确切状态见[制品注册表](/zh/aethercloud/concepts/artifact-registry)。

## 遥测批次摄取

```text
received -> decoded -> validated -> persisted -> acknowledged -> projected
    |          |           |           |
 rejected   rejected    quarantined  pending-gap
```

- 批次身份由租户、项目、网关、逻辑流、流纪元和起始位置组成。JSON 把协议中的 64 位位置编码为规范十进制字符串。
- MVP 批次是原子的。只要有一条记录无效，整个批次就会在任何业务记录被接受之前被拒绝。
- 身份和业务内容摘要都相同时，返回先前的持久确认。身份相同但内容不同属于冲突的重复，会被隔离。
- 出现缺口时，批次可以保留在有界的持久重排窗口中，但不能推进连续游标。窗口溢出会成为显式的丢失标记。
- 持久化失败时不返回成功确认。结果不明的提交在重放时由同一身份消除歧义。
- 持久接受之后的投影失败不会撤销已作出的接收确认；工作进程从发件箱重试投影。
- 断开连接不改变任何批次状态，边缘可以重放每一个未确认的位置。
- 进入入口之后不支持取消批次。保留和删除是单独的受治理生命周期操作，不是对历史事实的取消。

## 部署的期望、报告与已应用

推出状态：

```text
planned -> running <-> paused -> completed
              |                 completed-with-failures
              v
          cancelling -> cancelled
```

目标状态：

```text
pending -> offered -> accepted -> fetching -> validated -> applied
             |          |           |            |
          expired    rejected     failed       failed or unknown
```

- 期望代次是单调的云端意图。报告和已应用是各自独立的边缘观测，带有自己的代次、时间和证据。
- 针对较旧代次的迟到观测会被保留，但不能让最新投影回退。
- `offered`、`accepted`、`fetching` 和 `validated` 绝不意味着 `applied`。
- 网络超时得到 `unknown`。迟到的边缘回执之后可以消除这一不确定性。
- 取消会停止尚未越过相应边缘接受边界的工作。它不能抹除已经执行的工作。
- 回滚会创建一个指向较旧不可变修订版的新期望代次；它从不编辑历史。
- 部分成功是一等的推出结果。补偿是一次新的、可审计的推出。

## 受治理的能力作业

```text
created -> awaiting-confirmation -> authorized -> queued -> offered
   |              |                    |            |
 expired       rejected              expired     accepted -> running
                                                        |      |      |
                                                   succeeded failed partial
                                                        |
                                                     unknown
```

- 权限、风险策略、确认、前置条件、幂等性、到期和审计要求都按失败关闭处理。
- 边缘可以因为投运、兼容性、授权或安全策略而拒绝工作。
- 发出提议或开始执行之后的超时是 `unknown`，不是失败，也不是创建新的非幂等物理动作的许可。
- 重试使用同一作业身份，并且只有在能力声明了安全重放语义时才允许。
- 取消是一个请求。如果工作已经开始或完成，其实际回执仍然具有权威性。
- 迟到的回执可以消除 `unknown`；它不能改写更早的审计事件。

## 命令回执

```text
ingressed -> authenticated -> persisted -> acknowledged -> projected
     |             |             |
  rejected      quarantined    pending-predecessor
```

- 回执是只追加的事实，带有身份、载荷摘要、作业因果关系、边缘序列、观测时间和可选的证据摘要。
- 身份和摘要都重复时可以安全重放。身份相同但内容不同的回执会被隔离，并且绝不会被确认为成功。
- 先于预期前序到达的回执会被持久保留并标记为待处理，而不是被丢弃。
- 只有在回执、收件箱去重和证据引用以原子方式持久化之后才进行确认。
- 大型证据在对象存储中按内容寻址。缺失或不匹配的证据保持可见。
- 投影可以把先前的作业从 `unknown` 移到终态结果，同时保留完整的时间线。

## 告警投影

边缘发生事实：

```text
unseen -> active -> updated* -> cleared
                  \-> superseded or retracted correction
```

云端工作流叠加层：

```text
unacknowledged -> acknowledged
freshness: complete | gap | stale
```

- 边缘告警的身份、代次和序列使摄取可以安全重放。
- 乱序到达的清除事实会作为待处理保留，并把投影标记为不完整，直到重放补上缺口。
- 断开连接把新鲜度标记为过期；它不会清除或解决告警。
- 存储转发溢出会产生可见的缺口或数据丢失标记。
- 云端的确认、评论、通知静音和指派是云端工作流事实。它们绝不改变边缘的活动／已清除事实。
- 再次触发的条件使用新的发生记录或显式的代次，而不是悄悄重新打开已清除的记录。

## Webhook 投递

```text
pending -> leased -> delivered
   |          |
 disabled   retry-wait -> leased
                  |
             dead-letter -> redrive-requested -> pending
```

- 一个集成事件和一个端点产生一个稳定的投递身份。释放或重试租约绝不会创建新的业务事件。
- HTTP 超时意味着远端是否已消费结果未知，因此重试保持同一事件和投递身份。
- 重试使用有界的指数延迟和尝试次数上限。重试耗尽后死信状态可见，而不是悄悄丢弃事件。
- 禁用端点会停止新的租约，但不能撤销远端已发生的副作用。删除时保留必需的审计和投递历史。
- 重新投递是带有权限、幂等性、到期和审计的受治理命令；它创建的是又一次尝试，而不是又一个事件。
- 部分扇出成功按端点保持可见。不对订阅者之间的分布式事务作任何声明。

这些规则保持了边缘优先的权威边界：边缘仍然是实时状态和物理控制的权威，云端只记录已接受的事实和受治理的意图，不对未经证明的设备结果作出声明。
