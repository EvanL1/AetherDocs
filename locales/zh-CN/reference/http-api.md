---
title: "HTTP API"
description: "唯一的远程网关、各服务自有的 OpenAPI、身份验证与兼容性约定"
updated: 2026-07-14
---

# HTTP API

AetherEdge 运行六个 HTTP 服务，但远程应用只有一个网络边界：6005 端口上的 `aether-api`。本页说明该网关、各服务自有的契约，以及贯穿其中的安全约定。

> 每个服务生成的 OpenAPI 文档，都是其路径、参数、请求与响应结构定义、
> 状态码、媒体类型和操作级安全要求的权威来源。
> `aether-api` 是 Swagger UI 的唯一所有者：
> 它通过固定的网关路径呈现全部六份文档。

## 内置文档

| 服务 | 默认边界 | 环回源文档 | 网关 Swagger 文档 |
|---|---|---|---|
| `aether-io` | 环回 | `http://127.0.0.1:6001/openapi.json` | `http://<edge-host>:6005/openapi/io.json` |
| `aether-automation` | 环回 | `http://127.0.0.1:6002/openapi.json` | `http://<edge-host>:6005/openapi/automation.json` |
| `aether-history` | 环回 | `http://127.0.0.1:6004/openapi.json` | `http://<edge-host>:6005/openapi/history.json` |
| `aether-api` | 远程网关 | — | `http://<edge-host>:6005/openapi/gateway.json` |
| `aether-uplink` | 环回 | `http://127.0.0.1:6006/openapi.json` | `http://<edge-host>:6005/openapi/uplink.json` |
| `aether-alarm` | 环回 | `http://127.0.0.1:6007/openapi.json` | `http://<edge-host>:6005/openapi/alarm.json` |

Swagger 只能通过 `aether-api` 的 `swagger-ui` Cargo 功能选择启用。要在安装包构建中包含这个唯一的网关界面，请使用：

```bash
./scripts/build-installer.sh <version> <arch> -s rust --enable-swagger
```

启用后，`http://<edge-host>:6005/docs` 提供一个文档选择器，涵盖网关和全部五个环回服务。网关会把各服务的路径改写到其经过身份验证的 `/api/v1/<service>` 命名空间下，因此 Swagger 的“Try it out”绝不会指向环回端口。网关文档是公开路由，但受保护的操作仍然需要其声明的凭据。只在受信任的投运或开发网络中启用该界面。

## 暴露边界

只有 `aether-api` 是面向远程的服务。其经过身份验证的应用网关公开五个固定命名空间，并且只把它们转发到已配置的环回服务：

| 远程命名空间 | 服务本地所有者 |
|---|---|
| `/api/v1/io/*` | `aether-io` |
| `/api/v1/automation/*` | `aether-automation` |
| `/api/v1/history/*` | `aether-history` |
| `/api/v1/uplink/*` | `aether-uplink` |
| `/api/v1/alarm/*` | `aether-alarm` |

转发目标由命名空间决定，绝不由调用方输入决定。启动校验只接受显式的环回 HTTP 源。网关保留原始的已签名 Bearer 令牌，以及少量已记录在案的命令请求头和条件请求头；它会丢弃调用方提供的操作者请求头，并对上游传输错误做脱敏处理。各服务的直连端口仍属内部端口，不得从设备上对外发布。

生成的应用和下游产品界面使用 6005 端口上对应的带网关前缀的路径。经网关代理的 OpenAPI 保留每个服务的操作结构定义和安全声明，只把受支持的路径改写到该固定命名空间下。这并不会让服务本地端口成为受支持的客户端接口。缺失的操作仍然必须通过所属的应用边界添加，而不是由界面自行发明、直接挂接到 SHM，或实现为一次存储写入。

环回是部署边界，不是身份凭据。IO 通道投运以及部分自动化和告警命令会在操作边界上进行身份验证，但 io、history、uplink、automation 和 alarm 中的许多其他本地管理路由仍然依赖主机隔离。不要因为某个服务的部分操作声明了 Bearer 方案，就推断其直连端口可以安全暴露。

当前的完整通道配置查询可能包含协议参数和每个通道的日志配置。在提供经过脱敏、经过身份验证的应用查询能力之前，它仍是一项兼容性债务。请让 io 端口保持在环回上，不要把该响应代理给不受信任的客户端。

## 身份验证模型

`aether-api` 使用已签名的访问 JWT 保护其管理路由。REST 客户端只在标准请求头中发送它：

```http
Authorization: Bearer <access-token>
```

登录、刷新令牌生命周期端点、服务健康检查，以及（在编译进来时）文档路由，构成了网关 OpenAPI 文档所描述的公开传输面。除非显式启用，否则公开注册处于禁用状态。必需的 `JWT_SECRET_KEY` 至少要有 32 字节，并且必须在源代码管理之外进行管理。

网关 WebSocket 同样需要身份验证。文档中记载的 `?token=...` 回退方式只在真正的 WebSocket 升级请求中被接受；REST 查询字符串中的令牌会被拒绝。不支持通过 WebSocket 写入控制。

每次订阅更新都带有 `values`、`ts` 和 `quality`，均以点位 ID 为键。样本比 `SHM_WRITER_STALE_AFTER_MS`（默认 30 秒）新时，`quality` 为 `good`；一旦不再满足，即为 `uncertain`。通道停止响应后，最后一个值会原样保留，因此单凭 `values` 无法区分实时读数和已冻结的读数——在依据数值采取行动之前，先按 `quality` 判定每个点位。

每项受治理的变更都会先被记录，然后才报告为完成；每个服务通过 `GET /api/audit/events` 对自己的审计轨迹负责——经由网关可通过 `/io/api/audit/events` 和 `/automation/api/audit/events` 访问。可按 `request_id`、`actor_id`、`capability`、`outcome`（`rejected`、`attempted`、`succeeded`、`failed`）、`since_ms` 和 `until_ms` 过滤；用 `limit`（上限钳制为 1000）和 `offset` 分页。事件按从新到旧返回，`total` 统计的是全部匹配项，而不是返回的这一页。被拒绝的命令同样会被记录，因此一次被拒的尝试是可见的，而不是不留痕迹。无法识别的 `outcome` 会返回 400，而不是作为过滤条件被忽略，因为悄悄放宽审计查询，回答的是一个比所问更窄的问题。

每个访问令牌都带有必需的 `scope` 声明，列出它可以行使的权限。角色仍是上限，scope 在其范围内做选择，因此 scope 绝不会授予角色所没有的权限。缺少该声明的令牌会被拒绝，而不是被当作拥有全部权限。

网关在转发任何命名空间请求之前都要求提供访问 JWT。随后由所属服务应用针对具体操作的授权：

- io 通道的创建、更新、删除、启用和禁用需要带有 `io.channel.manage` 的 Admin 或 Engineer Bearer JWT；
- 自动化设备操作接受 Bearer 访问 JWT，或专用的 `AetherService <token>` 上行链路凭据；
- 自动化规则管理和手动执行需要 Admin 或 Engineer Bearer JWT，并具备该操作所记载的能力；
- 告警规则变更和告警解除需要 Admin 或 Engineer Bearer JWT；
- 历史配置和存储变更（`PUT /history/config`、`PUT /history/storage`、`POST /history/storage/test` 和 `POST /history/storage/reconnect`）需要带有 `history.config.manage` 的 Admin 或 Engineer Bearer JWT，以及 `x-aether-confirmed: true`；
- 上行链路配置变更（`POST /uplink/mqtt/config`、`POST /uplink/mqtt/disconnect`、`POST /uplink/mqtt/reconnect`、`POST /uplink/certificate/upload` 和 `DELETE /uplink/certificate/{cert_type}`）需要带有 `uplink.config.manage` 的 Admin 或 Engineer Bearer JWT，以及 `x-aether-confirmed: true`。MQTT 配置中还保存着转发过滤器，以及上行链路用自身凭据调用的内部服务 URL，因此这项权限决定了哪些数据离开站点，以及该凭据被发往何处；
- 由调用方触发的上行发布（`POST /uplink/alarm/broadcast` 会把所提供的告警消息加入队列，`POST /uplink/inst-sync` 会发送实例列表）需要带有 `uplink.message.publish` 的 Admin 或 Engineer Bearer JWT，以及 `x-aether-confirmed: true`；
- `aether-history` 和 `aether-uplink` 自身没有命令边界，因此网关会在转发之前对上述历史和上行链路变更进行授权和审计。这两个服务上的任何其他非读取路由都按同样方式处理，归入该服务的配置能力之下；
- 转发而来的身份请求头和环回可达性都不能满足这些受保护的命令边界。

## 受治理命令

能够更改通道配置、设备、规则、处理或告警状态的命令，会在 OpenAPI 中声明其风险、权限、幂等性、确认和审计策略。应用命令边界负责强制执行这些声明；HTTP 处理函数不得直接写入 SHM 或存储。

对于受保护的变更，请严格遵循操作的结构定义。视操作而定，显式确认通过 `x-aether-confirmed: true` 或请求体传递。文档有相应说明时请提供 `x-request-id`，让重试和审计记录共用一个稳定的关联 ID。绝不要假设确认或身份可以通过未声明的请求头转发。

已被接受的受治理命令，会在 OpenAPI 所描述的响应中包含其 `request_id` 和审计结果。如果下发或持久化已经成功，但最终审计记录追加失败，该操作仍视为已接受，其审计状态会被标记为不完整且不可重试。请保留关联 ID，不要自动再次提交该命令。如果连“已尝试”这条审计都无法记录，则会在下发之前失败关闭。

由网关审计的历史或上行链路变更会保留服务的响应体。网关会附加它所记录的 `x-request-id`（拒绝时也会附加），并在已转发的变更上附加 `x-aether-audit: recorded` 或 `incomplete`。当拒绝或尝试无法被记录时，它不做转发，直接以 `503 COMMAND_AUDIT_UNAVAILABLE` 作答。即使调用方先断开连接，最终记录也会写入。带有 `response_status=502; upstream_outcome=unknown` 的 `failed` 事件表示转发在传输途中中断，因此重试之前请先回读该服务的配置。审计明细只记录操作名称和响应状态，绝不记录请求体，因此存储凭据、消息代理密码和证书文件都不会进入审计轨迹。在各服务共用一个 SQLite 数据库的情况下（受支持的安装方式均如此），请在 `/api/v1/io/api/audit/events` 上用 `capability=history.config.manage`、`capability=uplink.config.manage` 或 `capability=uplink.message.publish` 读取这些事件。

设备命令被接受，表示本地命令平面接受了该请求；这并不证明物理设备已经执行。请使用反馈遥测进行闭环确认。

对于通道投运，SQLite 中的期望配置与正在运行的协议运行时是有意区分开的。对已有资源的变更，只有带上必需的 `x-aether-expected-revision` 比较并设置保护才能继续，该修订取自最近一次通道读取。缺少修订的请求会被拒绝，而不会被自动提升为数据库当前的最新修订。期望状态提交之后，已接受的响应可能报告运行时投影处于等待激活或降级状态；请依据 `request_id` 和 `resulting_revision` 进行对账，而不要自动重复这一非幂等变更。确切的请求头、回执字段和各操作的状态码由 I/O OpenAPI 文档定义。

自动化规则变更的请求体同样需要 `expected_revision`，其值取自最近一次规则查询的 ETag 或 `x-aether-configuration-revision`。调用方省略修订时，服务绝不会用自己当前的最新修订来代替。

## 响应兼容性

大多数业务处理函数返回共用的成功信封：

```json
{ "success": true, "data": { "...": "..." }, "metadata": { "...": "..." } }
```

`metadata` 为空时会被省略。健康探测、服务横幅、WebSocket 升级、CSV 导出以及严格的数据处理响应有意使用各自的表示形式。

错误响应仍在迁移中，可能使用以下兼容形式之一：

- `{ "success": false, "error": { "code": 400, "message": "..." } }`；
- `{ "success": false, "message": "..." }`；
- 带版本的数据处理 `{ "error": { "code": "...", ... } }` 形式；
- 带有 `error_code`、`category` 和 `retryable` 的扁平 `AetherError` 映射。

客户端必须把该操作的 OpenAPI 状态码和响应内容类型视为权威，并容忍文档所记载的兼容形式。不要根据另一个服务推断出通用的错误结构定义。

## 贡献者契约

当路由、结构定义、安全规则、响应或功能开关发生变化时，请在同一次变更中更新所属服务生成的 OpenAPI 注解和测试。远程示例必须使用带网关前缀的形式，本地契约测试则可以使用所属的环回服务。不要在 Markdown 中再添加一份端点列表。运行六服务一致性检查：

```bash
./scripts/check-openapi-contracts.sh
```

该检查会验证每个服务自有的 OpenAPI 契约，并编译唯一的网关 Swagger UI。它也在 Rust CI 工作流中运行。
