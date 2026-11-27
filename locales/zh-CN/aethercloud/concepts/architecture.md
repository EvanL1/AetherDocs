---
title: "AetherCloud 架构"
description: "了解模块化单体的进程、依赖方向和演进规则"
updated: 2026-07-30
status: mixed
---

# AetherCloud 架构

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/architecture.md)。此页面镜像到统一的 AetherIoT 文档中。

AetherCloud 从模块化单体起步：一个仓库、一组领域与应用模块，以及若干可以独立运行和扩展的小型组合根。这样可以让事务与重构保持局部，不必把长连接边缘会话和请求／响应式 API 负载耦合在一起。

## 目标进程模型

```text
                         application modules
                        /        |          \
                 HTTP API    CloudLink     workers
                    |           |            |
               REST / MCP   CloudLink/MQTT IaC/jobs/projections

                            web console
                                 |
                              HTTP API
```

- `api` 提供 REST、OpenAPI、WebSocket 通知，以及后续的 MCP Streamable HTTP。
- `cloud-link` 负责经过身份验证的 AetherEdge 长连接会话和协议确认。
- `workers` 执行隔离的基础设施计划、刷新提供商资源清单、推进部署和遥测投影、重试工作并投递发件箱。
- `apps/web` 是独立部署的 `cloud.aetheriot.dev` 操作员控制台。它是 API 的一个经过身份验证的客户端，没有特权数据通道。默认产品界面是机群列表／详情／注册，并带有 CloudLink 和最新遥测摘要；概览、身份／会话管理和审计浏览器也已实现。遥测历史、部署和提供商界面在各自的生产应用接口完成组合之前仍不可用。

在仓库基础里程碑中，只有 API 是已配置的长时间运行进程。除公开的存活状态／产品元数据外，它还提供经过身份验证的机群列表／详情／注册、审计 JSON 和有限的可恢复 SSE 快照。组合根显式选择内存或 PostgreSQL 的审计和机群存储库；PostgreSQL 模式使用有界连接池设置、租户事务上下文、强制 RLS、非属主应用角色和经 CA 验证的 TLS。Railway 生产环境依据签发方的 JWKS 验证 Supabase Auth ES256 访问令牌，并且只从管理员控制的 `app_metadata` 派生租户、项目和权限。精确来源 CORS 只允许独立的 AetherCloud 控制台调用 API，不使用 Cookie，也不直接访问数据库。用户和租户成员关系的开通尚不是应用接口。`apps/mcp` 是已经实现的传输中立资源／工具接口，而不是可运行的 MCP 组合根。它把审计、数据导出和受治理作业操作委派给应用用例；MCP SDK 传输与身份组合仍在规划中。CloudLink 包现已提供可独立启动的实验性 MQTT 入口生命周期，由严格编解码器和应用用例支撑，但没有生产环境组合，也没有持久 PostgreSQL 适配器。工作进程仍在规划中。实验性入口不得被描述为生产级 CloudLink 服务。

## 依赖方向

```text
domain <- ports <- application <- interfaces/composition roots
             ^
             +---- adapters
```

领域代码拥有标识符、值、不变量和状态转换。端口描述能力，例如制品存储库或作业账本。应用代码负责授权并协调用例。适配器使用 PostgreSQL、对象存储、身份提供商和网络传输来实现端口。

提供商适配器同样实现应用端口。它们公开已声明的能力和提供商原生扩展，同时不让厂商 SDK 类型泄漏到领域或应用模块中。OpenTofu 是默认的基础设施引擎，Terraform 通过同一引擎端口兼容。

具体基础设施绝不出现在领域命名中。应使用 `JobLedger`，而不是通用数据库端口；应使用 `ArtifactStore`，而不是对象存储 SDK 包装器。

## 初始限界上下文

- 身份与访问
- 提供商目录与云连接
- 云资源清单与规范化资源图
- 放置与部署堆栈
- 机群与拓扑
- 遥测与告警
- 制品与发布
- 部署与期望状态
- 能力作业
- 审计
- 集成与导出

运行可观测性是横切的适配器关注点，而不是业务限界上下文。OpenTelemetry SDK 类型不进入领域或应用包，其信号也不替代 IoT 遥测或审计。

共享代码有意保持精简。限界上下文导出契约，而不是把内部记录暴露给另一个上下文。

## 数据与消息

PostgreSQL 是 AetherCloud 默认的事务性产品存储。网关、CloudLink 会话、遥测、集成投影／控制和审计查询适配器现已具备迁移或存储库基础。API 组合根查询审计和机群投影，并通过 PostgreSQL 以原子方式注册网关身份、签发和消费与指纹绑定的登记声明。活动凭据签发、其他限界上下文的公开写入、完整的生产组合以及工作进程仍在规划中。基础设施状态则不同：每个提供商范围的部署堆栈都使用自己的带锁远程后端。工作进程不持有基础设施状态，并且消费已保存的 JSON 计划，而不是抓取终端输出或原始状态文本。

第一个后台工作实现应使用事务性发件箱和基于 PostgreSQL 的工作进程。只有实测的吞吐量、保留期或使用方隔离确有需要时，才引入消息代理。

第一版实验性 CloudLink 线上契约在 MQTT 上使用版本化的严格 JSON，使 TypeScript 和 Rust 可以执行同一批测试夹具。后续的二进制编码需要 AetherCloud／AetherEdge 联合评审，并且不能改变业务身份或确认语义。序列字段始终是规范十进制字符串，不做不安全的 JavaScript 数值转换。

提供商、状态、凭据和执行边界见[多云融合](/zh/aethercloud/concepts/multi-cloud-fusion)。

## 服务拆分规则

只有在至少实测到以下一项时，模块才会成为单独归属的服务：

- 显著不同的伸缩特征
- 安全或故障隔离边界
- 由另一个团队负责的独立部署节奏
- 进程内无法满足的持久化或区域放置要求

拆分必须保留应用契约，并在改变部署拓扑之前补充故障模式测试。

## IoT 上下文协作

完整的限界上下文图在 [IoT Cloud 能力图](/zh/aethercloud/concepts/iot-cloud-capability-map)中维护。上下文公开应用契约或事件，而不是数据库记录：

```text
Identity and Access -> authorization decisions
Fleet Identity -> CloudLink credential verification
Runtime Catalog -> deployment compatibility and Job eligibility
Artifact Registry -> immutable Deployment revision references
CloudLink -> application ingestion use cases
Application transactions -> audit + outbox
Outbox -> projections, notifications, webhooks, exports, SSE, and WebSocket
```

HTTP、CLI、MCP 和 CloudLink 接口都先解码外部输入，再调用同一套命令／查询应用 API。会改变云端投影的边缘观测是经过身份验证的摄取命令，即使这条源自边缘的事实只是描述性的。查询并不意味着“数据来自边缘，所以可以放心写入”。

## HTTP 与 CloudLink 边界

HTTP 对人员和服务帐户进行身份验证、评估租户授权，并创建期望状态或受治理作业之类的云端意图。它持久化该意图和一条发件箱记录；它从不通过活动的边缘套接字发送。

CloudLink 对网关凭据进行身份验证，并负责会话隔离、协议协商、流序列、持久确认、续传和背压。它读取由应用拥有的邮箱，并调用所属的限界上下文来摄取遥测、清单、部署或回执。它不实现这些业务状态机，也不公开任意 RPC。

这就是即使产品仍是模块化单体，API 和 CloudLink 组合根也彼此独立的原因。请求／响应流量和长连接在伸缩、排空和故障行为上各不相同。工作进程是第三个独立的根，负责发件箱投递、投影、重试、保留和受治理的后台执行。

## 权威与数据放置

| 存储 | 职责 | 明确不具权威性的内容 |
| --- | --- | --- |
| PostgreSQL | 租户／IAM、机群身份、最新清单、会话游标、制品元数据、期望／报告／已应用元数据、作业账本、回执索引、审计、收件箱、发件箱、配额 | 边缘实时点位状态；提供商资源；基础设施状态 |
| 对象存储 | 不可变制品、签名、来源证明、原始／冷遥测批次、大型证据、导出 | 可变聚合状态或凭据 |
| 时序或分析存储 | 历史遥测／事件投影、降采样、聚合 | 当前边缘点位值或告警真相 |
| 部署堆栈远程后端 | 一个提供商范围的带锁基础设施状态 | IoT 机群、遥测或跨提供商的全局状态 |

PostgreSQL 最初可以实现历史存储适配器，但应用端口保持独立，以便日后根据实测的摄取或分析需求选择不同的适配器。

运行追踪和指标通过可选的 OpenTelemetry 适配器和 OTLP 导出器离开组合根。它们的后端没有事务或权威角色。导出器故障不能改变命令、持久确认或工作进程的结果。

期望、报告和已应用是分别持久化的事实。投影始终带有源观测时间和新鲜度。任何数据库选择都不会改变边缘／云／提供商边界所定义的权威。

## 事务性收件箱与发件箱

命令事务以原子方式写入聚合变更、必需的审计记录和发件箱消息。边缘摄取先以原子方式记录去重身份和已接受的业务事实，CloudLink 才对其进行确认。工作进程租用工作、在有界策略内重试，并让死信状态可见。

基于 PostgreSQL 的投递是默认方式。只有实测到吞吐量、保留期或使用方隔离方面的需求后，才引入 Kafka 或其他消息代理，而且绝不改变命令幂等性或持久确认语义。出站 Webhook 的尝试意图在网络 I/O 之前持久化，在有界重试中使用同一个稳定的投递身份，并在重试耗尽后成为可见的死信。数据导出发布不可变的对象引用，而不是通过 API 进程返回无界的历史数据。见[审计与集成](/zh/aethercloud/concepts/audit-and-integrations)。

多云可移植性通过可独立部署的单元和提供商数据库配置档来表达，而不是通过一个取最小公分母的通用数据库 API。一个单元有一个权威的 PostgreSQL 写入方拓扑；租户有明确的归属单元。跨云备份、灾难恢复和租户迁移需要隔离和受治理的工作流。请阅读 [PostgreSQL 持久化与多云单元](/zh/aethercloud/concepts/persistence-and-multi-cloud-cells)。

## 租户隔离

每个租户拥有的聚合、事件、唯一约束、对象前缀、收件箱、发件箱、缓存键和分析分区都带有 `TenantId`。用户或服务帐户接口从经过身份验证的身份解析租户上下文；网关接口从已验证的声明或活动凭据解析租户上下文。只有在该上下文存在之后，请求体和路径中的标识符才用于选择资源。

已实现的 PostgreSQL 适配器把应用强制的作用域、租户复合键和强制行级安全结合起来，作为纵深防御；尚未完成生产组合的上下文必须保持同样的边界。跨租户访问只能通过显式的平台用例实现，并带有单独的权限和审计证据。

实现 CloudLink 集成前，请阅读 [CloudLink MQTT 参考](/zh/aethercloud/reference/cloudlink-mqtt-v1)和 [CloudLink 可靠传输与生命周期](/zh/aethercloud/concepts/cloudlink-and-core-state-machines)。

在增加历史记录或数据摄取前，请阅读 [IoT 业务遥测](/zh/aethercloud/concepts/iot-telemetry)；在增加监测手段前，请阅读[运行可观测性](/zh/aethercloud/concepts/operational-observability)。当前可用能力和仍在规划中的部分以 [IoT Cloud 路线图](/zh/aethercloud/guides/iot-cloud-roadmap)为准。
