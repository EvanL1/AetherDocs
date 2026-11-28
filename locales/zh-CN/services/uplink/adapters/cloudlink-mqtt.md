---
title: "aether-cloudlink-mqtt"
description: "归上行服务所有、与消息代理无关的 MQTT v3.1.1/QoS 1 绑定，用于实验性的 CloudLink 边缘基础。"
updated: 2026-08-01
---

# aether-cloudlink-mqtt

归上行服务所有、与消息代理无关的 MQTT v3.1.1/QoS 1 绑定，用于实验性的 CloudLink 边缘基础。它校验用户选定的端点、TLS/认证设置、主题前缀和网关命名空间；以 `retain = false` 发布；只订阅同一网关的会话/ACK/重放主题；关联 QoS 1 PUBACK；并且独立于本地边缘行为进行重连。

PUBACK 只是传输层证据。专用的 CloudLink 待发送队列只有在收到经过校验的应用级持久 ACK 后才会删除记录。

适配器承载的是已经完成认证的 CloudLink 字节；它绝不伪造签名。网关签名的组合使用会话网关密钥为心跳和所有持久上行消息签名。持久化的交付事实在重启后保持其原始时间戳和业务身份，而新会话会用新的会话绑定为它们重新签名。显式的可信连接器测试配置依赖消息代理一侧的证明，通常省略载荷认证。

实验性集成协议的路由 `up/integration/topology` 和 `up/integration/observations` 仍属于候选主题命名空间，但标准内核没有为它们提供来源组合，也不在其运行时清单中通告它们。两条路由都不提供物理控制。

这个包是 `services/uplink` 之下的私有实现；它不是内核扩展，也不是 IO 的依赖。生产会话的组合仍以实验性身份受到限制。

默认测试不需要消息代理。可选启用的共享消息代理测试装置及其环境变量见 `docs/reference/cloudlink-mqtt-v1.md`。
