---
title: "aether-edge-sdk"
description: "用于嵌入 Aether AI 原生 IoT 边缘内核的版本化测试版 Facade。"
updated: 2026-07-26
---

# aether-edge-sdk

这是用于嵌入 Aether AI 原生 IoT 边缘内核的版本化测试版 Facade。

它是 AetherEdge 唯一受支持的公共 Rust API，也是唯一提供 SemVer 兼容承诺的 Package。Cargo 因传递依赖要求而拉取的其他 `aether-*` Package 都属于实现细节，不支持下游直接依赖。

Rust Library Target 以 `aether_sdk` 导入。`AetherBuilder` 不提供具体基础设施默认值；Host 必须显式提供权威 Live State、Device Command Dispatcher 和强制 Audit Sink。这样可以让 Redis、PostgreSQL、SQLx、Web Framework 和协议 Driver 保持在 SDK 默认依赖图之外。

`aether_sdk::pack` Facade 公开版本化、Fail-closed 的 Domain Pack Manifest Loader。加载 Pack 会验证兼容性和受限资产目录，但绝不会安装或投运该 Pack。

可选 `local-runtime` Feature 在 `aether_sdk::local` 下公开零外部服务 Adapter。下游应用只依赖这一 Facade；工作区的 Domain、Port、Application 和 Adapter Crate 通过它访问，而不是被直接命名。

```bash
cargo add aether-edge-sdk --features local-runtime
```

```toml
[dependencies]
aether-sdk = { package = "aether-edge-sdk", version = "0.0.1", features = ["local-runtime"] }
```

如果需要固定到精确签名 Release Commit，而不是使用 Registry，请使用匹配的 Release Tag：

```toml
[dependencies]
aether-sdk = { package = "aether-edge-sdk", git = "https://github.com/EvanL1/AetherEdge.git", tag = "v0.0.1", features = ["local-runtime"] }
```

可运行的零外部服务组合见仓库中的 [`examples/minimal-gateway`](https://github.com/EvanL1/AetherEdge/tree/main/examples/minimal-gateway)。

```bash
cargo test -p aether-edge-sdk
cargo test -p aether-edge-sdk --features local-runtime
cargo run -p aether-example-minimal-gateway
```

本项目采用 MIT OR Apache-2.0 双许可证。
