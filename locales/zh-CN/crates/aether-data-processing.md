---
title: "aether-data-processing 组件库"
description: "面向 Aether 数据处理 v1 处理器边界的严格、与传输无关的 JSON 编解码器。"
updated: 2026-07-27
---

# aether-data-processing 组件库

面向 Aether 数据处理 v1 处理器边界的严格、与传输无关的 JSON 编解码器。它在经过校验的领域值与版本化的 RFC 3339/JSON DTO 之间相互转换，对 Aether 已接受的 `DerivedData` 进行编码，并计算 RFC 8785 输入摘要。

v1 线上格式使用精度不高于毫秒的 UTC `Z` 时间戳，保留可选的外部预测 `SourceProvenance.issued_at`，并且只接受 `interval_end` 这一种预测时间戳语义。不符合契约的字段或未知字段会在传输层暴露领域值之前失败关闭。`DerivedDataDto` 和 `encode_derived_data` 有意只支持编码：外部 JSON 载荷不能靠声称自己已被 Aether 接受来越过边界。已接受的信封保留处理器契约、不可变的制品出处、回退元数据、警告代码以及由 Aether 计算的帧质量。

制品的版本/摘要表示身份，而不是时间先后：v1 没有 `trained_through` 或 `available_at`。编解码器也无法把事件时间 `as_of` 变成双时态的历史截面；这些保证属于未来的来源契约和投运契约。

此 crate 不包含 HTTP 客户端、存储访问、回调或模型运行时。协议适配器依赖它；领域层不依赖任何适配器。

见[规范性契约参考](/zh/reference/data-processing-contracts)、[JSON Schema](https://github.com/EvanL1/AetherEdge/blob/main/contracts/data-processing/README.md) 和可选的 [HTTP 适配器](/zh/services/api/adapters/http-data-processor)。

```bash
cargo test -p aether-data-processing
```
