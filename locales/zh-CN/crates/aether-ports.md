---
title: "aether-ports"
description: "面向内核适配器和下游适配器的小型、对象安全的能力接口。"
updated: 2026-07-27
---

# aether-ports

面向内核适配器和下游适配器的小型、对象安全的能力接口。

此 crate 把权威的实时读取、设备命令下发、审计、历史、镜像、持久发件箱、上行发布、I/O 通道投运以及请求驱动的数据处理分隔开来。仅供所有者使用的物理写入器被有意隔离在 `aether-acquisition-port` 中，因此应用接口无法通过这个通用端口 crate 获得它。`ChannelMutator` 让持久的期望配置保持权威地位，并报告可重建的运行时投影、产生的修订号和对账状态，而不指定线上编码。`HistoryQuery` 和 `CovariateSource` 接受有界的逻辑窗口并返回来源出处；`DataProcessor` 接收完整的 `DataProcessingRequest`，并且没有回调 Aether 数据源的途径。它有意不暴露通用的数据库、缓存、模型或脚本运行器 API。宿主在组合边界选择具体适配器。

`CloudLinkSpool` 有意与 `DurableOutbox` 分开：它负责流纪元/位置、稳定的批次身份/摘要、重放以及显式的丢失证据，并且只在收到经过校验的云端应用回执后才删除记录。`CloudLinkTransport` 承载有界的逻辑路由，不向核心调用方暴露 MQTT 主题字符串。没有 CloudLink 命令路由，也没有任意 RPC 路由。

`HistoryQuery` 限定事件时间，但不隐含承诺双时态或按来源纪元的历史；实现必须显式声明更强的时间点语义。同样，制品的时间先后关系也不是历史端口的职责。

错误携带恢复语义，因此调用方可以区分不可用、瞬时、被拒绝、数据无效和永久性失败。

```bash
cargo test -p aether-ports
```

采用 MIT 或 Apache-2.0 双许可证，可任选其一。
