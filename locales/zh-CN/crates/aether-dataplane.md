---
title: "aether-dataplane"
description: "aether-dataplane 是 Aether 与业务无关的共享内存核心，嵌入式网关无需 Redis、PostgreSQL、SQLx、路由模型或任何 HTTP 栈即可使用。"
updated: 2026-08-11
---

# aether-dataplane

`aether-dataplane` 是 Aether 与业务无关的共享内存核心。嵌入式网关可以直接使用它，无需 Redis、PostgreSQL、SQLx、路由模型或任何 HTTP 栈。

它负责：

- v5 的 64 字节 `ShmHeader` 和按 32 字节对齐的 `PointSlot` 布局；
- seqlock 一致性读取和单写入器原子更新；
- 带 RAII 清理的只读和可写 mmap 所有者；
- 由所有者控制的心跳和代次隔离；
- 点位质量持久化和代次路径辅助函数；
- 按容量区分、带版本的订阅位图，用于本地唤醒提示；
- 与 ABI 无关、抗撕裂并以持久化重命名落盘的快照序列化。

mmap 构造函数要求物理长度与所声明的活动槽数量精确相符（`64 + 32 × slot_count`），之后才会暴露任何标头或槽的引用。`ShmHeader` 只携带魔数/版本、`slot_count`、所有者心跳、`layout_hash`、写入器代次、发布纪元和保留字节。`PointSlot` 携带值、原始值、时间戳、序列号和质量。其中没有脏状态，没有物理备用容量字段，写入点位时也不会自动更新心跳。

生产读取只做一次 seqlock 尝试。发生竞争时向适配器返回 `None`；数据平面不会在重试循环里自旋。公开的失败使用 `DataplaneError`，使宿主可以区分无效布局、无效路径和操作系统 I/O 失败。只读读取器和通用的 `SlotIo` trait 以 `HeaderSnapshot` 的形式暴露标头值，绝不以可写原子单元的形式暴露。逻辑清单的校验仍是组合层的职责。

```bash
cargo test -p aether-dataplane
cargo tree -p aether-dataplane --edges normal
```

规范的默认文件是 `aether-live-state.shm`。v5 布局是唯一被接受的物理格式。快照 v1 是独立的 `AETHSNAP` 格式，不序列化心跳、写入器代次、发布纪元或 seqlock 状态；更早的 mmap 和快照表示会被拒绝。与行业无关的代码直接依赖此 crate；感知通道的组合属于 `aether-shm-bridge`。
