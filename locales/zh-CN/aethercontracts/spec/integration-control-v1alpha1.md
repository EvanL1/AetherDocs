---
title: "集成控制协议 v1 alpha 1"
description: "默认关闭的受治理设备电源控制：固定意图、显式确认、边缘最终决定和分阶段回执。"
updated: 2026-07-18
id: integration-control-v1alpha1
status: experimental-default-off
version: 0.1.0-alpha.4
normative: true
---

# 集成控制协议 v1 alpha 1

> 本页帮助中文用户理解协议。带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 才是规范性依据。

> 权威来源：[AetherContracts](https://github.com/EvanL1/AetherContracts/blob/main/spec/integration-control-v1alpha1.md)。

Integration Control 扩展定义一个默认拒绝的受治理动作：`device.power.set.v1`。它是一个独立的扩展，名为
`aether.cloudlink.integration-control.v1alpha1`。它不改变只读的
`aether.cloudlink.integration.v1alpha1` 拓扑与观测扩展，CloudLink 1.0 基础协商也绝不会启用控制。

本发布版本有意不定义通用动作、Home Assistant 域、服务名、服务数据对象、提供方 URL、令牌、凭据引用、脚本、模板或任意 JSON 参数。生产方不能把这个固定动作当作承载其他提供方操作的容器。

## 启用与发布顺序

该扩展默认关闭。只有同时满足以下全部条件，才允许发出动作提议：

1. 边缘 Runtime Manifest 明确声明
   `aether.cloudlink.integration-control.v1alpha1`。
2. 边缘使用方、持久作业账本、本地 Integration 连接和本地安全策略均已投运。
3. 云端已经观测到该确切的 Runtime Manifest 协议，并显式启用其生产方。
4. 提议绑定到当前已认证的 CloudLink 会话。

发布顺序是边缘先行。云端绝不能通过发布动作来探测支持情况。不支持或已关闭该扩展的边缘不会收到任何动作消息。关闭扩展会阻止新的执行，但不会抹除先前已接纳作业的审计账本或重放账本。

## 固定意图

`IntegrationActionIntent` 是封闭对象，其结构定义为
`aether.integration-control.action-intent.v1alpha1`。

唯一的 `capability_id` 是 `device.power.set.v1`。其目标恰好包含：

- `integration_id`；
- 已接纳的 `snapshot_generation`；
- 稳定的 `entity_id`；
- `point_key`，固定为 `is_on`。

其参数对象只包含一个布尔成员 `value`。目标通过完整的已接纳 Integration 拓扑解析。代次必须完全一致，实体必须存在，点位必须是布尔状态点位，并且 Home Assistant 配置档只允许 `fan`、`light` 和 `switch` 三种实体类型。

当前的提供方来源地址被有意省略。边缘只有在检查确切的本地拓扑代次之后，才根据稳定实体身份解析它。因此，提供方重命名无法重定向陈旧的云端提议。

治理元数据是固定的，不由调用方选择：

| 字段         | 必需值                       |
| ------------ | ---------------------------- |
| 执行方式     | `governed-job`               |
| 默认授权     | `deny`                       |
| 权限         | `integration.device.control` |
| 风险         | `high`                       |
| 确认         | `required`                   |
| 幂等         | `required`                   |
| 到期时间     | `required`                   |
| 审计         | `required`                   |
| 边缘最终决定 | `true`                       |

带签名的意图还携带有界的授权引用和确认引用。这些引用不能覆盖本地策略。在调用任何提供方之前，边缘先验证云端权威、显式确认、已投运的 Integration、目标和本地安全决定。

## 动作提议

`integration-action-offer.schema.json` 是封闭的云端到边缘消息。它绑定网关、当前会话、凭据代次、作业身份、签发时间、强制到期时间、意图摘要、完整意图和云端认证。

`intent_digest` 是对完整意图对象的 RFC 8785 JCS UTF-8 字节计算的小写 SHA-256，编码为 `sha256:<64 lowercase hex digits>`。`cloud_authentication` 是对
`profiles/cloudlink/v1alpha1/integration-control.json` 中精确有序字段投影的 Ed25519 签名。存在形状正确的签名并不等于已经验证；边缘必须用已配置的云端密钥进行验证。生产云端密钥的签发、轮换、撤销和验证方归属仍在规划中，因此该配置档仍属实验性。

作业重放身份是 `(gateway_id, job_id)`。第一个被持久接纳的提议把该身份绑定到一个 `intent_digest`。以相同身份和摘要重复时返回已存储的回执，并且不得再次调用 Home Assistant。以另一个摘要复用该身份时以 `DIGEST_CONFLICT` 失败。超时、崩溃或含糊的提供方响应成为 `unknown`；这绝不能成为自动产生第二次物理效果的理由。

提议只在 `evaluation_time_ms < expires_at_ms` 时有效。到期时间早于签发时间时以 `INVALID_EXPIRY_WINDOW` 失败；到达截止时间或其后的任何时间都以
`MESSAGE_EXPIRED` 失败。

## Home Assistant 映射

边缘适配器在内部映射该布尔语义动作：

- `true` 选择其固定的提供方开启操作；
- `false` 选择其固定的提供方关闭操作。

操作名称和任何提供方请求对象都不会出现在公开线协议上。调用方不能选择 Home Assistant 域、服务、目标语法或服务数据。提供方 URL 和凭据留在边缘本地机密存储中。

边缘实现必须先持久记录作业身份和意图摘要，再记录尝试阶段的审计证据，然后才调用提供方。调用前审计失败或本地策略检查失败都会阻止调用。

## 回执与证据

`integration-action-receipt.schema.json` 是经过认证的边缘到云端交付，使用既有的 CloudLink 上行信封、重放身份、业务摘要和持久确认规则。其封闭载荷绑定作业、回执序号、能力、精确目标和意图摘要。

允许的证据阶段有：

- `edge-accepted`；
- `edge-rejected`；
- `provider-accepted`；
- `provider-rejected`；
- `unknown`。

每个回执都把 `physical_outcome` 固定为 `unknown`。本契约没有
`physical-confirmed` 或 `succeeded` 阶段。在 Home Assistant 配置档中，成功的提供方响应只证明 Home Assistant 接受了请求。它不能证明无线报文已到达设备、执行器已经动作，或期望的物理状态现已存在。之后的状态观测是另一条提供方证据，仍然不是独立的物理确认。

因此，云端必须把 `provider-accepted`、观测到的状态、物理确认和最终作业结果保留为相互独立的事实。它不得把 `provider-accepted` 变成物理完成或物理执行成功。

`failure_code` 存在时，是非空的大写契约标识符，最长 128 个字符。更长的值属于线结构无效，以 `FIELD_BOUND` 失败；使用方不得先接受生产方的无界值，再静默截断到自身解析器的上限。

## 一致性

规范性结构定义位于 `schemas/integration-control/v1alpha1/`，两个 CloudLink 入口结构定义位于
`schemas/cloudlink/v1alpha1/`。测试夹具和 TCK 冻结唯一动作、封闭的参数面、机密边界、强制治理元数据、默认关闭的启用方式、精确拓扑绑定、到期、重放冲突、回执证据阶段，以及 Home Assistant 的提供方接受边界。

本发布版本不声明生产云端密钥生命周期、产品作业账本、Home Assistant 命令适配器、端到端消息代理证据或物理确认。
