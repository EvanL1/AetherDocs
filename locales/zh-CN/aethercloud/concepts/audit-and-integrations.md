---
title: "审计、订阅、Webhook 投递与数据导出"
description: "公开租户范围的证据和持久的集成工作流，同时不绕过应用用例，也不泄露目标机密"
updated: 2026-07-29
status: mixed
---

# 审计、订阅、Webhook 投递与数据导出

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/audit-and-integrations.md)。此页面镜像到统一的 AetherIoT 文档中。

这个上下文把应用证据转化为可查询的审计历史和受治理的出站工作。它不会让 OpenTelemetry 成为业务账本，也不允许 HTTP、SSE、Webhook、导出或未来的 MCP 接口直接写入某个限界上下文的存储。

## 权威与事务边界

负责的命令事务必须把聚合变更、必需的审计事件和发件箱记录一起提交。集成工作进程稍后消费已提交的发件箱事实。Webhook 失败或 SSE 客户端断开可以延迟外部投影，但不能回滚或改变原始业务结果。

审计是以 `TenantId` 和 `ProjectId` 为范围的只追加证据。运行追踪可以通过追踪标识符进行关联，但采样的 OpenTelemetry 数据既不是授权证据，也不能替代审计。

## 已实现的层

已存在以下可执行基础：

- 不可变的 `AuditEvent` 领域值，带有规范的无损序列、主体、资源、结果、治理、关联和可选的证据摘要；
- 经授权的 `SearchAuditEvents` 应用查询，配有租户／项目范围的内存和 PostgreSQL 存储库；
- PostgreSQL 审计查询事务：设置租户上下文、依赖强制 RLS、校验返回的每一行、无损分页，并返回带类型的不可用结果；
- 经过身份验证的 `GET /api/v1/audit/events` 和有限的可恢复 `GET /api/v1/audit/events/stream` SSE 快照，两者调用同一个查询；
- `WebhookSubscription` 的创建、禁用和获取用例，使用稳定的目标引用和有界的事件允许列表；
- `WebhookDelivery` 生命周期，带有持久化的在途意图、稳定的投递幂等键、有界重试、尝试证据、可见的死信状态和需显式确认的重新投递；
- `DataExport` 生命周期，用于有界的审计、告警或遥测历史导出，带有高风险的显式确认请求、工作进程结果上报、不可变对象引用、摘要和无损字节长度；
- 内存一致性适配器，为应用测试以原子方式保留聚合、幂等性、审计和发件箱证据。

SSE 端点有意设计为有限快照。`Last-Event-ID` 通过同一个应用查询从审计序列处恢复，但目前还不存在持久的实时通知进程。

## 状态机

```text
Webhook subscription: active -> disabled

Webhook delivery:
pending -> delivering -> delivered
                     \-> retrying -> delivering
                     \-> dead-lettered -> pending (explicit redrive)

Data export:
queued -> running -> ready
                  \-> failed
queued/ready/failed -> expired
```

在调用外部发送方之前，尝试先被写为 `delivering`。因此，崩溃可能留下一次需要工作进程对账的在途尝试；绝不能悄悄把它当作从未尝试过。投递身份是跨重试、面向接收方的幂等键。冲突的入队或重新投递按失败关闭处理。

导出响应绝不包含原始导出字节。`ready` 只公开有界的对象引用、内容摘要和十进制 `uint64` 字节长度。客户端要取回内容，仍然需要单独的经授权下载能力和生产对象存储适配器。

## 目标与 SSRF 边界

应用和领域记录包含 `WebhookDestinationId`，绝不包含请求任意提供的 URL 或明文签名机密。生产发送方必须从租户范围、由机密存储支撑的目标注册表解析该引用，要求 HTTPS，在 DNS 解析和重定向之后拒绝私有／链路本地／保留地址目标，限制响应字节数和时间，对规范化的投递进行签名，并防止凭据被转发。该发送方和注册表仍在规划中；当前的内存发送方仅用于测试。

## 尚缺的生产接口

生产审计写入路由的组合、事务性发件箱消费、目标注册表、机密轮换、生产 HTTP 发送方、签名、DNS／重定向 SSRF 防御、重试租约、实时 SSE 通知器、WebSocket、对象存储、导出工作进程、保留／配额强制执行，以及公开的 Webhook／导出 API 仍在规划中。API 可以使用非属主的强制 RLS 角色和经过验证的 TLS 选择 PostgreSQL 审计查询存储库。Railway 生产环境通过 JWKS 验证 Supabase Auth ES256 访问令牌；只有管理员控制的 `app_metadata` 可以提供租户、项目和权限范围。租户成员关系的开通、角色管理，以及除短期令牌到期之外能感知吊销的授权仍在规划中。

使用 [HTTP API 参考](/zh/aethercloud/reference/http-api)和[应用契约目录](/zh/aethercloud/reference/application-contracts)，查找受支持的集成操作、所需权限和当前实现状态。
