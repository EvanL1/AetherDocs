---
title: "接入委托设备提供方"
description: "使用与提供方无关的拓扑和观测契约接入委托设备提供方，包括实验性的 Home Assistant 映射。"
updated: 2026-07-17
status: experimental
---

# 接入委托设备提供方

> 本页是英文原文的简体中文说明。带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 共同构成规范性依据；中文页面只用于任务路由和人工审查。

当 AetherEdge 连接 Home Assistant 等现有本地设备控制器时，使用
`aether.integration`。控制器提供注册信息和状态证据，但不会因此成为云端基础设施，也不能绕过边缘侧策略或物理控制边界。

接入过程从一份完整的拓扑快照开始：

```text
Integration
├── Area
├── Device
└── Entity
    ├── Point: current_temperature (float64)
    ├── Point: target_temperature (decimal)
    └── Point: hvac_mode (string)
```

一个实体不必被压缩成单个标量。每个标准化数据点都声明自己的类型、种类和可选单位。观测批次绑定到确切的快照代次，因此重命名、删除或新发现的实体不能按照无关的目录解释。

对于 Home Assistant，保留注册项编号作为稳定的 `entity_id`，并把当前
`domain.object_id` 写入 `source_address`。用户重命名只改变地址，不改变稳定身份。只能映射已经具有明确数据点描述、并且满足边界限制的属性；不得复制任意属性对象。

严格按照以下质量规则处理观测：

- `good` 和 `uncertain` 包含类型化值；
- `bad` 和 `unavailable` 不包含值；
- 诊断信息可以解释证据为何降级，但不得包含凭据或无边界的提供方载荷。

Home Assistant URL 和凭据始终保存在 AetherEdge 的机密存储中，不会出现在这些文档、云端投影、审计载荷或智能体提示词中。

若要把这些证据投影到 AetherCloud，请使用显式启用的
`aether.cloudlink.integration.v1alpha1` 扩展。该扩展原样封装完整的公开拓扑对象或观测对象。已经通过认证的外层会话提供网关身份；载荷中绝不包含 Home Assistant URL、令牌、Cookie 或凭据引用。

先升级云端使用方，确认当前 Runtime Manifest 已声明该扩展，再启用边缘侧发布。仅完成 CloudLink 1.0 基础协商并不代表支持这个扩展。拓扑是一次原子替换，必须符合 256 KiB 的完整消息上限，不能拆分。观测数组可以在封装前划分成多个相互独立的批次。

使用 `pnpm test:tck` 验证源码检出。公开的 Integration 测试夹具位于
`fixtures/integration/v1alpha1/`，对应的 CloudLink 封装和持久确认示例位于
`fixtures/cloudlink-integration/v1alpha1/`。

受治理控制属于另一份独立且默认关闭的契约。第一个能力范围只允许针对已经接纳的确切拓扑代次、稳定实体和布尔型 `is_on` 数据点执行
`device.power.set.v1`。它要求显式确认、高风险权限、到期时间、幂等、审计和边缘侧最终决定。公开消息不能选择 Home Assistant 域或操作，也不能携带提供方参数、地址、令牌或任意对象。详见[受治理控制规范](/zh/aethercontracts/spec/integration-control-v1alpha1/)以及
`fixtures/integration-control/v1alpha1/` 下的测试夹具。

Home Assistant 返回成功只能记录为提供方已接受请求，不能证明物理设备已经完成所请求的变化。
