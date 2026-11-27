---
title: "实验性 CloudLink MQTT v1 边缘契约"
description: "说明 AetherEdge 如何集成实验性的 CloudLink 候选方案；共享协议以公开的 AetherContracts 发布为准"
updated: 2026-07-17
---

# 实验性 CloudLink MQTT v1 边缘契约

## 状态和范围

本文档描述实验性的 CloudLink 候选方案。公开的 AetherContracts `v0.1.0-alpha.4` 发布是唯一权威，AetherEdge 和 AetherCloud 提交的是同一份按摘要固定的使用方锁文件。当前能够声明的是：分发完整性完备、全部测试夹具均已执行，以及历史上的双产品 alpha.3 证据。当前的严格身份验证路径只有一个 Edge 本地的真实消息代理测试工具，不构成生产互操作一致性。共享协议由公开的 AetherContracts 发布和兼容性指南定义；本页只说明 AetherEdge 侧的集成。

锁文件导入的是精确的 alpha.4 采用闭包。严格的运行时清单 SemVer 以及重放/摘要/游标上下文向量在两个产品中都会执行。本地的线格式、身份验证、门槛、场景和夹具清单文件属于迁移或产品集成材料，不能覆盖 AetherContracts。

本切片已实现：

- 严格的、与传输无关的 JSON 值和规范业务摘要；
- 会话/版本/纪元校验；
- 运行时清单和真实 `PointSample` 的业务映射；
- 内存型和可崩溃恢复的文件型持久队列，只有应用层 ACK 才能移除其中的记录；
- 由 Uplink 拥有的 MQTT v3.1.1/QoS 1 绑定，面向用户选定的消息代理；
- 确定性的假传输测试，以及仅限 Edge 的真实消息代理测试工具。历史上的双产品 alpha 证据早于如今必需的严格质询组合，不能证明当前的身份验证路径。

已包含在导入的实验性子集中：

- 每一个线格式字段、主题、回执，以及重放/数据丢失交换；
- 精确的 alpha.4 质询请求、质询、网关签名和可信连接器来源提案的结构；生产密钥生命周期仍未解决；
- 边缘原生遥测，不强制要求 Thing Model 修订。

彼此不兼容的 AetherEdge 和 AetherCloud 仓库本地词汇表已被公开的 alpha.3 取代；迁移中的发现保留在 `contracts/cloudlink/v1/MIGRATION.md` 中。

计划在本切片之外完成：

- 生产级 AetherCloud 身份验证和持久存储；
- 生产级 Cloud Claim 部署、凭据签发以及 CA/KMS 生命周期；
- MQTT 5 增强，以及私有消息代理桥接/站点连接器；
- 联合发布的 ACL 模板和生产启用；
- 在专用 CloudLink 流上传送告警和运行遥测；
- 针对在云端回执之前就已过期的记录，提供显式的“过期转数据丢失”生命周期；过期内容目前已经失败关闭，绝不会被提供出去。

已弃用但仍保留：

- 无版本的 `property/{productSN}/{deviceSN}` 及相关的旧版命名空间；
- 经通用发件箱、在 MQTT 客户端接受后即移除记录的做法；
- 旧版 MQTT 设备控制主题。

CloudLink v1 不提供任何物理控制或任意 RPC。

## 实验性集成协议契约

`aether.cloudlink.integration.v1alpha1` 描述通过 CloudLink 传送的集成拓扑快照和观测批次。标准内核没有为该契约组合任何运行时数据源，也不会在运行时清单中声明它。下游组合必须自行提供数据源，并在启用之前通过单独的兼容性与安全评审。

该扩展有两条相互独立的持久流和 MQTT 路由：

- 拓扑快照使用 `up/integration/topology`；
- 观测批次使用 `up/integration/observations`。

一份拓扑快照就是一条原子交付记录，绝不分片。如果其完整编码后的 MQTT 负载超过 256 KiB，发布会失败关闭。观测批次在大小允许时原样保留；否则只在观测边界处拆分，因此单条观测绝不会被拆开。拆分得到的每个批次都独立有效，并且每个完整的 MQTT 负载（包括 CloudLink 交付信封）都必须不超过 256 KiB。

两条流都复用现有的应用层持久 ACK、重放、稳定交付身份和摘要规则。MQTT PUBACK 仍然只是传输证据，不能移除记录。该扩展只承载只读的集成投影事实，不提供命令、任意 RPC 或物理控制能力。

## 兼容性矩阵

| 关注点 | 本切片之前的 AetherEdge | AetherCloud 参考实现 | 候选方案的解决办法 |
|---|---|---|---|
| 线格式包 | 无版本的旧版 JSON | 严格的 TypeScript 编解码器/入口 | 字节一致、已固定的 alpha.4 结构定义/测试夹具，以及相匹配的 Rust/TypeScript 词汇表 |
| 交付记录移除 | 本地 `AsyncClient::publish` 接受之后 | 需要应用层持久 ACK；目前只有内存基础实现 | 专用持久队列只在持久 ACK 通过校验后才移除记录 |
| 会话 | 没有 CloudLink 会话/纪元 | 领域/应用层的内存实现 | 候选的 hello/accepted 以及单调纪元绑定 |
| 身份验证 | MQTT 用户名/密码或 mTLS；以产品/设备主题作为身份 | 会话验证器使用 alpha 结构性证据 | hello 携带精确的质询和网关签名对象，否则必须在负载之外提供可信适配器元数据；生产密钥生命周期仍处于提案状态 |
| 恢复续传 | 仅消息代理重连 | 拟以服务端游标为权威 | 由服务端游标驱动稳定身份/摘要重放 |
| 遥测身份 | 旧版逻辑映射会丢失时间戳/质量/地址 | 云端编解码器现已接受 Edge 字段和可选的模型 | 保留边缘的 `PointAddress`、时间戳、质量和批次位置，不虚构模型；云端多样本内部索引仍未解决 |
| 拓扑 | 一致的 SHM 发布纪元和快照摘要 | 没有等价的批次字段 | 每个批次携带发布纪元和拓扑摘要 |
| 清单 | 封闭的 v1、JCS SHA-256，已实现 | 相匹配的运行时清单领域结构 | 嵌入经过验证的精确清单和校验和 |
| 消息代理 | 可配置的旧版端点 | alpha MQTT 入口已实现 | 用户选定的共享 MQTT v3.1.1 消息代理由 Edge 本地的严格测试工具验证；历史上的双端测试工具使用的是旧版直接会话路径，当前的联合身份验证仍被阻塞 |
| 控制 | 旧版写入/调用主题到达受治理的应用边界 | CloudLink 命令另行规划 | 没有 CloudLink v1 命令主题或负载 |

## 主题策略

所有候选发布和订阅都使用 QoS 1 和 `retain = false`。前缀可以配置。前缀段和网关段拒绝空值、`+`、`#`、NUL/控制字符，以及类似路径穿越的空段。网关只接收属于自己的 `down/session`、`down/ack` 和 `down/replay` 主题。

网关 ID 不是授权证据。云端入口必须把它与经过验证的发布者身份进行比对。使用通用共享消息代理时，独立的云端订阅者通常看不到原始发布者经过身份验证的消息代理主体。alpha.3 冻结了实验性的质询/会话/上行链路签名对象。生产环境的通用消息代理模式仍然需要密钥供应、轮换、撤销，以及明确验证者的归属。另一种来源模型是：每次发布都在负载之外附带已配置的可信适配器证据。

## 会话身份验证序列

Edge 测试工具现在执行的正是这一严格序列：

```text
SessionChallengeRequest
-> 由 CloudLinkCodec 严格解码云端签名的质询
-> GatewaySessionAuthenticator 验证云端的 Ed25519 签名
-> GatewaySessionAuthenticator 对完整的 hello 记录签名
-> 严格校验 session-accepted
```

直接发送会话 hello、在质询通过验证之前收到接受响应，或者质询带有错误的云端签名，都会失败关闭。测试用的云端对等方使用相同的验证器投影来验证完整的网关签名记录，而不是接受只有结构的证明。

这是身份验证的测试证据，不是生产密钥供应。已固定的 alpha.4 发布中的 `session-accepted` 仍未签名，也没有以密码学方式绑定到 `challenge_id` 和 `client_nonce`。AetherContracts 将其记录为生产阻塞项，并计划在下一个协议版本中提供带签名且可关联的响应。

## 时间、整数、边界和摘要

- 协议中的 `uint64` 值是规范的十进制字符串：`0`，或一个非零数字后接若干数字，不带符号、空白、指数或前导零。
- 协议时间戳是以规范十进制字符串编码的 Unix 毫秒数。内嵌的运行时清单保持其现有字段格式不变。
- 单条编码后的消息最大为 256 KiB，单个点位批次最多包含 256 个样本。
- 标识符和元数据都有长度上限；未知的对象字段会失败关闭。
- 交付摘要的形式为 `sha256:<64 lowercase hex>`，只对带版本的业务内容的 RFC 8785 规范 JSON 计算。会话数据、追踪上下文、重试计数、MQTT 报文标识符/属性以及传输时间戳均不计入。

`(gateway_id, stream_id, stream_epoch, position)` 相同，且稳定的 `batch_id` 和摘要绑定也相同，即为重放。在该身份上更改任何一项绑定，都属于安全冲突。

## 持久队列与恢复续传行为

持久队列会持久化流纪元、下一个位置、记录、交付状态、最后一个持久 ACK 以及数据丢失证据。客户端或消息代理层面的送达不能移除记录。持久 ACK 要校验以下全部内容：

- 当前会话 ID 和会话纪元；
- 流 ID 和流纪元；
- 连续的已确认位置；
- 末尾批次的身份和摘要；
- 非空的回执身份。

重复的 ACK 返回先前的幂等结果。较旧的会话、越过缺口的位置、错误的批次/摘要值以及冲突都会失败关闭。重连时会在新的会话信封下提供相同的已存储内容；它绝不会另行分配位置、批次 ID 或摘要。

配置的容量限定为保留 1–65,536 条记录；每条记录的负载另有 256 KiB 的独立上限。

达到容量时，适配器会记录被逐出位置的精确范围。如果云端的权威游标请求了一个已不可用的位置，边缘会发送该证据，并且只有在云端处理完这段缺口之后，才从最早保留的记录处恢复。末尾被撕裂的日志记录会在恢复时被截断。任何一条完整的日志变更出现损坏，都会阻止打开持久队列。文件适配器使用负载只写一次的增量变更，并在累计 256 次变更后、接受新工作之前，以原子方式压实存活记录和游标元数据。

## 遥测映射

| Edge 值 | 候选字段 | 备注 |
|---|---|---|
| `PointAddress::instance_id` | `instance_id` | 规范的十进制身份 |
| `PointAddress::kind` | `point_kind` | `telemetry`、`status`、`command` 或 `action`；业务采集只使用归采集侧所有的类型 |
| `PointAddress::point_id` | `point_id` | 规范的十进制身份 |
| `PointSample::value` | `value` | 必须为有限值 |
| `PointSample::timestamp` | `source_timestamp_ms` | 源端 Unix 毫秒数 |
| `PointSample::quality` | `quality` | 由契约保留 |
| SHM 发布纪元 | `topology.publication_epoch` | 点位/健康数据一致世代的见证 |
| 拓扑快照摘要 | `topology.snapshot_digest` | 标识确切的已发布路由快照 |

SHM v5 在值、原始值和时间戳之外，还编码了采集质量。其读取适配器和上行链路适配器会保留该质量；未知的物理质量码属于无效数据，而不是报告 `good` 的借口。

不会虚构任何 Thing Model 修订。可选的 `model` 绑定只有在来自已投运、经过验证的配置时才会被接受。云端的数据丰富环节可以在摄取之后再映射边缘点位地址。

## 运行时清单映射

报告中嵌入的是当前运行时清单生成器的精确结果。其 `checksum.algorithm` 仍为 `sha256`；其摘要对清单中除 `checksum` 之外所有字段的 RFC 8785 规范 JSON 计算。CloudLink 校验并传输该校验和，而不是另行发明一套组合模型。

## 共享消息代理测试工具

仅限 Edge 的集成测试默认禁用，必须显式启用。它需要一个 MQTT v3.1.1 消息代理，并且有意使用假的云端对等方，因此不构成联合互操作证据：

```bash
AETHER_CLOUDLINK_RUN_INTEGRATION=1 \
AETHER_CLOUDLINK_BROKER_HOST=127.0.0.1 \
AETHER_CLOUDLINK_BROKER_PORT=1883 \
cargo test -p aether-cloudlink-mqtt --test shared_broker -- --nocapture
```

可选凭据使用 `AETHER_CLOUDLINK_BROKER_USERNAME` 和 `AETHER_CLOUDLINK_BROKER_PASSWORD`。TLS 使用 `AETHER_CLOUDLINK_BROKER_CA`，另有可选的客户端证书/密钥变量。测试和错误信息绝不会打印凭据值。

历史上的 alpha.3 证据使用了真实的 Mosquitto、本仓库的 rumqttc 传输和 `FileCloudLinkSpool`，以及 AetherCloud 的 MQTT 适配器和应用用例。当前的跨仓库命令是：

```bash
pnpm test:cloudlink-alpha-harness
```

该命令目前委托给双端测试工具执行。

它会写入 `AetherCloud/evidence/cloudlink-alpha3-dual-harness.json`，并在 `artifacts/cloudlink-alpha/evidence.json` 下写入一份兼容副本，其中包含故障矩阵。该测试工具实现了以下场景：消息代理重连、ACK 丢失、由第二个 Edge 进程恢复文件持久队列、云端拥有的 `manifest/1/1` 恢复游标、第二个云端入口进程、重复/幂等重放、冲突、过期、乱序、非持久的部分结果，以及显式数据丢失。遥测在其 ACK 丢失后仍会重放。PostgreSQL 进程崩溃持久性仍被阻塞，云端重启的结果如实记为 `unknown-reaccepted`。

当前的 AetherCloud 双端工作进程仍然只注入其旧版的 `OpenCloudLinkSession` 路径。它没有组合质询签发或网关签名的会话接受，并且在缺少该接缝时，其桥接会明确报告 `gateway-signed-session-disabled`。因此，严格模式的 Edge 现在会发布质询请求，然后因等不到缺失的云端响应而超时。这是一个跨仓库阻塞项，而不是恢复直接 hello 或削弱签名验证的理由。
