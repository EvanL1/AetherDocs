---
title: "aether-sqlite-topology"
description: "私有的服务组合适配器：读取一个权威 SQLite 事务，推导出一致的 SHM 点位/健康清单以及逻辑测量路由和动作路由。"
updated: 2026-07-27
---

# aether-sqlite-topology

私有的服务组合适配器：读取一个权威 SQLite 事务，推导出一致的 SHM 点位/健康清单以及逻辑测量路由和动作路由。

这个包存在的意义，是让本地存储不必选择 SHM 实现类型，也让规则库不必拥有具体的订阅位图。只有服务组合根才应依赖它。

```bash
cargo test -p aether-sqlite-topology
```
