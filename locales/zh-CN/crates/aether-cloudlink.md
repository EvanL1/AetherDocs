---
title: "aether-cloudlink"
description: "实验性、按摘要固定的公开 AetherContracts CloudLink 子集的与传输无关的实现。"
updated: 2026-07-18
---

# aether-cloudlink

实验性、按摘要固定的公开 AetherContracts CloudLink 子集的与传输无关的实现。它提供严格的封闭式 JSON 解码、RFC 8785 业务摘要、会话/版本/纪元校验、稳定的交付信封、运行时清单校验和复用，以及如实的 `PointSample` 映射。

此 crate 不包含 MQTT 客户端，也不包含设备控制消息。配套的 AetherCloud 编解码器使用同一批导入的测试夹具，但三个公开的行为制品和全部生产互操作性门槛仍未关闭。当前行为与生产限制见 [CloudLink MQTT 参考](/zh/reference/cloudlink-mqtt-v1)。

## 网关签名的上行消息

网关签名的会话使用同一把 Ed25519 网关密钥为已签名的 hello、心跳和每一条持久上行消息签名，包括集成拓扑、观测数据和受治理控制的回执。签名覆盖 AetherContracts 冻结的、恰好 13 个字段的 RFC 8785 投影。

持久记录会保存其原始的发送时间和过期时间、消息类型、流身份、批次 ID、业务摘要和载荷。同一会话内的重试复用完全相同的字节。重启之后，新会话保持这些事实不变，并用新的会话 ID 和更高的纪元重新签名。可信连接器测试模式依赖外部消息代理的证明，并省略载荷认证。

在当前的 alpha 配置中，`session-accepted`、心跳 ACK 和持久 ACK 仍然不签名。添加了 `message_authentication` 的心跳 ACK 会被拒绝；缺失的云到边签名投影仍是一项明确的生产阻塞项。

## 实验性集成扩展

`aether.cloudlink.integration.v1alpha1` 默认禁用。只有在兼容的云端使用方已启用、并且当前运行时清单显式声明了同一扩展标识符之后，才能构造它。

拓扑快照和观测批次使用各自独立的持久流。拓扑是原子的，永不分片。观测批次在大小允许时保持原有身份，否则只在完整观测之间拆分。每个完整编码的 CloudLink MQTT 载荷（包括其交付信封）都必须不超过 256 KiB。两条流都复用现有的应用级持久 ACK 和重放行为；仅凭 MQTT PUBACK 不能删除记录。该扩展不暴露任何命令、任意 RPC 或物理控制能力。

```bash
cargo test -p aether-cloudlink
```
