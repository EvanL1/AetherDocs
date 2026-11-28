---
title: "Home Assistant 集成剥离"
description: "把安装环境从已退役的内核内置 Home Assistant 桥接迁移出来"
---

# Home Assistant 集成剥离

实验性的 Home Assistant 桥接已从最小化的 AetherEdge 内核中移除。标准 IO 二进制文件不再提供 `home-assistant`、`home-assistant-cloudlink` 或 `home-assistant-integration-control` 特性，也不会悄悄忽略它们原有的任何设置：安装器的特性选择会直接失败，并且不会启动任何桥接进程。

在升级使用过实验性自定义构建的安装环境之前：

1. 禁用 Home Assistant 委托设备命令，并等待在途的回执到达终态；
2. 按照站点的保留策略归档桥接的拓扑代次存储、控制账本、审计日志和 CloudLink 待发送队列；
3. 吊销专用的 Home Assistant 令牌，并移除原有的 `AETHER_HOME_ASSISTANT_*` 密钥和设置；
4. 用使用 Aether SDK 和端口契约的下游 Rust 组合替换该集成，或者通过受支持的 IO 协议投运物理设备；
5. 在重新启用任何远程命令来源之前，验证运行中的运行时能力目录。

下游集成必须对写入保持默认拒绝，使用共享的应用命令边界，把提供方凭据放在 Aether 状态和提示词之外，并且绝不直接写入 SHM 或内核存储。AetherEdge 目前不提供通用的动态插件宿主，也不加载下游脚本、共享库或子进程。

本迁移页面并不表示 Home Assistant 是标准内核的一项能力。
