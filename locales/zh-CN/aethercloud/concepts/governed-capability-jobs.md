---
title: "受治理的能力作业"
description: "通过版本化作业请求边缘能力，避免任意 RPC、不安全重试和云端对物理结果的越权声明"
updated: 2026-07-16
status: mixed
---

# 受治理的能力作业

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/governed-capability-jobs.md)。此页面镜像到统一的 AetherIoT 文档中。

传输中立的领域与应用基础以及原子内存适配器已经实现。经过授权的租户参与者只能为已声明的网关能力创建工作，并可以查看其治理元数据、在需要时确认、排队和下发、请求取消、把结果不明确的作业标记为未知、接收经过认证的边缘回执，以及查询最终的作业。

这不是端到端的远程执行产品。PostgreSQL、生产审计与发件箱、运行时清单目录接线、CloudLink 信封和邮箱、大体量证据存储、公开 HTTP、调度工作进程以及 AetherEdge 对应实现仍在规划中。

## 权威与准入

- AetherCloud 拥有作业意图、租户授权、确认证据、有效期和交付策略。
- AetherEdge 拥有能力接受、本地前置条件与安全检查、执行和结果事实。
- 已声明的能力是可用性的证据，不是授权。创建作业同时需要 `edge.job.create` 和该声明要求的权限。
- 风险、确认、重放安全性、权限和物理效果元数据由能力声明提供，而不是由调用方输入提供。
- 未知或格式错误的能力会以失败关闭方式被拒绝。不存在通用方法名或任意 RPC 兜底。
- 具有物理效果的能力仍然默认拒绝，边缘端始终保留最终决定权。

当前的内存目录是一致性测试夹具。生产准入必须使用带新鲜度标记的运行时清单投影，并保留准入时所用的精确声明版本。

## 生命周期与不确定性

```text
awaiting-confirmation -> authorized -> queued -> offered
                                      edge: accepted -> running -> terminal
                                                   \-> unknown
offered/running/unknown -> cancel-requested -> edge terminal Receipt
```

`succeeded`、`failed`、`partial`、`rejected`、`expired` 和 `canceled` 是边缘回执的终态结果。边缘端接受之前发生的云端到期不会伪造回执。取消只记录意图；如果效果已经发生，之后到达的 `succeeded` 回执仍然是权威。

网络超时后，作业变为 `unknown`。尤其是不安全或具有物理效果的作业，不会以新身份自动重试。迟到的已认证回执可以消除不确定性，同时不会抹去此前的超时或取消证据。

## 回执顺序与幂等性

回执身份和序列是相互独立的重放防护。序列是无损的规范 `uint64` 十进制字符串。精确重放返回已有事实。以不同内容复用身份或序列会以失败关闭方式被拒绝。

乱序回执保留为 `pending-predecessor`；它不会推进投影。缺口补齐后，所有新变为连续的回执会按顺序应用。执行终态回执需要证据摘要。大体量证据字节将存放在对象存储中；作业账本只保存受治理的引用和摘要。

## 已实现的应用接口

- `edge.job.create`：校验精确的外部输入、命令时间窗口、租户范围、平台权限和能力权限。
- `edge.job.confirm`：高风险，需要明确确认。
- `edge.job.queue` 和 `edge.job.offer`：带独立命令元数据的调度控制。
- `edge.job.mark-unknown` 和 `edge.job.cancel-request`：记录云端所知和意图，不声称边缘结果。
- `edge.job.receipt.ingest`：从活动凭据派生租户、项目和网关，并强制目标绑定。
- `edge.job.get`：租户和项目范围内的查询，先展示治理信息，再展示状态。

内存适配器以原子方式保存作业状态、幂等性、必需的审计证据和一条发件箱记录。它无需外部服务即可证明行为；它不满足生产持久性要求。

## 规划中的生产补全

生产工作将增加 PostgreSQL 账本和回执收件箱、事务耦合的发件箱与审计链、运行时清单声明来源、由应用拥有的 CloudLink 交付、证据对象、调度与到期工作进程、公开接口，以及经过评审的 AetherEdge 契约。只有在回执被持久接受之后，才会向边缘端确认。

阅读 [CloudLink 可靠传输与生命周期](/zh/aethercloud/concepts/cloudlink-and-core-state-machines)，了解交付、超时、重试和结果未知时的行为。
