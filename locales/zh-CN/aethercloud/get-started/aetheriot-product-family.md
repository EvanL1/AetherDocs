---
title: "AetherIoT 产品系列"
description: "把 AetherCloud 与 AetherEdge、AetherContracts 并列放置，同时不模糊边缘、云、提供商或协议的权威"
updated: 2026-07-16
status: normative
---

# AetherIoT 产品系列

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/get-started/aetheriot-product-family.md)。此页面镜像到统一的 AetherIoT 文档中。

AetherIoT 是伞形项目和公共平台标识。它不是额外的运行时、控制平面或协议。

```text
AetherIoT
├── AetherEdge       edge runtime, Kernel, CLI, and SDK
├── AetherCloud      cloud fusion and governed control plane
└── AetherContracts  public specifications, Schemas, fixtures, and TCK

AetherEMS            industry solution built on the platform
```

原名 `EvanL1/AetherIot` 的边缘仓库迁移到 `EvanL1/AetherEdge`。现有的 `aether-*` crate 和二进制文件、`aether` CLI、`aether-edge-sdk`、配置标识符、安装程序名称和 CloudLink 契约标识符保持稳定。

## 权威不随名称转移

- AetherEdge 仍然是实时点位状态、采集、确定性规则、安全联锁、本地策略和最终物理执行的权威。
- AetherCloud 仍然是期望放置和受治理云端作业的权威。
- 提供商仍然是其资源实际存在与原生状态的权威。
- AetherContracts 仍然是唯一的共享互操作权威。

已发布的标签、证据、来源记录和按摘要固定的 AetherContracts 发布版本不可变。alpha.3 发布版本和已导入的使用方闭包可以保留历史名称 AetherIot。仓库更名不改变它们的一致性状态。

统一的文档入口是 [docs.aetheriot.ai](/zh/overview/ai-native-platform)。其主要栏目是概览、AetherEdge、AetherCloud、AetherContracts、教程、兼容性和路线图。产品仓库仍是实现细节的权威来源。

公开的 [AetherIot 到 AetherEdge 迁移指南](/zh/migration/aetheriot-to-aetheredge)说明了仓库 URL 的变化以及保持稳定的标识符。
