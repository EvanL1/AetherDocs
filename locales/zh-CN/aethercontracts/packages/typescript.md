---
title: "AetherContracts TypeScript 基础库"
description: "AetherContracts 的实验性 TypeScript 基础绑定，提供规范 `uint64` 解析、兼容 RFC 8785 的 JSON 规范化和实验性夹具验证器。"
updated: 2026-07-15
---

# AetherContracts TypeScript 基础库

> 权威来源：[AetherContracts](https://github.com/EvanL1/AetherContracts/blob/main/packages/typescript/README.md)。本页是其简体中文说明；带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 才是规范性依据。

`@aether-contracts/typescript` 是 AetherContracts 的实验性 TypeScript 基础绑定。它目前提供规范 `uint64` 解析和兼容 RFC 8785 的 JSON 规范化，以及一个实验性验证器；该验证器以稳定的失败字符串执行公开 CloudLink 夹具清单中的每个条目。它不是完整的生产 Thing Model、认证或传输编解码器。规范性契约仍保留在仓库发布包中。
