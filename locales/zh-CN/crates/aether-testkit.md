---
title: "aether-testkit"
description: "为 Aether 适配器作者提供可复用的一致性检查和确定性测试替身。"
updated: 2026-07-27
---

# aether-testkit

为 Aether 适配器作者提供可复用的一致性检查和确定性测试替身。

这些测试套件验证实时状态的往返读写和有序批量读取、持久发件箱的 FIFO 与确认行为、有界且保留出处的 `HistoryQuery` 投影，以及请求驱动的 `DataProcessor` 实现中描述符/请求/结果的精确关联。处理器一致性检查还会验证预测输出有限且有序，并要求 `unavailable` 响应不包含任何派生输出。

`MemoryCloudLinkTransport::pair` 是用于会话/重放测试的与传输无关的伪绑定。它会为持久发送产生“传输层已发布”的证据，但绝不伪造云端应用 ACK，因此测试必须显式构造回执。

`ScriptedDataProcessor` 是队列驱动的 `DataProcessor` 测试替身。它报告可配置的健康检查结果，按 FIFO 顺序消费排队的 `ProcessingResult` 或 `PortError` 值，并保留收到的完整 `DataProcessingRequest` 值。因此，应用、适配器和示例测试无需模型运行时或网络服务，就能同时证明发送给处理器的确切帧以及结果/错误路径。

下游适配器的测试针对具体实现调用这些一致性辅助函数，使能力语义在本地边界和外部边界之间保持一致。

```bash
cargo test -p aether-testkit
```

采用 MIT 或 Apache-2.0 双许可证，可任选其一。
