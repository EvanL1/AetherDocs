---
title: "边缘端、公共协议与云端联动任务"
description: "验证 AetherEdge、AetherContracts 与 AetherCloud 的跨仓库联动，同时明确实验性能力和生产门槛。"
updated: 2026-07-16
---

# 边缘端、公共协议与云端联动任务

这项智能体任务验证当前的跨仓库联动路径，但不声称 CloudLink 已经具备生产就绪条件。它先启动一个安全的本地运行时，再验证共享的契约发行版，然后运行现有的产品证据。

## 1. 选择兼容基线

使用被测 AetherEdge 修订所固定的 AetherContracts 发行版：AetherEdge `v0.0.1` 对应 `v0.1.0-alpha.3`，当前尚未发布的源码树对应 `v0.1.0-alpha.4`。把它与使用同一份完整契约锁的 AetherCloud 修订搭配。请在[版本矩阵](/zh/compatibility/version-matrix)中确认确切的组合。

不要依据 `main`、`latest`、版本范围或相邻的检出来判断契约行为。

## 2. 安全启动 AetherEdge

克隆 `EvanL1/AetherEdge`，然后运行不需要硬件的 SDK 组合：

```bash
cargo run -p aether-example-minimal-gateway
```

这个组合不投运任何设备，也不需要消息代理或云服务。如需安装由服务管理器监管的运行时，请按照[入门指南](/zh/guides/getting-started)操作。

## 3. 验证公共契约权威

在该确切 AetherContracts 标签的检出中运行：

```bash
pnpm test:tck
```

然后检查每个产品已经提交的 `aether-contracts.lock.json`。两份锁必须指明相同的发布标签、标签对象、提交、契约包摘要、清单摘要、安全策略和精确导入，并且待导入集合为空。

验证器证明的是发行版分发的完整性。它不能证明生产级编解码器、认证系统、消息代理部署或持久的云端存储。

## 4. 运行边缘端契约证据

在 AetherEdge 中运行有针对性的、与传输无关的编解码器测试：

```bash
cargo test -p aether-cloudlink
```

这条测试路径会验证严格输入、规范摘要、重放行为、会话隔离和当前的遥测映射，不会连接消息代理。

## 5. 运行云端契约证据

在 AetherCloud 中运行默认的仓库检查：

```bash
pnpm check
```

默认路径会验证严格的 TypeScript 编解码器、应用桥接、内存与 PostgreSQL 适配器契约以及文档，不需要数据库、设备、消息代理或云账户。

另有一套需要显式选择启用的本地双进程消息代理测试工具，可作为开发证据：

```bash
pnpm test:cloudlink-alpha-harness
```

MQTT PUBACK 只能证明消息代理在传输层接受了消息。只有在完全匹配的云端应用确认通过验证之后，AetherEdge 才可以删除待发送队列中的记录。当前的 alpha 确认仍未签名，完整的生产级崩溃持久性门禁尚未通过。

## 6. 保持权威边界

- 不要通过 CloudLink 暴露直接的点位、寄存器、SHM 或物理控制操作。
- 不要把上报的能力视为云端授权。
- 不要把期望状态、上报状态和已应用状态等同起来。
- 在联合认证、持久性、一致性、回滚和支持窗口这些门禁全部通过之前，不要移除旧路径。

本任务的结果是可复现的 alpha 集成证据，而不是生产投运回执。
