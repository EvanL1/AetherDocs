---
title: "PostgreSQL 持久化与多云单元"
description: "把网关、CloudLink 会话和遥测的事务权威放在一个可移植的 PostgreSQL 单元中，同时让分析和提供商配置档独立演进"
updated: 2026-07-29
status: mixed
---

# PostgreSQL 持久化与多云单元

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/persistence-and-multi-cloud-cells.md)。此页面镜像到统一的 AetherIoT 文档中。

PostgreSQL 是 AetherCloud 默认的控制平面事务引擎。这不会让 AetherCloud 成为 PostgreSQL 管理产品，也不会抹掉它的多云提供商适配器模型。

## 职责划分

| 存储 | 拥有 | 不拥有 |
| --- | --- | --- |
| PostgreSQL | 租户／机群元数据、身份、会话游标、收件箱、发件箱、审计、部署和作业账本 | 边缘实时状态、提供商资源、基础设施状态、大型不可变 blob |
| 对象存储 | 制品、来源证明、原始／冷批次、证据、导出 | 可变的聚合或授权状态 |
| 时序／分析适配器 | 实测确有需要之后的历史遥测扫描、降采样、聚合 | 实时点位权威或命令事务 |
| 部署堆栈后端 | 一个提供商范围的带锁基础设施状态 | IoT 产品数据或跨提供商的全局状态 |
| OpenTelemetry 后端 | 采样的运行追踪和指标 | 审计、IoT 遥测、回执或授权证据 |

PostgreSQL 最初可以实现一个有界的遥测历史端口。把历史迁移到 TimescaleDB 或 ClickHouse 不会改变 CloudLink 确认：负责摄取的应用契约仍然必须先建立持久的重放身份和已接受的业务事实，然后才向边缘确认。

## 多云部署模型

多云有三种不同的含义：

1. **可移植单元**：同一套 API、CloudLink、工作进程、PostgreSQL 和对象存储组合可以运行在任何受支持的环境中。
2. **多云管理**：一个单元管理分布在多个云上的提供商范围资源和网关。它的数据库不必跨越这些云。
3. **多云双活控制平面**：多个单元写入同一份租户事务状态。这尚未实现，并且需要就共识、隔离、冲突、延迟和恢复另行决策。

多云管理不需要同步的跨云数据库写入。

默认拓扑是明确的租户归属单元：

```text
Global tenant directory
  ├── Tenant A -> Cell 1 -> PostgreSQL writer + object storage
  ├── Tenant B -> Cell 2 -> PostgreSQL writer + object storage
  └── Tenant C -> Cell 3 -> PostgreSQL writer + object storage

Each cell
  API + CloudLink + workers
          |
          +-- one authoritative PostgreSQL writer topology
```

跨云副本和备份可以改善恢复能力，但在受治理的故障转移隔离旧单元之前，它们不是写入权威。CloudLink 持久确认从不等待无关的跨云基础设施 Saga。

## 提供商数据库配置档

核心提供商描述符可以声明 `managed-postgresql`。未来的配置档发现契约至少会保留以下内容，而不是把它们拍平：

- 提供商原生的引擎／配置档身份；
- 兼容 PostgreSQL 的版本和可选扩展；
- 区域可用性、数据主权和私有连接；
- HA、副本、备份、恢复、加密和维护能力；
- 声明的 RPO／RTO 和观测到的成本证据；
- 提供商特有的带命名空间扩展。

核心仓库绝不按 AWS、Azure、GCP 或任何其他固定的厂商标识符分支。没有托管 PostgreSQL 的提供商日后可以公开受治理的自托管配置档。

## 已实现的网关持久化切片

当前可执行的切片包括：

- 使用参数化 SQL 的 `PostgresGatewayIdentityRepository`；
- 位于窄本地契约之后的真实 `pg` 驱动连接池适配器；
- 显式的注册、待认领和已认领列与检查；
- 租户／项目／网关复合身份和乐观修订版检查；
- 租户事务上下文加强制行级安全策略；
- 原子的聚合、只追加审计和发件箱写入；
- 稳定的证据身份和不含机密的发件箱载荷；
- 带类型的 `gateway-storage-unavailable` 应用失败；
- 不依赖外部服务的脚本化 SQL／迁移行为测试；
- 需显式启用的 PostgreSQL 18 集成测试，使用专用数据库和非超级用户／非 `BYPASSRLS` 的应用角色。

SQL 适配器和迁移已经实现。API 生产组合只为下文描述的审计查询打开 PostgreSQL；它不公开网关 HTTP 路由，也不组合网关写入。发件箱投递、备份／恢复测试、托管提供商配置档和持续供应的集成基础设施仍在规划中。

## 已实现的审计查询部署切片

`PostgresAuditEventRepository` 实现了经授权的审计搜索端口，具备参数化过滤器、无损游标分页、严格的行解码、租户事务上下文、强制 RLS 和带类型的存储不可用结果。API 显式选择内存或 PostgreSQL，并在关闭期间关闭其有界的 `pg` 连接池。

Supabase 部署配置把适配器拥有的五个基线迁移绑定到有序的迁移历史中，把 `aethercloud` 保持在 Data API 的模式之外，把 `aethercloud_app` 供应为非属主／非 `BYPASSRLS` 角色，并固定 Supabase CA。Railway 以该角色通过 `verify-full` TLS 运行 API。数据库已启用强制 SSL。管理员迁移凭据只由一个临时迁移服务使用，不会留在 API 环境中。

这证明的是已部署的、经 Supabase JWT 身份验证的审计读取路径，而不是租户成员关系管理、审计写入路由组合、备份／恢复、工作进程耐久性或其他 PostgreSQL 适配器的生产接线。配置的 bearer 仍然只用于本地测试，会被 Railway 生产组合拒绝。

## 已实现的 CloudLink 会话持久化切片

`PostgresCloudLinkSessionRepository` 同时实现了由应用拥有的会话端口和会话质询端口。在变更会话、游标或质询之前，先锁定租户／项目／网关头行，因此并发进程不会分配到同一个纪元、不会在交接期间丢失游标，也不会打开两个当前会话。

质询签发会持久化生成的确切质询，并在未过期的完全相同重试时返回该记录。有界的请求计数器、单一待处理质询的唯一性、请求冲突检查和封闭的 JSON 约束都在同一个租户事务中强制执行。质询接受先锁定网关头行再锁定质询行，采用严格的 `now < expiry` 边界，以幂等方式消费一个身份验证指纹，隔离前一个会话，在不回绕的前提下递增无符号 64 位纪元，并在提交之前打开替换会话。

所有表都使用租户／项目／网关复合键、参数化 SQL、强制行级安全、有界标识符和无损的 `numeric(20,0)` 协议整数。默认测试使用假执行器。需显式启用的 PostgreSQL 测试使用非超级用户／非 `BYPASSRLS` 角色，覆盖并发签发和接受、重启后可见的状态、约束和租户隔离。该包尚未安装到生产组合根中，迁移编排、凭据、连接池大小、监控和备份／恢复证据仍在规划中。

## 已实现的遥测与 CloudLink ACK 切片

`PostgresTelemetryRepository` 实现了第一个崩溃耐久的遥测接受切片。一个租户范围的事务写入入口幂等身份、批次回执、流和连续游标状态、已接受的记录、必需的审计事件、集成发件箱事件，以及确切的 CloudLink 持久 ACK 发件箱行。重复重放会返回并重新排队同一个已存储的 ACK，而不是插入第二条事实。

该适配器使用参数化 SQL、无损的 `numeric(20,0)` 协议位置、租户复合键和外键、强制行级安全、有界的重排和配额检查，以及基于租约的 ACK 投递存储库。由应用拥有的投递用例校验领取到的适配器输出、按顺序发布、只在发布成功之后记录完成，并以脱敏的代码释放失败项。

需显式启用的 PostgreSQL 18 测试使用非超级用户／非 `BYPASSRLS` 的应用角色，并在提交的前后两侧注入故障。提交前的故障不留下任何遥测事实，也不留下 ACK。提交后结果不确定时留下一条已提交的事实，工作进程随后发布完全相同的 ACK；重放不会产生第二条事实。这一证据只覆盖已接受的遥测。生产数据库、会话适配器和工作进程的组合、数据丢失事实、多样本映射以及完整的生产崩溃耐久发布门槛仍在规划中。

面向网关用户可见的租户范围身份和持久化边界见[网关身份与登记](/zh/aethercloud/concepts/gateway-identity-and-enrollment)。
