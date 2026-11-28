---
title: "部署拓扑"
description: "AetherIoT 支持把物理权威保留在边缘、只在能创造价值的地方加入云端协调的部署方式。"
updated: 2026-07-16
---

# 部署拓扑

AetherIoT 支持把物理权威保留在边缘、只在能创造价值的地方加入云端协调的部署方式。

## 纯边缘站点

```text
field devices -> AetherEdge -> local applications
                    |
                    `-> embedded history and durable local outbox
```

这种拓扑适用于评估、隔离站点以及不需要云端协调的应用。默认运行时不需要消息代理、PostgreSQL、云账户、浏览器或 AI 客户端。

## 边缘与 AetherCloud 协同

```text
field devices -> AetherEdge == CloudLink ==> AetherCloud -> operator clients
                    ^                         |
                    |                         `-> provider adapters
                    `--- final local policy        and governed jobs
```

AetherContracts 定义共享的 CloudLink 行为。AetherCloud 记录带时间戳的投影，并下发期望状态或受治理的作业。AetherEdge 依据本地策略校验、接受、拒绝、判定过期或应用这些意图。

当前的 CloudLink alpha 路径是实验性的。在认证、签名确认、崩溃持久性和联合一致性门槛全部通过之前，旧版边缘上行链路仍是默认路径。

## 多云控制平面单元

```text
tenant home cell
├── AetherCloud application modules
├── PostgreSQL transactional state
├── encrypted artifact storage
└── capability-driven provider adapters
    ├── provider A
    └── provider B
```

一个部署栈拥有一份独立加锁的基础设施状态。单元不会创建租户级或跨提供方的全局状态文件。每个提供方继续拥有其原生的资源状态。

## AetherEMS 解决方案

AetherEMS 在 AetherEdge 之上叠加能源模型、工作流和应用，并且可以通过公开契约连接到 AetherCloud。它不能改变边缘、云端或契约的权威边界。

## 故障预期

| 故障 | 要求的行为 |
| --- | --- |
| 互联网或云端不可用 | AetherEdge 继续执行已投运的采集、本地历史、规则、告警、联锁和控制 |
| 消息代理不可用 | 本地持久发件箱保留有界的待处理工作；MQTT 交付不等于应用回执 |
| 提供方 API 不可用 | AetherCloud 暴露带类型的失败，绝不把它归一化为一次空的成功观测 |
| AI 客户端不可用 | 确定性行为不变 |
| 云端作业被本地策略拒绝 | 拒绝仍是一条可审计的事实；云端意图永远不会绕过边缘 |
