---
title: "受治理的 Home Assistant 电源控制"
description: "了解从对话到边缘端的实验性电源动作、安全校验、证据模型和当前交付限制"
updated: 2026-07-17
status: mixed
---

# 受治理的 Home Assistant 电源控制

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/home-assistant-governed-control.md)。此页面镜像到统一的 AetherIoT 文档中。

[英文版](https://docs.aetheriot.ai/aethercloud/concepts/home-assistant-governed-control/)

未来的 AetherCloud 智能体可以把“关闭卧室灯”这样的请求转换成一个范围严格、类型明确的动作。它不会通过网络发送 Home Assistant 服务名、任意参数、提供方 URL 或访问令牌。

当前源码已经实现这项动作的云端基础。它是实验性的，默认关闭。已有供可信组合根使用的可选、传输中立的 MCP 工具，但尚无公开的智能体、MCP 服务器或用户 API。

## 支持的动作

系统只接受 `device.power.set.v1` 这一种动作。它把当前 `light`、`switch` 或 `fan` 实体的布尔点位 `is_on` 设置为 `true` 或 `false`。

每个请求必须绑定以下全部内容：

- 准确的租户、项目、网关和集成；
- 当前拓扑代次和稳定实体标识；
- 固定的 `is_on` 点位；
- 当前有效的 CloudLink 会话及其凭据代次；
- 已持久化且声明 `aether.cloudlink.integration-control.v1alpha1` 的运行时清单；
- `integration.device.control` 权限；
- 明确确认、策略证据、幂等性、有效期和审计。

旧拓扑代次、旧版 `state` 点位、不受支持的实体类型、已经过期的请求，或未声明的运行时协议，都会以失败关闭方式被拒绝。

## 控制流程

```text
Person describes an outcome
  -> Agent proposes one typed power change
  -> AetherCloud checks permission, confirmation, expiry, topology, and session
  -> AetherCloud signs and records an immutable action offer
  -> AetherEdge makes the final local policy and safety decision
  -> the edge-side Home Assistant adapter attempts the provider action
  -> AetherEdge returns a signed, ordered receipt
  -> AetherCloud records evidence before acknowledging delivery
```

云端不能绕过 AetherEdge。实时状态、确定性规则、安全联锁和物理设备控制始终以 AetherEdge 为权威。云端不可用不得中断已经投运的边缘行为。

## 回执能够证明什么

回执可以说明边缘端接受或拒绝了请求，也可以说明 Home Assistant 提供方接受或拒绝了调用，还可以保留结果未知这一事实。

提供方接受调用，并不能证明灯具已经在物理上发生变化。因此，云端视图始终把物理完成保留为未知，也不会仅凭 Home Assistant 接受了命令就把作业称为成功。后续只读观测可以显示状态变化，但它仍是带新鲜度标记的边缘上报证据，不能证明因果关系。

在符合条件的重连重新下发中，同一个作业标识和意图摘要保持不变。只要已经存在任何回执，云端就不会自动重新下发这个物理效果。无法确定的结果会保持可见，而不会变成重复执行动作的许可。

## 机密边界

Home Assistant 地址、访问令牌、刷新令牌、提供方服务名和任意服务数据只能保留在边缘端。它们不得进入动作意图、CloudLink 载荷、云端持久化存储、审计详情、日志、提示词和智能体上下文。

云端和网关签名会绑定不可变意图、当前会话和有序交付证据。仓库中的 Node.js Ed25519 适配器接收不透明密钥引用和不可导出的密钥对象；生产环境仍需补齐密钥发放、轮换和吊销。

## 本仓库已经实现

- 固定电源目标和回执阶段的闭合领域值；
- 严格的契约解码、规范摘要、签名和 MQTT 主题构造；
- 创建、重新下发、发布和接收受治理动作的应用用例；
- 对当前拓扑、有效会话、凭据代次和已持久化运行时清单的校验；
- 内存中原子的意图、审计、发件箱、回执、重放和确认行为；
- 事务型 PostgreSQL 控制账本，用于保存不可变意图、下发发件箱记录、有序回执证据、精确游标、审计记录和持久确认发件箱记录；强制租户行级安全以及真实数据库并发、回滚、重启和约束测试已经实现；
- Node.js Ed25519 签名与回执验证适配器；
- 显式启用且默认关闭的 `apps/cloudlink` MQTT 组合：它同时要求只读集成扩展和完整的控制依赖集合，在同一条 QoS 1、非保留的传输上发布下发消息，在重连时恢复运行时清单声明，并且只有回执、审计和游标原子持久化之后才发布持久 ACK；
- 可选的 `integration.device.power.set` MCP 适配器：只有同时注入应用命令和可信治理解析器时才存在；
- 可选的集成投影目录和按标识读取的 MCP 资源：它们调用各自独立的应用查询，保持发现有界且稳定分页，并把每个结果都标记为边缘上报副本，而不是实时事实；
- 针对被拒绝字段、重放、顺序、过期目标、有效期和未知物理结果的契约测试夹具与行为测试。

这些仍然只是源码层基础。MQTT 发布确认只是传输证据：它绝不代表提供方已经接受、物理动作已经完成或作业已经成功。没有显式组合根，这些 MCP 适配器就不可访问，而且调用方不能自行提供策略或确认引用。

## 面向用户开放前仍需完成

- 使用受支持的真实消息代理，并在生产重连与崩溃边界下验证默认关闭的控制组合；
- 把事务型 PostgreSQL 账本接入生产组合，并验证下发与确认交付工作进程可跨崩溃恢复；
- 在不暴露密钥材料的前提下完成生产签名密钥的发放、轮换、吊销和观测；
- 使用已发布的 AetherContracts 版本，与 AetherEdge 控制实现完成跨仓库一致性验证；
- 围绕现有可选 MCP 接口组合生产身份与可信的策略和确认解析，或增加另一个调用同一类型化命令的公开接口，不得建立特权捷径；
- 补齐家庭授权、清晰的确认文案、状态解释和恢复指引。

在这些门槛完成前，此能力必须保持默认关闭，也不得被描述成已经可用的家庭控制产品。

独立的拓扑与观测链路见 [Home Assistant 集成](/zh/aethercloud/concepts/home-assistant-integration)。
