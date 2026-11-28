---
title: "集成数据协议 v1 alpha 1"
description: "描述边缘本地委托设备提供方的完整拓扑快照和类型化观测；Home Assistant 是首个公开的映射配置档。"
updated: 2026-07-18
id: integration-v1alpha1
status: experimental
version: 0.1.0-alpha.4
normative: true
---

# 集成数据协议 v1 alpha 1

> 本页帮助中文用户理解协议。带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 才是规范性依据。

> 权威来源：[AetherContracts](https://github.com/EvanL1/AetherContracts/blob/main/spec/integration-v1alpha1.md)。

Integration 契约描述来自边缘本地委托设备提供方的完整提供方拓扑快照和类型化观测。它与行业无关。Home Assistant 是第一个公开的映射配置档，但核心契约不包含 Home Assistant 传输对象、服务调用、URL、访问令牌或厂商特定的属性集合。

本模块本身不定义传输，也不定义物理控制命令。独立版本化的 CloudLink Integration 扩展原样承载这些公开对象，同时继承 CloudLink 的会话、重放、摘要和持久确认规则。两个模块都不会把提供方凭据移到 AetherCloud，也不会让云端成为实时状态的权威。AetherEdge 仍负责把提供方证据接纳到本地模型、执行安全策略，并决定任何单独受治理的能力是否可以触及物理世界。

## 拓扑快照

`IntegrationTopologySnapshot` 的结构定义为
`aether.integration.topology-snapshot.v1alpha1`。它把一个 `integration_id` 和
`integration_kind` 绑定到规范的 `snapshot_generation`、观测时间，以及完整的
`areas`、`devices` 和 `entities` 数组。

快照是完整替换，不是补丁：

- `snapshot_generation` 是规范 `uint64`，提供方拓扑变化时必须增大。
- 使用方先原子地验证完整的候选快照，再替换之前已接纳的代次。
- 在之后已接纳的代次中缺失是删除证据；在失败的快照或更旧的快照中缺失则不是。
- `entity_id` 是稳定的注册表身份。`source_address` 是当前的提供方地址，可以在用户重命名后变化，而 `entity_id` 不变。
- 一个实体可以公开多个 `EntityPointDescriptor` 对象。例如，温控实体可以把当前温度、目标温度和运行模式公开为相互独立的类型化点位。

`entity_kind` 和 `integration_kind` 是受约束的标识符，而不是固定的厂商枚举。核心使用方不得依据封闭的提供方列表或实体域列表进行分支。

区域、设备、实体、来源地址以及实体内的点位身份在一个快照中唯一。设备的区域引用，以及每个实体的区域引用或设备引用，都必须能在同一快照内解析。身份冲突先以 `IDENTITY_CONFLICT` 失败，之后悬空引用才以 `REFERENCE_NOT_FOUND` 失败。

## 类型化观测

`IntegrationObservationBatch` 的结构定义为
`aether.integration.observation-batch.v1alpha1`。它把一个批次绑定到定义其实体和点位引用的确切 `integration_id` 与 `snapshot_generation`。每条观测指明一个 `entity_id` 和 `point_key`，提供观测时间戳和质量，并且可以携带一个 `ObservedValue`。

`ObservedValue` 是封闭的可辨识联合：

| `type`    | JSON 表示                                                                    |
| --------- | ---------------------------------------------------------------------------- |
| `boolean` | JSON 布尔值                                                                  |
| `int64`   | 范围 `[-9223372036854775808, 9223372036854775807]` 内的规范有符号十进制字符串 |
| `uint64`  | 范围 `[0, 18446744073709551615]` 内的规范无符号十进制字符串                  |
| `float64` | 基础规范严格解码器接纳的有限 JSON 数字                                       |
| `decimal` | 有界的规范十进制字符串，不带指数、前导零、小数部分尾随零、正号或负零         |
| `string`  | 有界的 Unicode 字符串                                                        |
| `bytes`   | 不带填充的规范 Base64url 字符串，并带有 `encoding: "base64url"`              |

质量为 `good` 和 `uncertain` 时，`value` 是必需的。质量为 `bad` 和
`unavailable` 时，禁止出现 `value`；可选的诊断信息可以解释提供方证据。违反时以
`OBSERVATION_VALUE_INVALID` 失败。

线结构验证之后，使用方先解析明确的拓扑代次，再解析实体和点位，然后检查质量与值的关系，最后检查点位的 `value_type`。绑定不存在时以 `REFERENCE_NOT_FOUND` 失败；判别值与点位描述符不一致时以
`VALUE_TYPE_MISMATCH` 失败。任何使用方都不得把 `"on"` 强制转换为布尔值、截断整数、推断单位，或静默接受格式错误的十进制或字节编码。

## 权威与证据

被接纳的观测是委托提供方报告的证据。对于 Home Assistant，成功的服务结果或状态事件证明的是 Home Assistant 接受或报告了什么；它不是物理执行器已经动作的独立证明。产品必须为边缘决定、提供方接受、观测到的状态，以及物理确认或未知结果保留相互独立的证据阶段。

提供方 URL、访问令牌与刷新令牌、Cookie、凭据引用、原始诊断载荷和任意提供方属性都不在本契约范围内。机密留在边缘本地机密存储中，绝不进入公开测试夹具、审计载荷、提示词、云端投影或 CloudLink 消息。

供人阅读的显示字段和诊断字段必须至少包含一个非空白字符，并且不得包含 C0 控制字符或 DEL。各字段在结构定义中规定的长度限制仍然适用；违反时以 `TEXT_INVALID` 失败。这些字段是证据和标签，绝不是传递原始提供方载荷或终端控制序列的通道。

## 一致性

规范性结构定义位于 `schemas/integration/v1alpha1/`。夹具清单固定有效、线结构无效和上下文无效的示例。语言中立 TCK 冻结身份、引用、代次、类型、质量与值、整数范围、十进制和 Base64url 行为。

本发布版本声明公开数据契约、实验性的 CloudLink Integration 封装及其仓库 TCK。本模块保持只读；独立且默认关闭的 Integration Control 契约由 [Integration Control 规范](/zh/aethercontracts/spec/integration-control-v1alpha1/)定义。本模块不声明完整的 AetherEdge 适配器、云端投影、任一扩展的语言绑定支持，或生产消息代理与重启证据。
