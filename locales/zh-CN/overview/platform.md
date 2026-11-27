---
title: "AetherIoT 平台概览"
description: "了解 AetherIoT 的 AI 原生方向，以及 AetherEdge、AetherCloud、AetherContracts 和 AetherEMS 的职责边界。"
updated: 2026-07-18
---

# AetherIoT 平台概览

AetherIoT 是一个开源、AI 原生的项目标识，代表一组可互操作的产品，它们把人的意图转化为物理空间中受治理、可验证的行为。它不是第四个运行时，也不拥有另一套线协议。

```text
AetherIoT
├── AetherEdge       确定性边缘运行时、内核、CLI 与 SDK
├── AetherCloud      逐步演进的智能体、多云融合与受治理控制平面
└── AetherContracts  类型化规范、结构定义、测试夹具与 TCK

AetherEMS            构建在平台上的能源管理解决方案
```

## 产品边界

| 产品 | 负责 | 不负责 |
| --- | --- | --- |
| AetherEdge | 实时点位状态、数据采集、确定性规则、安全联锁、本地历史与最终物理执行 | 云端放置、提供方资源或公开协议权威 |
| AetherCloud | 期望的放置、受治理的云端作业、租户控制平面状态与多云协调 | 边缘实时状态权威或提供方原生的实际状态 |
| AetherContracts | 语言中立的协议语义、封闭结构定义、测试夹具、稳定失败类别与可执行一致性证据 | 产品运行时行为、凭据、云端持久性或部署策略 |
| AetherEMS | 能源领域模型、工作流和解决方案体验 | 行业中立的平台核心 |

长期的产品体验从对话开始，而不是从固定的配置界面开始：用户描述想要的结果，智能体发现可用能力，生成受治理的方案，再投运确定性的边缘行为。完整的最终用户智能体生命周期尚在规划中；当前测试版提供它所需要的运行时、应用、文档、MCP、契约和云端基础。确切的边界见 [AI 原生平台](/zh/overview/ai-native-platform)。

每个基础设施提供方仍对其资源是否真实存在以及提供方原生状态拥有权威。云端故障不能让已经投运的 AetherEdge 运行时停止。

## 命名规则

- **AetherIoT** 表示完整项目、社区、网站和平台。
- **AetherEdge** 表示原名为 AetherIot 的边缘产品与仓库。
- 现有 `aether-*` crate、`aether` CLI、`aether-edge-sdk`、安装包名称和协议标识保持稳定。
- 历史发行制品和通过摘要锁定的 AetherContracts 包必须逐字节保留；显示名称变化不能改写既有证据。

仓库迁移细节见 [AetherIot 到 AetherEdge 迁移说明](/zh/migration/aetheriot-to-aetheredge/)。

## 文档权威

本站是共同入口。每个产品仓库仍是自身实现细节的权威来源，AetherContracts 仍是共享协议行为的唯一权威来源。统一文档只负责组织和链接这些来源，不复制出第二套规范权威。

接下来可以阅读 [AI 原生平台](https://docs.aetheriot.ai/zh/overview/ai-native-platform/)、[部署拓扑](https://docs.aetheriot.ai/zh/overview/deployment-topologies/)、[典型用户旅程](https://docs.aetheriot.ai/zh/overview/user-journeys/)或运行[边缘端、公共协议与云端联动任务](https://docs.aetheriot.ai/zh/guides/edge-contracts-cloud/)。
