---
title: "AetherCloud 概述"
description: "了解这款多云产品、它的权威边界和首批垂直切片"
updated: 2026-07-16
status: mixed
---

# AetherCloud 概述

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/get-started/overview.md)。此页面镜像到统一的 AetherIoT 文档中。

AetherCloud 是面向 AetherEdge 的可选、AI 原生的多云融合与控制平面。它为人员、应用和编码智能体提供统一入口，用于了解机群和云资源、选择放置、查看遥测、发布版本化制品，并在边缘站点和基础设施提供商之间协调经过审计的工作。

它不是采集设备数据或闭合控制回路的运行时。当 AetherCloud、广域网或 AI 提供商不可用时，AetherEdge 主机继续运行。

## 属于 AetherCloud 的内容

- 租户身份、用户、权限、项目和机群清单
- 云连接、提供商能力发现和规范化清单
- 放置决策和提供商范围内的部署堆栈
- 经过审计的基础设施计划和应用作业
- 网关登记和连接观测
- 版本化的 Pack、配置、模型和应用制品
- 相互独立的期望、报告和已应用修订版事实
- 从边缘端接收的持久遥测和告警投影
- 带有效期、经过审计的能力作业及其回执
- 面向人工编写和智能体编写的应用的 API 与文档

## 保留在边缘端的内容

- 设备协议会话和采集
- 权威的实时点位值
- 已投运的通道配置
- 确定性规则、告警、联锁和兜底行为
- 对可能影响物理系统的工作进行校验和最终接受
- 断连期间有界的存储转发行为

## 以提供商为权威的内容

- 提供商资源的实际存在和生命周期状态
- 提供商原生的身份、配额、区域、故障域和能力
- 单个部署堆栈的远程、加锁的基础设施状态

AetherCloud 拥有期望放置和编排状态，但不会把规范化投影当作提供商的实际状态。在添加提供商或基础设施工作流之前，请阅读[多云融合模型](/zh/aethercloud/concepts/multi-cloud-fusion)。

在添加跨网络的特性之前，请阅读[权威边界](/zh/aethercloud/concepts/edge-cloud-boundary)。

## 交付顺序

仓库从 TypeScript 模块化单体和智能体可读的契约起步。提供商发现、受治理的基础设施计划以及网关注册与声明领取基础，已经实现了领域和应用切片。内存适配器让它们保持自包含；它们的生产适配器和公开租户路由仍在规划中。基础设施引擎刻意只做计划，没有应用（Apply）操作。

物联网产品的顺序是网关身份、CloudLink 会话、运行时清单、遥测与告警摄取、制品注册表、期望、报告与已应用部署、受治理作业、运维集成和 MCP。每个切片都必须在不依赖后续切片的情况下有用。设备控制不属于仓库基础里程碑。

完整的限界上下文见[能力图](/zh/aethercloud/concepts/iot-cloud-capability-map)，阶段门槛和排除项见[垂直切片路线图](/zh/aethercloud/guides/iot-cloud-roadmap)。

## 开始开发

先阅读[仓库布局](/zh/aethercloud/reference/repository-layout)，再按照[智能体开发指南](/zh/aethercloud/guides/build-with-an-agent)操作。当前的 API 接口见 [HTTP 参考](/zh/aethercloud/reference/http-api)。
