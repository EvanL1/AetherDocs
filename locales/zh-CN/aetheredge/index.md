---
title: "AetherEdge 产品概览"
description: "AetherEdge 是开源、与行业无关的 Linux 边缘运行时、内核、CLI 和 Rust SDK，此前以 AetherIot 仓库名称发布。"
updated: 2026-11-17
---

# AetherEdge 产品概览

AetherEdge 是开源、与行业无关的 Linux 边缘运行时、内核、CLI 和 Rust SDK，此前以 AetherIot 仓库名称发布。

## 已经实现

- 六个相互隔离的运行时服务，负责数据采集、自动化、告警、历史、应用 API 和上行链路。
- 以共享内存作为当前点位状态与健康状态的权威。
- 使用嵌入式 SQLite 保存期望状态、历史、审计和持久的本地发件箱。
- `aether` CLI、受治理的 HTTP 与 MCP 应用边界、领域 Pack 和 `aether-edge-sdk` 外观。
- 静态组合的现场协议适配器，其确切的特性/运行时 ID 对照表和实现边界见[协议适配器参考](/zh/reference/protocol-adapters)。
- 已签名的 `v0.0.1` 源码、运行时、安装包、CLI 和 SDK 发布版本。

## 实验性能力

- 与消息代理无关的 CloudLink MQTT v1 会话、遥测、重放和应用确认待发送队列。
- 按摘要固定的 AetherContracts `v0.1.0-alpha.4` 消费与公开测试夹具执行。

实验性的 CloudLink 证据不能证明生产认证、签名确认或端到端的崩溃持久性。旧版 MQTT 仍是兼容性默认路径。

## 保持稳定的兼容名称

仓库的显示名称改为 AetherEdge。现有的 crate 名称、二进制文件名称、`aether` CLI、`aether-edge-sdk`、配置键、服务标识、安装程序名称和协议标识符在本次迁移中都不变。

请先选择匹配的[用户旅程](/zh/overview/user-journeys)，然后按[入门指南](/zh/guides/getting-started)启动一个安全的空运行时，按[连接设备](/zh/guides/connect-devices)投运一个通道，或者按[智能体快速入门](https://docs.aetheriot.ai/zh/agent-quickstart/)搭建只读助手工作流。已有部署可以使用[迁移指南](/zh/migration/aetheriot-to-aetheredge)。
