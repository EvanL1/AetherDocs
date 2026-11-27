---
title: "术语"
description: "在为契约或数据库记录命名之前，先明确 AetherCloud 的术语"
updated: 2026-07-16
status: normative
---

# 术语

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/reference/terminology.md)。此页面镜像到统一的 AetherIoT 文档中。

**已应用修订版（Applied revision）** — 边缘端报告已成功激活的修订版。它不是根据下载或云端请求推断出来的。

**能力（Capability）** — 通过应用层开放的带类型查询或命令，带有权限和安全元数据。

**能力作业（Capability job）** — 针对某项边缘能力的持久云端意图，包括到期、幂等性、前提条件、授权证据和审计上下文。

**云连接（Cloud connection）** — 租户范围的配置，选定一个明确的提供商身份、账户或订阅范围，以及机密引用。

**CloudLink** — AetherCloud 与 AetherEdge 运行时之间版本化的、经过身份验证的协议。它不是设备协议。

**控制平面单元（Control-plane cell）** — 一组独立运维的 API、CloudLink、工作进程、PostgreSQL 和对象存储放置，具有一个权威的事务写入方拓扑。每个租户都有一个明确的归属单元。

**已连接（Connected）** — 网关拥有一个足够新的、经过身份验证的 CloudLink 会话。这并不意味着下游设备在线。

**期望修订版（Desired revision）** — 由云端为某个网关或部署组制定的目标修订版。

**部署堆栈（Deployment stack）** — 可以独立规划、锁定、应用、恢复和销毁的最小提供商范围单元，对应一个远程状态。它的隔离键由其租户、项目、云连接和堆栈身份派生。

**边缘端（Edge）** — 一个已投运的 AetherEdge 运行时及其本地权威。边缘端和网关相关，但在协议契约中不可互换。

**登记声明（Enrollment claim）** — 绑定到租户／项目／网关、会到期的引导声明，用于把已注册的网关绑定到凭据请求证据。它不是长期有效的 API 或 CloudLink 凭据。

**网关凭据代次（Gateway credential generation）** — 长期网关身份材料中可以独立吊销的一代。恢复会创建新的一代。

**网关（Gateway）** — 代表一个已登记 AetherEdge 运行时身份的云端资源。

**实例（Instance）** — 由一个网关拥有的物模型实例。

**基础设施引擎（Infrastructure engine）** — 对版本化的提供商模块进行规划的适配器。OpenTofu 是默认引擎；Terraform 通过同一个应用端口兼容。已实现的端口有意不开放任何 Apply 操作。

**已保存的计划（Saved Plan）** — 由引擎生成、针对一个部署堆栈和一个状态的不可变提案。AetherCloud 保留加密的制品引用、摘要、锁证据、版本、变更摘要和策略结果；批准或 Apply 是单独的事实。

**计划制品（Plan artifact）** — 包含引擎已保存计划的加密外部对象。它的二进制内容和原始 JSON 可能包含敏感值，绝不属于日志、提示词、审计载荷或规范化记录。

**放置（Placement）** — AetherCloud 为某个工作负载期望选择的提供商连接、区域和约束。它不能证明资源存在。

**点位（Point）** — 实例中带类型的测量、状态、命令或调节成员。

**投影（Projection）** — AetherCloud 从权威的边缘端或提供商事实派生出的表示，例如遥测历史、已应用状态或云资源盘点。

**提供商适配器（Provider Adapter）** — 能力驱动的插件，拥有提供商身份验证、发现、提供商专用模块、规范化的观测和一致性证据。

**提供商数据库配置档（Provider database profile）** — 针对托管或自托管 PostgreSQL 放置的提供商专用证据，包括版本、HA、备份、加密、网络、扩展、副本、区域、RPO/RTO、成本和原生扩展。它不是应用持久化契约。

**报告状态（Reported state）** — 带时间戳的边缘端观测。它可能过期，并且不会覆盖期望状态。

**站点（Site）** — 可以包含网关的持久物理位置或逻辑位置。

**状态（State）** — 基础设施引擎在部署堆栈与提供商资源之间维护的持久映射。它是远程的、带锁的、版本化的、加密的，并且绝不在提供商连接之间共享。

**租户（Tenant）** — 首要的安全和数据隔离边界。

所有权和身份规则见[资源模型](/zh/aethercloud/concepts/resource-model)。
