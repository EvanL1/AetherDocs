---
title: "物联网云能力图"
description: "梳理 AetherCloud 的限界上下文、权威、用例、存储、边缘交互、风险和交付阶段"
updated: 2026-07-16
status: mixed
---

# 物联网云能力图

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/iot-cloud-capability-map.md)。此页面镜像到统一的 AetherIoT 文档中。

AetherCloud 是面向物联网机群、数据、制品和受治理工作的控制平面。多云基础设施融合是相邻的能力，而不是这些物联网上下文的组织模型。AetherCloud 协调不可靠的广域工作，但不加入硬实时控制回路。

## 当前实现审查

### 已实现

- Node.js 24、TypeScript 5.9、ESM、pnpm 工作区、严格类型检查、代码规范检查、格式化、测试和覆盖率门槛
- 边缘/云/提供商权威值及其测试
- 能力驱动的云提供商描述符、目录、云连接和只读发现基础，以及内存一致性基础设施
- 一个 HTTP 组合根，提供公开的健康/平台路由，以及需要身份验证的审计 JSON/有限可续传 SSE 查询路由
- 智能体文档索引、清单、技能、不变量、ADR 和契约测试
- [网关身份与登记](/zh/aethercloud/concepts/gateway-identity-and-enrollment)中描述的网关身份与登记领域/应用基础
- 传输中立的 CloudLink 会话/心跳领域/应用基础，包含纪元隔离、游标恢复、凭据验证端口和内存适配器
- AetherEdge 运行时清单 v1 的上报/查询领域/应用基础，包含规范校验和验证、单调历史和内存适配器
- 重放安全的物联网遥测批次接入/历史领域/应用基础，包含无损位置、冲突/缺口/乱序处理，以及原子的内存收件箱/历史/审计/发件箱证据
- 以边缘端为权威的告警事实接入与云端工作流投影基础，包含代次/序列排序、可见缺口、仅云端的确认，以及原子的内存适配器
- 可选的 OpenTelemetry 适配器基础，默认空操作，支持内存和 OTLP 模式、有界导出、W3C 上下文提取、低基数接入信号和导出器故障隔离
- 不可变的制品修订版发布/查询基础，包含摘要/内容验证、签名验证器抽象、兼容性元数据、发布通道冲突保护，以及原子的内存审计/发件箱证据
- 单目标的期望/报告/已应用部署基础，包含已发布制品前置条件、无损代次、暂停/恢复/取消/回滚、显式的未知结果、经过身份验证的边缘观测，以及内存审计/发件箱
- 受治理能力作业基础，包含由声明推导的权限/风险、显式确认、排队/下发控制、未知与取消意图、有序且经过身份验证的回执，以及原子的内存审计/发件箱证据
- 租户/项目范围的审计搜索、webhook 订阅、有界的投递/重试/死信/重新投递，以及异步数据导出基础，均带内存适配器；审计搜索通过 HTTP/SSE 暴露
- 传输中立的 MCP 能力/审计资源，以及调用同一批应用用例的受治理数据导出/作业工具

### 已设计或规划中，尚未实现

- 租户、用户、服务账户、RBAC/ABAC、API 凭据和持久审计
- 超出运行时清单/能力基础之外的站点、实例、点位、拓扑和动态分组
- CloudLink 可执行进程、协议消息、生产凭据、PostgreSQL 会话/游标、持久收件箱/发件箱和背压
- 生产遥测/告警的 PostgreSQL 持久化、CloudLink 线路适配器、公开的历史/搜索 API、降采样、导出、指派和评论
- 生产制品存储/上传/API，以及多目标部署的调度、持久化、线路和公开接口
- 生产受治理作业账本/收件箱、CloudLink 交付、运行时清单声明来源、工作进程、公开接口和 AetherEdge 对应实现
- PostgreSQL、对象存储、时序存储、持久发件箱、集成/导出工作进程、生产 webhook 发送器/目的地密钥/签名、实时 SSE、WebSocket、MCP 线路/根及其余工具、机群运维、配额或成本适配器
- 生产网关 CA、KMS 令牌服务、证书吊销、恢复或登记 HTTP 端点

下面的规划项是契约和交付方向，不是可用的端点或协议消息。[物联网云路线图](/zh/aethercloud/guides/iot-cloud-roadmap)区分可执行的能力和缺失的生产接口。

## 能力图

| 限界上下文 | 用户价值与核心聚合 | 权威 | 查询/命令 | 存储需求 | 与 AetherEdge 的交互 | 主要安全风险 | 阶段 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 身份与访问 | 通过 `Tenant`、`Project`、`User`、`ServiceAccount`、`Role`、`Grant`、`Policy` 和 `ApiCredential` 隔离并委派访问 | AetherCloud 拥有成员关系和授权；外部 IdP 可以证明登录身份 | 查询：主体、授权、有效权限。命令：邀请、授予、撤销、轮换凭据 | PostgreSQL；只存哈希或机密引用；审计和发件箱在同一事务中 | 交付有界的授权证据；边缘端仍然执行本地策略 | 伪造的租户上下文、跨租户 IDOR、范围过宽的服务账户、泄漏的密钥 | 最小参与者上下文从第 1 阶段开始；持久 IAM 先于公开的租户 API |
| 机群身份与登记 | 通过 `Site`、`GatewayIdentity`、`EnrollmentClaim`、`CredentialBinding` 和 `RecoveryAttempt` 建立并恢复可信的运行时身份 | AetherCloud 拥有机群成员关系；网关拥有自己的私钥；签发方拥有证书有效性 | 查询：网关和登记状态。命令：注册、签发声明、认领声明、挂起、吊销、恢复 | 目前是内存一致性实现；之后是 PostgreSQL 和由密钥/KMS 支撑的令牌服务 | 一次性引导声明，之后是绑定凭据的 CloudLink 身份验证 | 令牌被当作长期凭据使用、重放、跨租户恢复、已吊销凭据复活 | 第 1 阶段 |
| 机群拓扑与运行时目录 | 通过 `Site`、`Gateway`、`Instance`、`PointMetadata`、`Group`、`TopologyEdge`、`RuntimeManifest` 和 `CapabilityCatalog` 搜索站点并了解运行时兼容性 | 云端拥有分组；边缘端上报实际的实例、点位、运行时和支持的能力 | 查询：拓扑、动态分组、版本分布。命令：编辑站点/分组/标签；经过身份验证的清单接入 | PostgreSQL 存元数据/最新投影；如有需要，对象存储存大型历史清单 | 边缘端发送版本化的清单和能力快照 | 通用关系模型抹掉生命周期；过期清单被当作当前清单；云端改写已投运的通道 | 第 3 阶段 |
| CloudLink 会话与交付 | 通过 `Session`、`SessionEpoch`、`ProtocolNegotiation`、`StreamCursor`、`Inbox` 和 `OutboundMailbox` 维持可恢复、可观测的云边连接 | 云端拥有持久游标和连接投影；边缘端拥有自己未确认的有界缓冲区 | 查询：会话、滞后、版本。命令：身份验证、协商、恢复、心跳、持久接入；绝不提供任意 RPC | PostgreSQL 会话/游标/收件箱/发件箱；活跃套接字只存在于 CloudLink 内存中 | 版本协商、按流有序、确认、重连和流量控制 | 脑裂会话、先确认后持久化、缺口、不安全的 int64 转换、无界队列 | 第 2 阶段 |
| 物联网遥测投影 | 通过 `TelemetryStream`、`TelemetryBatch`、`PointSample`、`DeviceEvent`、`IngestionReceipt` 和 `RetentionClass` 查询重放安全的点位与事件历史 | 边缘端拥有实时值；云端拥有持久的历史事实、保留策略和带新鲜度标记的投影 | 查询：历史、聚合、游标/缺口。命令：原子地接入批次、设置保留策略 | PostgreSQL 存元数据/收件箱/游标和初始历史；对象存储存原始/冷批次；可替换的分析存储 | 边缘端重放流位置；云端只在持久接受之后确认 | 把历史当作实时状态呈现、静默缺口、冲突重放、不安全的 int64 转换 | 第 4 阶段 |
| 告警投影 | 通过 `AlarmOccurrence`、`AlarmProjection`、`Acknowledgement`、`Assignment` 和 `Comment` 搜索边缘告警事实并管理云端工作流 | 边缘端拥有告警事实；云端拥有重放安全的投影和操作员工作流叠加层 | 查询：告警搜索/时间线。命令：接入事实、变更仅云端的工作流；云端不能清除边缘告警 | PostgreSQL 收件箱、告警事实、投影、工作流、审计和发件箱 | 边缘端重放告警代次/序列；云端保留过期/缺口状态 | 云端确认被混同为边缘清除；迟到的清除丢失其前序事实；断连导致告警被清除 | 第 5 阶段 |
| 制品注册表与发布 | 通过 `Artifact`、`Revision`、`Digest`、`Signature`、`Compatibility` 和 `Channel` 发布可验证、不可变的 Pack、配置、模型、规则和应用修订版 | AetherCloud 拥有发布和通道引用；边缘端拥有经过验证的本地缓存 | 查询：元数据、兼容性、来源证明。命令：上传、验证、签名、发布、弃用、撤回、移动通道 | PostgreSQL 存元数据；对象存储存 blob、签名、SBOM、来源证明 | 边缘端按摘要下载，并在本地接受之前验证 | 可变 blob、供应链注入、缺少兼容性信息、证据被删除 | 第 6 阶段 |
| 部署与期望状态 | 通过 `Deployment`、`Rollout`、`Target`、`DesiredGeneration`、`ReportedRevision` 和 `AppliedEvidence` 发布、暂停、恢复和回滚制品 | 云端拥有期望代次和发布过程；边缘端拥有报告事实和已应用事实 | 查询：期望/报告/已应用之间的偏差。命令：启动、暂停、恢复、取消请求、回滚 | PostgreSQL 事务状态和发件箱；对象存储存大型证据 | 发送不可变的修订版引用；边缘端接受/拒绝/下载/验证/应用并上报 | 把下载推断为已应用、迟到的报告让投影回退、部分失败被隐藏 | 第 7 阶段 |
| 受治理能力作业 | 通过 `CapabilityDeclaration`、`Job`、`Confirmation`、`Precondition`、`Attempt` 和 `Receipt` 安全地请求诊断，以及之后的受控工作 | 云端拥有意图/策略/确认；边缘端拥有接受/拒绝/到期/执行/结果 | 查询：作业和回执。命令：创建、确认、下发、请求取消；每条命令都带治理元数据 | PostgreSQL 账本/审计/收件箱/发件箱；对象存储存大型证据 | 只有版本化的能力作业；绝不直接写点位、SHM 或寄存器 | 物理结果未知后盲目重试、任意 RPC 目录、过期的前置条件、绕过确认 | 第 8 阶段 |
| 审计、集成与交付 | 通过 `AuditEvent`、`Subscription`、`WebhookEndpoint`、`ExportJob`、`DeliveryAttempt` 和 `DeadLetter` 追溯操作并投递数据 | 云端拥有自己的审计和投递状态；使用方拥有下游处理 | 查询：审计和投递状态。命令：创建订阅/webhook/导出、重新投递死信 | PostgreSQL 审计/发件箱/投递；对象存储存导出文件；有证据之后才使用消息代理 | 在 CloudLink 接入之后消费应用事件，绝不直接使用套接字 | SSRF、薄弱的 webhook 签名、PII 泄漏、重复投递、审计与业务提交分离 | 审计元数据从第 1 阶段开始；持久集成在第 9 阶段 |
| 运维与成本护栏 | 通过 `FleetHealthProjection`、`Backlog`、`VersionDistribution`、`Quota` 和 `RetentionBudget` 观察机群健康、滞后、版本、部署、漂移、配额、保留和成本 | 每个源事实保留各自的权威；运维视图是带新鲜度标记的投影；云端拥有配额策略 | 查询：健康、滞后、版本、漂移、成本。命令：设置配额、速率和保留策略 | PostgreSQL 配置/汇总以及分析存储 | 综合心跳、清单、接入滞后、部署和作业证据 | 过期的健康状态被当作事实呈现，或配额导致静默丢失 | 逐步推进；第 9 阶段统一 |
| 运维可观测性 | 通过追踪、低基数指标和可关联的结构化日志诊断 API、CloudLink、接入、数据库、工作进程和投递行为 | 每个产品上下文拥有自己的事实；OpenTelemetry 信号只是经过采样的运维证据 | 没有业务命令/查询；组合根配置空操作或 OTLP 适配器 | 通过 OTLP 接入的可选可观测性后端；不承担事务或审计角色 | 只有可选的 W3C Trace Context；baggage 绝不是授权 | 高基数或机密泄漏；导出器故障改变业务结果；把追踪误当作审计 | 适配器基础从第 2 阶段开始，并扩展到第 9 阶段 |
| AI 原生契约与 MCP | 通过 `DocsManifest`、`CapabilityDefinition`、权限/错误/事件结构定义和黄金路径，让智能体发现事实并安全地调用现有能力 | 版本化的仓库契约和应用能力定义是权威；AI 输出不是 | 查询：文档、能力元数据、投影。命令：MCP 工具只转发到已实现的应用命令 | Git 中的 Markdown 和清单；运行时调用使用正常的审计持久化 | 没有另外的 CloudLink 或控制路径 | 把规划中的特性呈现为可调用、工具遗漏风险/确认、智能体绕过授权 | 文档贯穿每个阶段；MCP 在第 10 阶段 |
| 提供商与基础设施融合 | 通过能力驱动的提供商适配器注册表放置云工作负载 | 每个提供商拥有实际资源状态；AetherCloud 拥有受治理的放置意图 | 不在本次物联网能力扩展范围内 | 相互独立的部署堆栈状态 | 仅通过放置和受治理的基础设施作业相关联 | 物联网核心引入固定的厂商枚举或全局状态 | 相邻的既有轨道 |

## 跨上下文依赖

```text
Identity and Access -> authorization decisions
Fleet Identity -> CloudLink credential verification and session fencing
Runtime Catalog -> artifact compatibility and Job eligibility
Artifact Registry -> immutable deployment revision references
CloudLink adapter -> telemetry/deployment/Job application ingestion
All command contexts -> audit + transactional outbox
Outbox -> projections, notifications, webhooks, exports, and SSE/WebSocket
```

各上下文之间交换的是经过设计的契约或事件，而不是内部数据库行。共享代码仅限于稳定的身份、时间、参与者、关联和能力定义值。

## 治理、失败与实现补充

上面的能力表给出用户价值、聚合、权威、用例、存储、边缘交互、风险和阶段。本补充把权限、命令策略、离线结果和当前可执行层明确写出。确切的名称和层级以机器可读的形式记录在 [`ai/application-contracts.json`](https://github.com/EvanL1/AetherCloud/blob/main/ai/application-contracts.json) 中。

| 上下文 | 代表性权限 | 命令风险/确认 | 离线、重试或失败结果 | 当前状态 |
| --- | --- | --- | --- | --- |
| 身份与访问 | `identity.grant.manage` | 高/显式 | 授权以失败关闭方式处理；凭据轮换是幂等的 | 规划中 |
| 机群身份 | `fleet.gateway.create`、`fleet.gateway.enrollment.issue` | 低或高/无或显式 | 令牌过期、令牌无效、幂等冲突、并发修改 | 领域/应用/内存登记基础已实现；生产接口规划中 |
| 机群运行时目录 | `fleet.runtime-manifest.report`、`fleet.runtime-manifest.read` | 低/无 | 保留旧代次；校验和或代次冲突以失败关闭方式处理 | 领域/应用/内存清单基础已实现；生产接口规划中 |
| CloudLink | `cloudlink.session.open`、`cloudlink.session.heartbeat` | 低/无 | 版本被拒绝、纪元被隔离、心跳过期、重连恢复 | 领域/应用/内存会话基础已实现；线路/根/持久性规划中 |
| 物联网遥测 | `telemetry.batch.ingest`、`telemetry.history.query` | 低/无 | 重复批次返回回执；冲突被隔离；缺口触发重放请求 | 部分实现：领域/应用/内存的收件箱-历史-发件箱和 OTel 装饰器已实现 |
| 告警投影 | `alarm.fact.ingest`、`alarm.workflow.acknowledge` | 低/无 | 重复事实是安全的；缺口/过期状态保持可见 | 部分实现：领域/应用/内存的投影和工作流已实现 |
| 制品注册表 | `artifact.revision.publish`、`artifact.revision.read` | 高/显式 | 摘要冲突、修订版/通道竞争或签名失败 | 部分实现：领域/应用/内存的内容-签名-元数据适配器已实现；生产存储/API 规划中 |
| 部署 | `deployment.rollout.start`，以及控制、观测和读取 | 高/启动与回滚需显式确认 | 断连变为未知；迟到的证据完成对账；取消只是意图 | 部分实现：单目标的领域/应用/内存审计-发件箱基础已实现；目标调度器/线路/存储/API 规划中 |
| 受治理作业 | 能力专属权限加 `edge.job.create` | 按能力声明/需要时显式 | 边缘端拒绝/到期、超时未知、迟到的回执消除不确定性 | 部分实现：领域/应用/内存审计-发件箱基础已实现；生产账本/交付/线路/API 规划中 |
| 审计与集成 | `audit.event.read`、`integration.webhook.subscription.create`、`data.export.create` | 高/订阅、导出或重新投递需显式确认 | 投递重试、可见的死信、幂等的重新投递、不可变的导出引用 | 部分实现：审计 HTTP/SSE，加上领域/应用/内存的订阅、投递和导出基础；生产持久性/发送/工作进程规划中 |
| 运维 | `operations.read`、`operations.quota.manage` | 中/降低配额需显式确认 | 过期的投影和配额拒绝都是显式的 | 规划中 |
| 运维可观测性 | 仅部署配置 | 不是产品命令 | 有界的信号丢失；绝不改变业务结果 | 可选适配器和遥测装饰器已实现；更广的根埋点/部署规划中 |
| AI 原生/MCP | 与底层用例相同的权限 | 与底层命令相同的风险和确认 | 规划中的能力会被拒绝，绝不模拟 | 部分实现：能力/审计资源和数据导出/作业工具接口已实现；线路/根、生产身份和其余暴露面规划中 |

阅读[架构](/zh/aethercloud/concepts/architecture)了解进程和持久化边界，阅读 [CloudLink 可靠传输与生命周期](/zh/aethercloud/concepts/cloudlink-and-core-state-machines)了解失败语义，阅读[交付路线图](/zh/aethercloud/guides/iot-cloud-roadmap)了解可执行切片。
