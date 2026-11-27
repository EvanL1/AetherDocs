---
title: "CloudLink v1 alpha 1"
description: "说明 CloudLink 线协议、默认关闭的认证提案、累计持久确认与显式启用的 Integration 扩展。"
updated: 2026-07-18
id: cloudlink-v1alpha1
status: experimental-auth-proposal
version: 0.1.0-alpha.4
normative: true
---

# CloudLink v1 alpha 1

> 本页帮助中文用户理解协议。带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 才是规范性依据。

AetherContracts 是这一协议范围的唯一互操作权威。产品仓库中的线协议配置档、清单、门槛和证据文件都是非规范的实现叠加层，不得新增或重新定义线字段。历史联合核心来源记录只说明 alpha.2 输入字节来自哪里；它不授予任何持续的共同所有权。

alpha.3 冻结了封闭核心信封和时间、身份字段，会话质询、问候与接纳，心跳，Runtime Manifest 上报，遥测批次，数据丢失证据，重放请求，以及未签名的应用持久确认。TypeScript、Rust、C99 与 C++17 执行相同的公开夹具清单和稳定失败字符串。这些夹具范围是实验性的，不是完整的生产传输编解码器。

alpha.4 新增一个显式启用的 Integration 扩展，但不把它的消息类型纳入 alpha.3 核心入口结构定义。该扩展复用同一个 `aether.cloudlink` 1.0 会话、上行字段、认证投影、业务摘要、持久位置、重放、数据丢失和持久确认语义。它的入口结构定义引用可复用的 `envelope.schema.json#/$defs/uplinkEnvelope` 结构。用封闭的核心 `envelope.schema.json` 验证 Integration 交付是有意设计为不充分的，并且会失败；使用方应选择与消息类型对应的扩展入口结构定义。

认证配置档区分两种来源模型。在 `gateway-signed` 中，网关首先在既有的
`{prefix}/v1/gateways/{gatewayId}/up/session` 主题上发布
`aether.cloudlink.session-challenge-request.v1`。该请求是触发器，不是身份凭据。云端只有在把所声明的 `gateway_id`、`credential_binding.credential_id` 和
`credential_binding.generation` 解析到一个有效的已投运网关委托之后，才可以签发质询，并且必须对质询请求限速。不符合条件或被限速的请求不会导致任何质询被签发。认证提案仍然默认关闭，需要显式启用。

质询请求对象是封闭对象，恰好包含 `schema`、`protocol`、`message_kind`、`gateway_id`、`credential_binding`、`offered_protocol_versions`、`client_nonce` 和 `resume`。`credential_binding` 恰好包含 `credential_id` 和 `generation`；它不选择来源模型，也不携带认证证据。`offered_protocol_versions`、`client_nonce` 和 `resume` 的值会在之后的会话建立签名投影中原样重复。

云端先持久保存完整的已签名质询，再把它发布到既有的 `down/session` 主题。在该质询尚未到期期间，重复的合格请求会重新发布完全相同的已持久化质询，包括相同的字节、质询标识、随机数、签发时间、到期时间、密钥标识和签名。云端不得重新生成质询，也不得悄悄延长质询的有效期。网关验证质询之后，发布 `session-hello`。云端在接纳会话之前，验证有效的凭据代次、网关密钥、签名、完全相同的已持久化质询以及严格的截止时间。持久的会话接纳和一次性质询消费是同一个原子状态转换：二者不能单独提交，失败的尝试不消费质询，已消费的质询不能再建立另一个会话。

云端质询签名对象把其 `schema` 映射为字面量
`aether.cloudlink.session-challenge-signing.v1alpha1`；其余每个成员都与 `session-challenge` 的同名成员一一对应。网关会话建立签名对象的 `credential_id` 和
`credential_generation` 分别映射自
`session-hello.credential_binding.credential_id` 和 `.generation`，`cloud_nonce` 映射自完全相同的已持久化质询，其余所有成员映射自 `session-hello` 的同名成员。两个投影都先编码为 RFC 8785 JCS UTF-8 字节，再进行 Ed25519 签名。有序字段列表和完整的语言中立来源映射以
`profiles/cloudlink/v1alpha1/authentication.json` 为规范性依据。

质询有效性使用显式的规范 `evaluation_time_ms`，并且只在
`evaluation_time_ms < expires_at_ms` 时通过。二者相等即已到期，以 `MESSAGE_EXPIRED` 失败，既不消费质询，也不接纳会话。

alpha.4 的 `session-accepted` 响应没有签名，既不包含 `challenge_id`，也不包含 `client_nonce`。因此，网关无法凭这一线协议版本在协议层排除来自另一次握手的延迟响应或重放响应。这是生产认证的阻断项，而不是消息代理连接隐含的属性。绑定已接纳质询和客户端请求的签名响应是下一个协议版本的规划门槛；alpha.4 线字段保持不变。

每条网关签名的上行消息都使用认证配置档中精确的
`aether.cloudlink.uplink-signing.v1alpha1` 投影。交付直接从上行消息映射网关、凭据代次、会话、消息类型、发送时间，以及交付的流、流代次、位置、批次和摘要。`business_digest` 恰好是 `delivery.digest`。只有线协议成员不存在时，`expires_at_ms` 才映射为 JSON null。这些交付规则适用于核心信封、Integration 拓扑与观测交付，以及 Integration Control 回执。

心跳的 `sent_at_ms` 映射自 `heartbeat.observed_at_ms`。`expires_at_ms`、`stream_id`、`stream_epoch`、`position`、`batch_id` 和
`business_digest` 全部为 JSON null。实现不得为心跳推断交付成员、到期时间或业务摘要。完整的有序字段列表和两种映射以
`profiles/cloudlink/v1alpha1/authentication.json` 为规范性依据。

在持久身份查询、新鲜度评估或重放评估之前，云端验证对该精确规范对象的签名、有效的网关密钥、消息代理主体的确切授权命名空间、当前有效的网关与会话身份、会话代次以及凭据代次。随后，心跳使用为该已接纳会话协商的心跳间隔和显式的规范 `evaluation_time_ms`；它绝不读取环境时钟。只有
`observed_at_ms <= evaluation_time_ms + heartbeat_interval_ms` 和
`evaluation_time_ms < observed_at_ms + 3 * heartbeat_interval_ms` 同时成立时，心跳才是新鲜的。在陈旧边界上相等时以 `MESSAGE_EXPIRED` 失败；未来偏差过大时以 `AUTHENTICATION_INVALID` 失败。每次加法和乘法都在 uint64 域内进行溢出检查，任何溢出都以
`AUTHENTICATION_INVALID` 失败关闭。

对每个已接纳的会话，云端持久保存已接纳心跳中最高的 `observed_at_ms`，以及其精确签名对象的摘要。新鲜度检查之后，时间相同且摘要相同属于幂等重放，绝不刷新服务端存活状态。时间相同但签名投影不同，或时间更低但仍然新鲜，都以 `AUTHENTICATION_INVALID` 失败，且不刷新存活状态。更高的心跳只有在新鲜时才推进重放状态并刷新存活状态。已经陈旧的消息以 `MESSAGE_EXPIRED` 失败，不改变任何状态。

在 `trusted-connector-broker-attestation` 中，经过配置的可信入口适配器在载荷之外提供来源证据，并绑定收到的精确 MQTT 载荷字节。载荷不能为自己作证。仅凭主题名称、载荷身份、质询请求和 MQTT 凭据，绝不构成网关认证。

MQTT `{prefix}` 是授权命名空间，不是身份证据。一个命名空间内的 `gateway_id` 值必须唯一。多租户部署使用按租户和项目隔离的前缀，或者使用云端全局唯一的网关标识，并且消息代理主体被限制在确切的命名空间以及网关的上行发布主题和下行订阅主题内。禁止跨命名空间访问和网关通配符访问。前缀和完整主题都不能认证网关。

该提案在 `profiles/cloudlink/v1alpha1/authentication.json` 中精确规定请求、持久化与重试转换、Ed25519 算法、不带填充的 base64url 编码、RFC 8785 JCS 签名对象、缺失值规则和重放边界。生产密钥签发、轮换、撤销、验证方归属和生产签名验证仍在规划中。这些缺口连同未签名、无关联的 `session-accepted` 响应和未签名的持久确认，使认证门槛保持为默认关闭的提案，并阻断生产切换。普通日志和公开证据必须排除签名、随机数、凭据标识和原始认证交互记录。

alpha.4 的持久确认 JSON 结构明确不带签名。成功表示应用事实和回执已经在发布确认之前持久提交，但 alpha.4 不包含生产存储或发件箱实现，也不作任何崩溃持久性声明。未来的签名确认是独立的命令或配置档，需要云端密钥生命周期以及生产重启证据。MQTT PUBACK 绝不是应用层持久回执。

`acknowledged_position = N` 在恰好一个 `stream_epoch` 内是累计的。它证明从上一个已确认游标之后直到 `N` 的每个位置都已解决。只有当一个位置的应用事实和重放回执都已持久提交，或者先前已接纳的、针对完全相同的网关、流和流代次的有效数据丢失声明明确覆盖该位置时，该位置才算已解决。来自另一个流或另一个流代次的证据不能填补缺口。确认中的批次和摘要仍把 `N` 绑定到其精确的已持久化交付；数据丢失覆盖只能填补中间缺口。

允许乱序持久化，但未解决的位置会阻塞累计游标。云端不得越过该缺口进行确认；越过缺口的确认以 `ACK_PREFIX_GAP` 失败，游标不变。一旦缺失的交付被持久提交，或针对它的有效数据丢失证据被持久接纳，云端就重新计算连续前缀并可以推进。网关只有在针对其当前会话和确切流代次验证了这样的累计确认之后，才可以删除待发送队列中 `<= N` 的位置。

以相同重放身份和摘要重复交付是幂等的。以不同摘要复用同一身份属于线结构有效但上下文无效；在核心归并器中，它以 `DIGEST_CONFLICT` 被隔离，并且得不到成功回执。数据丢失是明确的证据，绝不会使云端伪造样本。

启用网关签名的逐条上行门槛后，认证先于核心归并器执行。云端首先根据经过验证的消息代理/部署授权命名空间选择存储分区，然后才查询四字段持久位置身份。命名空间来自可信入口上下文，绝不来自载荷。禁止不带该命名空间分区的全局查询。线协议重放身份仍是
`(gateway_id, stream_id, stream_epoch, position)`；命名空间是外部的存储与授权分区，不是新的线字段。不同已验证命名空间中相同的四字段身份是相互独立的记录。

对该分区中的每个持久位置，云端保存一条已提交的重放记录，其中包含命名空间绑定、重放身份、一个
`immutable_delivery_digest`，以及由 `session_id`、`session_epoch` 和精确的 13 字段签名对象摘要组成的一个当前会话绑定。来自另一个命名空间的记录以 `AUTHENTICATION_INVALID` 失败。不可变摘要是对恰好
`{schema,gateway_id,credential_generation,message_kind,sent_at_ms,expires_at_ms,stream_id,stream_epoch,position,batch_id,business_digest}`
执行 RFC 8785 JCS UTF-8 后计算的 SHA-256；`schema` 是字面量
`aether.cloudlink.immutable-delivery-replay.v1alpha1`。它有意只从 13 字段上行签名对象中排除 `session_id`、`session_epoch` 和认证材料。原始签名不属于任何一个重放摘要。

该已提交记录表示交付的业务效果和重放记录已经原子持久化。仅完成认证、仅预留或仍待定的记录绝不具有这一含义，不能绕过到期时间，也不得作为已提交状态传给重放归并器。首次接纳时，业务效果、不可变摘要和当前会话绑定先原子提交，然后才有任何成功回执。

在同一个当前会话内，精确的 13 字段签名对象重放是幂等的，不重复任何业务效果。来自新认证的当前会话的交付，只有在不可变摘要完全相同且其 `session_epoch` 严格大于已记录的会话代次时，才可以重新绑定同一个已提交交付。重新绑定会替换唯一的当前会话绑定；它不累积历史绑定，不修改业务事实，也不重复其效果。新绑定必须先持久化，云端才能重新签发绑定到该当前会话的回执。更低的会话代次，或相同会话代次但 `session_id` 不同，都以 `AUTHENTICATION_INVALID` 失败。旧会话也会在重放查询之前就无法通过当前会话检查。

alpha.4 在交付重新绑定过程中保持 `credential_generation` 不可变。因此，凭据轮换需要未来的流代次契约或迁移契约；实现不得用新的凭据代次悄悄重新签名未完成的 alpha.4 交付。`sent_at_ms` 来自边缘持久化的入队事实，在重试或重启时绝不改变。原本存在的 `expires_at_ms` 同样保持不变，原本不存在的值在两个重放摘要中都保持为 JSON null。在该持久身份上，网关、凭据代次、消息类型、发送时间、到期时间、流、流代次、位置、批次或业务摘要有任何变化，都以 `AUTHENTICATION_INVALID` 失败。对已有的已提交记录，这项冲突检查先于到期检查，使攻击者无法把被改动的交付藏在 `MESSAGE_EXPIRED` 之后。

数据丢失证据满足
`first_lost_position <= last_lost_position < earliest_retained_position`。质询请求、心跳和恢复游标数组对每个 `(stream_id, stream_epoch)` 最多包含一项。违反这些规则属于上下文无效，不改变业务事实，也不允许成功的应用回执。

唯一的持久位置身份是
`(gateway_id, stream_id, stream_epoch, position)`。`batch_id` 和 `digest` 是该位置的稳定绑定，不是创建第二身份的字段；修改其中任何一个都不能绕过冲突检测。业务摘要是对恰好
`{protocol_version,message_kind,payload}` 执行 RFC 8785 JCS 后计算的小写 SHA-256。它提供内容完整性和重放比较，不提供发布方认证。机器可读形式是
`profiles/cloudlink/v1alpha1/core.json`。

`expires_at_ms` 是可选的；省略时，该字段不施加消息截止时间。存在时，它必须大于或等于 `sent_at_ms`，否则消息属于上下文无效，失败代码为 `INVALID_EXPIRY_WINDOW`。对于没有已提交重放记录的交付，到期是首次业务效果的硬性门槛。它依据显式的规范 uint64
`evaluation_time_ms` 评估：只有 `evaluation_time_ms < expires_at_ms` 时检查才通过，二者相等即已到期，结果为 `MESSAGE_EXPIRED`。待定的认证记录不改变这一结果。

到期时间授权的是首次效果；它不撤销已经提交的业务事实。在通过通用认证检查且不可变摘要精确匹配之后，已有的已提交交付即使超过原始到期时间，也可以在同一会话中重放，或重新绑定到严格更高的当前会话代次。这条路径只在必要时改变当前认证绑定，并可以在绑定持久化之后重新签发当前会话回执；它绝不重复或刷新业务事实。可移植 TCK 把评估时间作为场景输入提供，绝不读取环境挂钟。

嵌入的 Runtime Manifest 校验值是对去掉顶层 `checksum` 成员的完整清单对象执行 RFC 8785 JCS 后计算的小写 SHA-256。其摘要省略 `sha256:` 前缀，因为外层的校验值对象已经声明了算法。

`envelope.schema.json` 是可复用的结构基础。使用方必须用其消息类型的入口结构定义（`runtime-manifest-report`、`telemetry-batch` 或 `data-loss`）验证上行消息；只使用基础结构不能验证判别字段与载荷之间的关系。

## Integration 扩展

扩展配置档是 `profiles/cloudlink/v1alpha1/integration.json`。它恰好新增两种上行消息类型：

- `integration-topology-snapshot`，其 `payload` 是完整、未改动的
  `aether.integration.topology-snapshot.v1alpha1` 对象；
- `integration-observation-batch`，其 `payload` 是完整、未改动的
  `aether.integration.observation-batch.v1alpha1` 对象。

外层 `gateway_id` 由已认证的 CloudLink 会话绑定。它不会在提供方中立的载荷内重复。提供方 URL、令牌、Cookie、凭据引用、任意提供方对象和认证材料仍被禁止。主题名称和载荷身份仍然不能认证网关。

每个 Integration 实例使用各自独立的拓扑流和观测流。在一个流代次内，绑定
`(gateway_id, stream_id, stream_epoch, message_kind, integration_id)` 不可变。把它复用于另一个 Integration 或另一种消息类型时以 `STREAM_BINDING_CONFLICT` 失败。位置保留既有的 CloudLink 身份和重放规则；本扩展不创建另一套位置或确认协议。

拓扑交付使用
`delivery.batch_id = "topology-" + payload.snapshot_generation`。一个已接纳的拓扑代次绑定到一个精确的 CloudLink 位置和摘要。精确的位置重放是幂等的。更低的拓扑代次出现在新位置时以 `TOPOLOGY_GENERATION_STALE` 失败；在新位置复用已接纳的拓扑代次时以
`TOPOLOGY_GENERATION_CONFLICT` 失败。拓扑载荷是一次完整的原子替换，绝不分片。

观测交付要求
`delivery.batch_id == payload.batch_id`。在同一网关、Integration 和拓扑代次内，一个载荷批次身份绑定到一个精确的流位置和摘要。在另一个位置复用它时以
`BATCH_ID_CONFLICT` 失败；外层与载荷不一致时以 `BATCH_ID_MISMATCH` 失败。云端必须已经接纳了确切的 `integration_id` 和
`snapshot_generation`。更旧的拓扑代次以
`TOPOLOGY_GENERATION_STALE` 失败；尚未见过的更新拓扑代次以
`REFERENCE_NOT_FOUND` 失败。只有在此之后，才依据该拓扑评估实体、点位、质量和值类型引用。

业务摘要仍是对恰好
`{protocol_version,message_kind,payload}` 执行 RFC 8785 JCS 后计算的小写 SHA-256，因此它覆盖整个未改动的 Integration 对象。只有规范化的 Integration 事实和重放回执在发布确认之前已经持久提交，才允许发出成功的既有 `durable-ack`。确认重复精确的网关/会话、流代次、位置、批次和摘要绑定。MQTT PUBACK 仍然只是传输证据。

MQTT 的 262144 字节上限适用于完整的 UTF-8 消息。超大的完整拓扑以 `FIELD_BOUND` 失败；禁止发布部分拓扑。生产方只能在观测边界上把观测划分为具有不同批次身份的独立公开批次，每个批次都独立符合完整消息上限。

接受基础协议版本 `1.0` 并不意味着支持该扩展。发出消息之前，当前 Runtime Manifest 必须在 `protocols` 中声明
`aether.cloudlink.integration.v1alpha1`，云端使用方必须显式启用该确切扩展，并且发布顺序必须先升级云端，再启用边缘发布。alpha.3 使用方会正确拒绝未知的消息类型。混合版本部署保持 Integration 发布关闭；它们不降级，不把拓扑重新解释为数值遥测，也不通过发送业务数据探测支持情况。

alpha 遥测范围目前只为遥测/状态点位携带有限的 JSON 数字值。非数值的 Thing Model 值类型、事件，以及拓扑到模型的点位解析契约都在规划中，不会被静默推断。可选的样本 `model` 值只是投运提示，不足以作为映射权威。

这一范围不冻结精确的有符号 `int64`、`uint64`、十进制、字节或字符串样本编码。JSON 数字不能替代精确的 64 位整数契约。

旧传输仍是默认值。核心 CloudLink 和只读 Integration 扩展不包含物理控制、直接共享内存或直接寄存器操作。独立版本化、默认关闭的
`aether.cloudlink.integration-control.v1alpha1` 扩展由 [Integration Control 规范](/zh/aethercontracts/spec/integration-control-v1alpha1/)定义；它只公开一个受治理的语义电源设定动作，不增加任意远程调用。
