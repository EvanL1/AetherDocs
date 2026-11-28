---
title: "产品命名迁移"
description: "说明 AetherIoT 母项目、AetherEdge 仓库改名，以及不可变发布制品中的历史名称。"
updated: 2026-08-01
---

# 产品命名迁移

> 本页是面向中文用户的说明。带标签版本中的英文规范与已发布字节才是规范性依据。

AetherIoT 是 AetherEdge、AetherCloud 和 AetherContracts 的母项目。原名为 AetherIot 的边缘产品与仓库迁移为 `EvanL1/AetherEdge`。

AetherContracts `v0.1.0-alpha.3` 已经不可变，并有意在经过签名、摘要锁定的发布制品中保留历史名称 AetherIot。使用方不得重写这些字节。已发布的 `v0.1.0-alpha.4` 使用 AetherEdge 展示名称，同时保留所有协议、结构定义、TCK、软件包和失败代码标识，除非另有单独的版本化契约决策。

仓库改名不属于协议演进，也不会改变一致性状态。最新发布版本是 `v0.1.0-alpha.4`。alpha.5 是尚未发布的开发目标，仍处于实验阶段，不是生产 CloudLink 切换版本。

从 alpha.3 基线到已发布 alpha.4 的协议与发布顺序变化，单独记录在[从 alpha.3 迁移到已发布的 alpha.4](/zh/aethercontracts/migrations/alpha3-to-alpha4/) 中。
