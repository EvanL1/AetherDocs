---
title: "HTTP API 参考"
description: "调用已实现的 HTTP 端点，并把它们与规划中的版本化 API 区分开来"
updated: 2026-08-01
status: implemented
---

# HTTP API 参考

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/reference/http-api.md)。此页面镜像到统一的 AetherIoT 文档中。

API 提供两个公开的元数据路由、五个经过身份验证的机群路由、一个以令牌授权的 AetherEdge 认领路由、两个经过身份验证的审计查询路由，以及两个经过身份验证的只读集成投影路由。遥测目前只以每个网关最新的机群投影形式可见；独立的历史、提供商发现、部署、Webhook／导出和 MCP 路由仍未开放。没有任何路由可以创建、更改或取消集成设备命令；受治理的控制路径没有 HTTP 接口。已实现的 `DiscoverProviderRegions` 应用查询有意不作为 HTTP 契约，直到身份验证、租户上下文和运行时解码围绕它完成组合。

已实现的 `PlanDeploymentStack` 应用命令同样不是 HTTP 契约。没有任何端点接受模块、拓扑、计划制品或 Apply 请求。它未来的路由还需要持久审计、加密的制品存储和生产级的状态锁定引擎适配器。

网关注册、登记声明的签发／消费以及机群读取投影，都通过租户身份边界和强制 RLS 的 PostgreSQL 适配器组合而成。登记令牌只向获得授权并显式确认的操作员返回一次，并且只被有界的 AetherEdge 认领路由接受。读取路由绝不返回它。

## `GET /health`

返回进程存活状态，不读取 PostgreSQL 或其他外部服务。

响应状态：`200 OK`

```json
{
  "status": "ok",
  "service": "aether-cloud-api",
  "version": "0.1.0"
}
```

该响应只证明 API 进程可以处理请求。未来针对已配置适配器的就绪检查将使用单独的端点，这样数据库中断就不会改写存活语义。

## `GET /api/v1/platform`

为客户端和编码智能体返回稳定的产品角色和权威元数据。它不包含租户数据，也不执行任何 I/O。

响应状态：`200 OK`

```json
{
  "name": "AetherCloud",
  "role": "ai-native-multi-cloud-iot-control-plane",
  "authority": {
    "livePointState": "edge",
    "physicalControl": "edge",
    "tenantIdentity": "aether-cloud",
    "desiredRevision": "aether-cloud",
    "placementPolicy": "aether-cloud",
    "actualInfrastructure": "provider"
  },
  "multiCloud": {
    "providerModel": "capability-driven-adapters",
    "executionEngines": ["opentofu", "terraform"],
    "stateIsolation": "deployment-stack"
  }
}
```

这是关于稳定产品边界的元数据，不能证明提供商连接、资源盘点路由或基础设施执行端点已经可用。

## `GET /api/v1/fleet/gateways`

列出经过身份验证的租户和项目中的网关身份。它需要 `fleet.gateway.read`；可选的 `limit` 取值为 1–100，`cursor` 是上一页最后一个网关的 UUID。响应包含登记状态、由 CloudLink 推导出的连接状态、规范字符串形式的遥测计数，以及最新一条已持久化的遥测记录（如果存在）。连接输出包含机器可读的原因、最新的会话证据、协议版本、观测时间、心跳间隔，以及可用时推导出的 `staleAfter` 边界。最近一次已关闭的会话连同其关闭时间和原因保持可见，而不会被改写为 `never-connected`。遥测状态只有 `no-data` 或 `receiving`；两个值都不表示数据源或物理过程是健康的。该投影绝不通过边缘连接读取实时点位状态。

## `GET /api/v1/fleet/gateways/:gatewayId`

从同一个强制 RLS 投影和权限边界返回一个网关。未知或超出范围的身份返回相同的带类型结果 `404 gateway-not-found`。

## `POST /api/v1/fleet/gateways`

用 `gatewayId` 和 `displayName` 注册一个网关身份。它需要 `fleet.gateway.create` 和 `idempotency-key` 请求头。应用命令在 Supabase PostgreSQL 中以原子方式持久化身份、审计证据和发件箱事件。注册不会创建边缘凭据，也不会绕过独立的登记声明工作流。

## `POST /api/v1/fleet/gateways/:gatewayId/enrollment-claims`

签发一个有效期十分钟的登记令牌。它需要 `fleet.gateway.enrollment.issue`、`Authorization`、`idempotency-key`，以及显式的 `x-aethercloud-confirmation: issue-enrollment-claim` 请求头。原始令牌只出现在第一次成功的响应中；完全相同的重试返回 `409 enrollment-token-not-recoverable`，而不是伪造或恢复机密材料。网关、审计和发件箱状态以原子方式一起推进。

## `GET /api/v1/fleet/gateways/:gatewayId/enrollment`

在 `fleet.gateway.enrollment.read` 权限下返回非机密的登记状态。它绝不返回令牌、令牌摘要、公钥或幂等键。

## `POST /api/v1/fleet/enrollment-claims:claim`

消费临时的 AetherEdge 契约 `aether.cloud.gateway-enrollment-claim.v1`。该路由使用短期的登记令牌而不是用户 JWT，并有进程级的防滥用限制。它严格校验 Ed25519 原始公钥，并要求其声明的指纹等于小写十六进制的 `SHA-256(raw 32-byte public key)`。唯一的成功响应是：

```json
{
  "schema": "aether.cloud.gateway-enrollment-claimed.v1",
  "gatewayId": "33333333-3333-4333-8333-333333333333",
  "state": "claimed",
  "revision": 3
}
```

`claimed` 只证明云端以原子方式消费了令牌并绑定了凭据请求指纹。它不表示凭据已激活、CloudLink 已连接、在线或遥测健康。活动凭据签发、信任密钥下发和生产 CloudLink 组合仍受门槛限制。

## `GET /api/v1/audit/events`

只在由已验证主体解析出的租户和项目内搜索。请求不能提供租户范围。它需要 `audit.event.read`。

支持的可选查询字段有 `action`、`cursor`、`from`、`limit`、`resourceId`、`resourceKind`、`subjectId` 和 `to`。`limit` 默认为 50，上限由应用查询限定。游标是规范的十进制审计序号；协议中的 `int64` 值保持为字符串。

响应状态为 `200 OK`，响应体为 `{ "items": [...], "nextCursor": string | null }`。每个条目包含不可变的审计主体、动作、资源、结果、风险、确认、关联标识，以及可选的追踪／证据摘要字段。

## `GET /api/v1/audit/events/stream`

返回同一个经授权的查询结果，编码为 `text/event-stream`。`Last-Event-ID` 请求头从某个审计序号之后恢复；它与查询参数 `cursor` 同时存在时，两者必须一致。每个事件 ID 就是审计序号。

该路由是一个有限的可恢复快照，以 `snapshot-complete` 注释结束。它不是持久的实时订阅，也不能证明通知工作进程或消息代理存在。

## `GET /api/v1/integrations`

列出为已验证主体解析出的租户和项目所保存的集成投影。请求不能提供租户范围。它需要 `integration.projection.read`。

只接受 `cursor`、`gatewayId` 和 `limit` 这三个查询字段；任何其他字段都会返回 `400 invalid-input`，而不是被忽略。`limit` 是 1 到 100 的整数，默认为 50。`gatewayId` 把分页结果限定在一个网关内。`cursor` 是上一页返回的不透明 `nextCursor` 令牌；它编码了签发时所用的网关过滤条件，因此换一个 `gatewayId` 重放它会被拒绝，而不会被悄悄重新分页。

响应状态为 `200 OK`：

```json
{
  "authority": "edge-reported-copy",
  "liveStateAuthoritative": false,
  "items": [
    {
      "gatewayId": "33333333-3333-4333-8333-333333333333",
      "integrationId": "example-integration-id",
      "integrationKind": "home-assistant",
      "snapshotGeneration": "7",
      "entityCount": 24,
      "latestObservationCount": 24,
      "receivedAt": "2026-07-31T09:15:04.000Z",
      "revision": 3
    }
  ],
  "nextCursor": "example-opaque-page-token"
}
```

`nextCursor` 只在还有下一页时出现。与审计路由不同，没有下一页时它会被省略，而不是返回 `null`。`snapshotGeneration` 是协议中的 `int64`，保持为规范的十进制字符串。

带类型的失败有 `400 invalid-input`、`401 unauthenticated`、`403 permission-denied`，以及 `503 integration-storage-unavailable` 或 `503 invalid-integration-repository-result`。

## `GET /api/v1/integrations/:gatewayId/:integrationId`

在相同的权限和租户边界下返回一个集成投影。它不接受任何查询字段。未知或超出范围的身份返回相同的带类型结果 `404 integration-projection-not-found`，因此该路由不会泄露另一个租户中是否存在某个投影。

成功的响应体带有同样的两个权威常量，解析出的 `tenantId`、`projectId`、`gatewayId` 和 `integrationId`，上报的 `topology` 及其 `topologyDigest`，以及 `latestObservations`、`receivedAt` 和 `revision`。`topology` 包含快照的 `schema`、`integrationKind`、`snapshotGeneration`、`observedAtMs`，以及上报的 `areas`、`devices` 和 `entities`；每个实体带有自己的 `points`，其中包含种类、值类型和可选的单位。每条观测带有 `entityId`、`pointKey`、`observedAtMs`、`quality`、可选的带类型 `value` 和可选的有界 `diagnostic`。`snapshotGeneration` 和 `observedAtMs` 是协议中的 `int64` 值，保持为规范的十进制字符串。

`topologyDigest` 是已存储拓扑的小写十六进制 SHA-256。查询在每次读取时都会重新计算它；当存储的摘要与重新计算的摘要不一致时，返回 `503 invalid-integration-repository-result`，而不是提供一份它无法担保的拓扑。

没有任何响应字段携带 Home Assistant 地址、访问令牌或任何其他提供方凭据。应用层不返回它们，响应结构定义中也没有可以放置它们的位置。

带类型的失败有 `400 invalid-input`、`401 unauthenticated`、`403 permission-denied`、`404 integration-projection-not-found`，以及 `503 integration-storage-unavailable` 或 `503 invalid-integration-repository-result`。

## 集成投影能证明什么

两个路由都把 `authority` 固定为 `"edge-reported-copy"`，把 `liveStateAuthoritative` 固定为 `false`，并且是作为结构定义中的常量固定的。它们不是以后某个版本可以悄悄去掉的描述性文字，因此客户端可以依据它们做分支判断。

它们的含义与字面一致。载荷是边缘运行时上报给 AetherCloud 的内容，不是在请求时读取的实时设备状态。AetherCloud 绝不会为了回答这些路由而打开边缘连接。`receivedAt` 是关于这次上报的新鲜度证据，不能证明物理设备当前处于所上报的状态，较新的 `receivedAt` 也不会让数据变成实时数据。请把它呈现为相对的时间长度，而不是裸时间戳；裸时间戳读起来像当前状态。边缘运行时仍然是实时点位状态和物理控制的权威。

## 读取集成投影需要共享的 PostgreSQL 存储

`AETHER_CLOUD_INTEGRATION_PROJECTION_STORE` 选择 `memory` 或 `postgres`，在 API 和 CloudLink 入口中都默认为 `memory`。

在 `memory` 模式下，API 的投影存储库与 CloudLink 入口的投影存储库是两个独立的进程内实例。两者是不同的进程，因此 API 观察不到入口收到的任何内容，两个路由的回答都如同不存在任何投影：目录为空，每个详情请求都返回 `404 integration-projection-not-found`。这是配置所致，不是缺陷；目录看起来不正常时，应当首先检查这一点。

只有当两个进程都针对同一个数据库设置 `AETHER_CLOUD_INTEGRATION_PROJECTION_STORE=postgres` 时，它们才共享数据。即便如此，它们也绝不共用角色或连接字符串：API 以 `aethercloud_app` 身份通过 `AETHER_CLOUD_POSTGRES_URL` 读取，入口以范围更窄的 `aethercloud_cloudlink_ingress` 身份通过 `AETHER_CLOUD_CLOUDLINK_INGRESS_POSTGRES_URL` 写入。入口一侧的说明见 [CloudLink 入口部署](/zh/aethercloud/reference/cloudlink-ingress-deployment)，其中包括它唯一的身份验证就是你的消息代理 ACL 这一事实。

## 错误格式

版本化的应用 API 使用稳定的信封，其中包含代码、人类可读的消息和关联标识：

```json
{
  "error": {
    "code": "permission-denied",
    "message": "permission audit.event.read is required",
    "correlationId": "request-correlation-id"
  }
}
```

机群、审计和集成投影路由视情况返回带类型的 `400 invalid-input`、`401 unauthenticated`、`403 permission-denied`、`404 gateway-not-found` 或 `404 integration-projection-not-found`、`409` 幂等性／冲突、`429 rate-limited` 或 `503` 存储失败，并同时发出 `x-correlation-id`。PostgreSQL 传输和行解码失败会被净化为带类型的 `503` 结果。

## 身份验证

`/health` 和 `/api/v1/platform` 有意保持公开，不包含租户或基础设施实例。机群、审计和集成投影路由需要 `Authorization: Bearer <token>`；AetherEdge 认领路由使用短期的登记令牌而不是用户 JWT。Railway 生产环境设置 `AETHER_CLOUD_AUTH_MODE=supabase-jwt`，只接受 ES256 的 Supabase Auth 访问令牌，并要求它具有所配置的 HTTPS 签发方、`authenticated` 受众和角色、有效的生命周期，以及通过该签发方的 JWKS 解析出的签名。API 不携带任何 Supabase 机密或 JWT 签名密钥。

租户 ID、项目 ID 和权限只来自 `app_metadata.aethercloud_tenant_id`、`aethercloud_project_id` 和 `aethercloud_permissions`。Supabase 的 `user_metadata` 可由用户写入，绝不作为授权证据。缺失、格式错误、重复或超出范围的声明会以失败关闭方式返回 `401`。仅靠自助注册不会获得任何 AetherCloud 访问权限；必须由管理员控制的成员关系流程附加这些声明。

独立部署的 `cloud.aetheriot.dev` 控制台直接通过 Supabase Auth 登录，把得到的短期会话保存在浏览器中，并且只用该访问令牌调用 AetherCloud API。生产 CORS 只允许所配置的控制台来源，不允许携带凭据，并且只暴露关联请求头。浏览器客户端绝不会收到数据库 URL，也不会直接写入 AetherCloud 业务表。

常数时间的配置式 Bearer 适配器仍可用于本地测试，但组合根在 Railway 生产环境中拒绝使用它。`AETHER_CLOUD_AUDIT_STORE` 显式选择 `memory` 或 `postgres`。PostgreSQL 模式要求 `AETHER_CLOUD_POSTGRES_URL` 指定专用的 `aethercloud_app` 角色并使用 `verify-full` TLS；它在每个事务内先应用租户上下文，再查询强制 RLS 的审计表。内存模式仍然只适合本地组合和契约测试。请求体、路径、查询参数或用户可编辑元数据中的租户身份绝不是访问权限的证明。
