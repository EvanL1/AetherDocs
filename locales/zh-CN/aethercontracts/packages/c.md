---
title: "AetherContracts C 基础库"
description: "C99 基础库不做内存分配，使用由调用方持有的字符串视图，提供规范 `uint64` 解析和静态 Thing Model 查询。"
updated: 2026-07-15
---

# AetherContracts C 基础库

> 权威来源：[AetherContracts](https://github.com/EvanL1/AetherContracts/blob/main/packages/c/README.md)。本页是其简体中文说明；带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 才是规范性依据。

C99 基础库不做内存分配，并使用由调用方持有的字符串视图。它目前提供规范 `uint64` 解析，以及静态的 Thing Model 属性、点位和能力查询。能力元数据默认拒绝，并且没有调用接口。一个有界、由调用方持有的实验性验证器执行公开的 CloudLink 夹具配置档。它不是通用 JSON 解析器，也不是完整的生产 CloudLink 传输或认证编解码器。

安装或引用根 CMake 项目，并链接 `AetherContracts::c`。
