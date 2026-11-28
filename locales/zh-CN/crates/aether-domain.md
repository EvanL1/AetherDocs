---
title: "aether-domain"
description: "Aether 边缘内核中与行业无关的 no_std 领域类型。"
updated: 2026-07-27
---

# aether-domain

Aether 边缘内核中与行业无关的 `no_std` 领域类型。

此 crate 定义点位地址和样本、强类型标识符、质量状态、时间戳、经过校验的控制命令，以及 Aether 数据处理契约。处理模型把应用侧的 `ProcessTaskRequest` 与完整的处理器侧 `DataProcessingRequest` 分开，并且在 `ProcessingResult` 被接受为 `DerivedData` 之前一直把它视为不可信。

此 crate 保持 `no_std`；自有的处理帧使用 `alloc` 集合。它不依赖异步运行时、数据库、网络、服务、模型框架或硬件。

当你实现的 Aether 宿主、下游集成、协议适配器或固件组件需要交换稳定的边缘领域值时，使用它。

```bash
cargo test -p aether-domain
cargo tree -p aether-domain --edges normal
```

采用 MIT 或 Apache-2.0 双许可证，可任选其一。
