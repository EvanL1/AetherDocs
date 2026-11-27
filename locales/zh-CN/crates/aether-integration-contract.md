---
title: "aether-integration-contract"
description: "AetherContracts 0.1.0-alpha.4 发布版中实验性集成数据契约的严格 Rust 产品侧绑定"
updated: 2026-11-17
---

# aether-integration-contract

这个 Rust crate 是 AetherContracts `0.1.0-alpha.4` 发布版中实验性
`aether.integration` v1alpha1 契约的严格产品侧绑定。

它与传输方式无关，并提供：

- 封闭的蛇形命名拓扑和观测数据 DTO；
- 严格 JSON 解码和确定性的 RFC 8785 编码；
- 依赖拓扑的身份、引用、质量和值类型校验；
- `int64` 和 `uint64` 的无损字符串编码；
- 规范十进制和无填充 Base64url 校验；
- Aether Foundation 的二进制 64 位浮点数安全语义；
- 由调用方提供、与提供方无关的来源地址与点位类型配置。

AetherEdge 绑定有意对完整消息施加 16 MiB 的安全上限，比契约规定的可移植字段上限更严格。
随附测试按照 `0.1.0-alpha.4` 测试夹具清单中的 SHA-256 值固定每个官方集成测试夹具文件。

这个 crate 不定义 CloudLink 封装，也不提供物理控制路径。

```bash
cargo test -p aether-integration-contract
```
