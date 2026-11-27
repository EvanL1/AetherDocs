---
title: "AetherCloud 产品概览"
description: "AetherCloud 是面向 AetherEdge 运行时和云端工作负载的 AI 原生、行业中立的多云物联网融合与控制平面，不是边缘运行时的托管副本。"
updated: 2026-07-16
---

# AetherCloud 产品概览

AetherCloud 是面向 AetherEdge 运行时和云端工作负载的 AI 原生、行业中立的多云物联网融合与控制平面。它是一个独立的产品，不是边缘运行时的托管副本。

## 已经实现的基础

- 通过能力驱动的适配器实现提供商中立的发现和受治理的基础设施规划。
- 仅做计划的 OpenTofu 基础设施引擎，带有锁和进程安全证据。
- 网关身份与登记、CloudLink 会话和运行时清单的应用基础。
- 网关和已接受遥测事实的部分 PostgreSQL 持久化，包括持久的确认发件箱证据。
- 部分实现的制品、部署、受治理作业、审计、集成、可观测性和传输中立 MCP 应用切片。

## 生产环境仍在规划的部分

生产身份与凭据生命周期、公开的 CloudLink 组合、完整的崩溃持久性、多样本映射、生产数据库组合、工作进程、加固的外发交付和可连接的 MCP 服务器仍在规划中或受门槛限制。

AetherCloud 拥有期望的放置。提供商拥有其实际资源。AetherEdge 仍然是实时点位状态和最终物理执行的权威。

继续阅读 [AetherCloud 仓库](https://github.com/EvanL1/AetherCloud)、[平台概览](/zh/overview/platform)和[状态页](/zh/roadmap/status)。
