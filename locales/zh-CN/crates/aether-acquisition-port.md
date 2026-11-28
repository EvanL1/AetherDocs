---
title: "aether-acquisition-port"
description: "仅供所有者使用的物理遥测与状态采集写入能力。"
updated: 2026-07-26
---

# aether-acquisition-port

仅供所有者使用的物理遥测与状态采集写入能力。

此 crate 有意与通用的读取端口和应用端口并列存在。只有 `aether-shm-bridge` 直接依赖它并实现 `AcquisitionStateWriter`；IO 在自己的组合根获得这个具体适配器。HTTP、CLI、MCP、AI 以及其他服务进程依赖的是 `aether-ports`，因此不会意外获得写入器 trait。基于 Cargo 元数据的架构测试强制执行这份依赖允许列表。

写入器会在第一次修改 SHM 之前校验完整的 `AcquiredPointSample` 批次，并拒绝未知地址或归其他写入器所有的点位。

```bash
cargo test -p aether-acquisition-port
```

采用 MIT 或 Apache-2.0 双许可证，可任选其一。
