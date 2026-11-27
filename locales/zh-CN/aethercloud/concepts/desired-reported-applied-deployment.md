---
title: "期望、报告与已应用部署"
description: "推出不可变的制品意图，而不把下发、连接或超时当作边缘端已应用的证据"
updated: 2026-07-16
status: mixed
---

# 期望、报告与已应用部署

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/desired-reported-applied-deployment.md)。此页面镜像到统一的 AetherIoT 文档中。

面向单个网关目标的云端领域与应用基础以及原子内存适配器已经实现。它们提供已发布制品查找、无损的期望代次、相互独立的报告事实和已应用事实、暂停、恢复、取消请求和回滚意图、经过认证的边缘观测、未知结果、重放与冲突处理、租户范围内的查询、审计证据和发件箱证据。

这不是端到端的推出。PostgreSQL、生产审计与发件箱、CloudLink 出站交付和观测信封、目标快照、金丝雀与分批调度、公开 HTTP 以及 AetherEdge 对应实现仍在规划中。

## 权威与事实

- AetherCloud 拥有期望修订版和推出意图。
- AetherEdge 拥有它报告的观测，以及最终的兼容性与策略决定。
- 只有边缘证据表明已应用或失败时，已应用事实才存在。下发、下载、校验、已连接的会话或 HTTP 成功都不能创建它。
- 网络超时会产生一个独立的 `unknown` 对账状态。它不会伪造已应用事实。之后到达的已认证边缘观测可以消除投影中的不确定性。
- 制品发布使修订版有资格成为期望目标；它不会部署或应用该修订版。

在这些事实存在之前，已实现的视图返回 `reported: null` 和 `applied: null`，而不是让单个状态字段承载多重含义。

## 状态与顺序

单目标推出的状态基础是：

```text
running <-> paused -> cancel-requested
   |                     |
   +-- edge applied ----> completed
   +-- reject/fail -----> completed-with-failures
```

回滚会创建一个更新的期望代次，指向另一个不可变的已发布制品修订版。它向期望历史追加记录；它不修改之前的代次，也不意味着边缘端已经恢复了任何内容。

每个边缘观测都有稳定的身份和无损的期望代次。精确重放是安全的。以不同内容复用观测身份会产生冲突。针对较旧代次的事实保留在观测历史中，不会让当前投影倒退。比云端已知期望代次更新的事实会以失败关闭方式被拒绝。

取消是请求停止尚未越过相关边缘边界的工作。它不能抹去已应用证据，也不能逆转物理效果。

## 已实现的应用接口

- `deployment.rollout.start`：高风险，需要明确确认、已发布制品前置条件、有效期、幂等性、权限和审计。
- `deployment.rollout.pause`、`deployment.rollout.resume` 和 `deployment.rollout.cancel-request`：受治理的推出意图变更。
- `deployment.rollout.rollback`：高风险，创建新的期望代次，以已发布制品为前置条件。
- `deployment.rollout.mark-unknown`：记录不确定的交付或执行结果，不推断失败或成功。
- `deployment.observation.report`：活动网关凭据范围和目标绑定、精确解码、幂等性和边缘证据投影。
- `deployment.rollout.get`：租户和项目范围内的查询。

内存存储库以原子方式保存聚合、幂等性、审计和发件箱证据，并证明乐观版本冲突。它是一致性适配器，不提供生产持久性。

## 规划中的扩展

目标快照、分组、金丝雀与分批限制、暂停关卡、按目标的部分成功、健康策略、推出调度和大体量证据存储都建立在这个单目标聚合之上。生产 CloudLink 只通过由应用拥有的发件箱记录发送版本化的期望下发或不可变引用；它不得写入边缘缓存、SHM、点位或设备寄存器。

阅读[制品注册表](/zh/aethercloud/concepts/artifact-registry)，了解不可变修订版在被部署引用之前是如何发布的。
