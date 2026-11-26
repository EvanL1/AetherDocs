---
title: "连接 AI 助手"
description: "将 Claude 或任意 MCP 客户端指向 aether mcp，并在只读与写入访问之间做出选择"
updated: 2026-07-22
---

# 连接 AI 助手

`aether` CLI 同时也是一个 MCP（Model Context Protocol）服务器：`aether mcp` 通过 stdio 运行，把系统能力以工具的形式暴露出来，因此 Claude 或任何 MCP 客户端都可以查看通道、查询历史数据、读取告警，并在得到明确许可时操作系统。本页介绍客户端配置、如何让服务器指向远程安装，以及只读/写入访问模型。

## 你将获得什么

生产 MCP 目录共有 45 个工具，分为两层：

- **23 个只读工具**，始终注册：列出并查看通道及其点位映射（`channels_list`、`channels_status`、`channels_points`）、告警与告警规则（`alarms_list`、`alarms_stats`）、控制规则（`rules_list`、`rules_get`）、路由、历史数据（`history_query`、`history_latest`）、产品模型与设备实例（`models_products`、`models_instances`）、通道模板，以及云端链路状态（`net_mqtt_status`、`net_cert_info`）。
- **22 个受治理的写入工具**，仅当服务器以 `--allow-write` 启动时才注册：`channels_create`、`channels_update`、`channels_delete`、`channels_enable`、`channels_disable` 和 `channels_reconcile`；`models_instances_action`；`rules_execute`；`rules_create`、`rules_update`、`rules_delete`、`rules_enable` 和 `rules_disable`；`alarms_rule_create`、`alarms_rule_update`、`alarms_rule_delete`、`alarms_rule_enable` 和 `alarms_rule_disable`；`alarms_resolve`；以及 `routing_action_upsert`、`routing_action_delete` 和 `routing_action_set_enabled`。它们分别对应受治理的 `io.channel.manage`、`io.channel.reconcile`、`device.write_point`、`automation.rule.execute`、`automation.rule.manage`、`alarm.rule.manage`、`alarm.alert.resolve` 和 `automation.routing.manage` 应用能力。每次写入都需要已签名的身份、`confirmed: true`、应用授权以及强制审计。见下文[只读与写入访问](#只读与写入访问)。

每个工具封装一次 CLI 客户端调用，调用对象是带认证的 API 网关（`aether-api:6005`），也就是其他所有客户端使用的同一个远程应用边界。请为会话设置 `AETHER_ACCESS_TOKEN`：网关对读取和写入都要认证。只读层使用 Viewer 令牌即可，可通过 `POST /api/v1/auth/login` 获取。结果以结构化内容返回；服务失败或不可达时，返回的是可读的错误文本，而不是不透明的协议错误。

服务器还把你正在阅读的这份文档作为 MCP [资源](#资源)提供，助手不必离开会话就能了解领域知识，例如 PCS 是什么、哪些写入会触达真实硬件。

关于一个标志的说明：CLI 的全局 `--json` 标志对 `mcp` 无效（服务器始终使用 MCP 自身的 JSON-RPC 协议），传入时会打印一条警告。

## Claude Desktop

添加到 `claude_desktop_config.json`（`aether` 二进制文件必须在 `PATH` 中，或者使用绝对路径）：

```json
{
  "mcpServers": {
    "aether": {
      "command": "aether",
      "args": ["mcp"]
    }
  }
}
```

## Claude Code

```bash
claude mcp add aether -- aether mcp
```

对于需要写入权限的会话（见下文的访问模型）：

```bash
claude mcp add aether -- aether mcp --allow-write
```

## 指向远程系统

MCP 服务器不必运行在边缘设备上。每个工具都只与唯一的 API 网关（`aether-api:6005`）通信，因此一个地址就能完成全部配置。服务器启动时的解析顺序：

1. **`--host <hostname>`** 指向该主机上使用默认端口的网关：`aether mcp --host 192.168.1.50` 解析为 `http://192.168.1.50:6005`。
2. **`AETHER_API_URL`** 在未传入 `--host` 时覆盖完整的基础 URL，包括协议、主机和端口。
3. 两者都未设置：`http://localhost:6005`。

传输防护会拒绝任何在非环回明文 HTTP 上携带令牌的请求，因此远程网关需要以下方式之一：

- **SSH stdio 管道**：在边缘主机上运行服务器；网关保持在环回地址上，不对外暴露任何东西：

  ```bash
  claude mcp add aether -- ssh user@gateway aether mcp
  ```

- **SSH 端口转发**：执行 `ssh -L 6005:localhost:6005 user@gateway`，然后在本地针对默认的环回 URL 运行 `aether mcp`。
- **单一 HTTPS 入口**：放在 `6005` 前面，用于常驻的远程访问：`AETHER_API_URL=https://edge.example.test`。无需公网地址的配方见[通过单一 HTTPS 入口远程访问](/zh/guides/deployment#通过单一-https-入口远程访问)。

在 Claude Desktop 配置中，启用写入的远程服务器如下所示（把主机名替换为你的入口端点）：

```json
{
  "mcpServers": {
    "aether-site-a": {
      "command": "aether",
      "args": ["mcp", "--allow-write"],
      "env": {
        "AETHER_API_URL": "https://edge.example.test",
        "AETHER_ACCESS_TOKEN": "<SIGNED_ADMIN_OR_ENGINEER_TOKEN>"
      }
    }
  }
}
```

## 只读与写入访问

默认情况下，`aether mcp` 是只读的。这不是一个建议性的标注：不带 `--allow-write` 时，22 个写入工具根本不会注册，也完全不会出现在 `tools/list` 响应中。客户端无法调用、甚至看不到没有注册的东西。

这项保证只覆盖 MCP 工具面，仅此而已。它不是凭据的属性。一个同时还能发起普通 HTTP 请求的助手（大多数编码智能体客户端都可以）能够把同一个 `AETHER_ACCESS_TOKEN` 直接发给网关，触达该令牌的角色所允许的全部能力，包括那些没有出现在 `tools/list` 中的受治理写入。不注册工具只是向模型隐藏了一个动作，并没有收回凭据的权限。

**凭据才是边界，所以要收窄凭据**。每个访问令牌都带有一个 `scope` 声明，列出它可以行使的权限。角色仍是上限，scope 在上限之内做选择，因此 scope 永远无法授予角色本来没有的权限。scope 只含读取权限的令牌一旦用于写入，会在网关被拒绝，并在每个服务处再次被拒绝，无论请求走哪条路径：

```json
{ "user_id": 42, "role": "Engineer", "scope": ["data_processing.read"], "type": "access", "exp": 4102444800, "iat": 1 }
```

`scope` 是必填项。未声明权限的令牌会被拒绝，而不是被当作拥有全部权限：省略 scope 等同于隐式授权，这正是该声明要堵住的失败开放路径。登录签发的令牌带有其角色可以持有的全部权限；对于任何只应读取、绝不应下发命令的助手，请为它签发收窄后的令牌，并用 `--allow-write` 决定模型能看到什么，而不是它被允许做什么。

以 `--allow-write` 启动服务器是一个有意为之的动作，但该标志只是注册门禁，不是对任何命令的确认。MCP 调用方仍须在每次调用时传入 `confirmed: true`，应用也会在分发之前拒绝未授权或无法审计的请求。MCP 桥接读取 `AETHER_ACCESS_TOKEN`，把它作为 `Authorization: Bearer` 凭据发送给服务，并为每个受治理请求生成一个 `X-Request-ID`。它拒绝把该凭据附加到非环回的明文 HTTP 上；远程写入需要经过证书校验的 HTTPS 入口。请保留返回的 `request_id` 和任何 `command_id`：超时以及审计或发布不完整的响应，都不是可以安全自动重试的信号。设备命令响应成功，表示本地命令平面接受了该命令，并不能证明物理设备已经执行。路由响应表示物理目标已被持久化并发布，它不会执行设备命令。**启用写入之前，请先阅读[应用程序和代理的安全操作](/zh/guides/safe-operations)**。如果命令响应报告 `audit.status="incomplete"`，说明命令已被接受：保留其 `request_id`/`command_id`，不要重试。通道变更成功时也可能报告运行时投影降级。请保留其 `request_id` 和 `resulting_revision`，检查 `reconciliation_required`，不要自动重试这条非幂等的投运命令。

通道仿真/点位批量操作以及上行链路配置/证书操作仍在 MCP 之外。通道 CRUD/生命周期、规则 CRUD/生命周期、告警规则 CRUD/生命周期和告警解除之所以存在，只是因为它们的结构定义和应用能力已在 22 个工具的写入允许列表中被显式映射。任何现有封装都不会仅仅因为带了 `--allow-write` 就被提升为 AI 工具。

一句话规则：**为某项任务授予助手写入权限，而不是把它当作默认配置**。为需要的会话注册启用写入的服务器，用完之后退回只读。

## 资源

除工具之外，服务器在两种模式下都会把本文档的一个精选子集作为只读 MCP 资源提供。内核页面是内嵌的；Pack 知识只有在对应的已验证 Pack 于 `global.yaml` 中处于激活状态时才会出现。支持 MCP 资源的客户端可以直接拉取上下文，而不必依赖模型的先验知识：

- `aether://packs/energy/knowledge/ess-primer` — Energy Pack 激活时的储能概念
- `aether://packs/energy/knowledge/safe-operations` — Energy Pack 安全契约
- `aether://docs/concepts/architecture` — 七个服务及其通信方式
- `aether://docs/concepts/data-model` — 实例、通道、点位
- `aether://docs/reference/mcp-tools` — 完整的工具参考

## 相关页面

- [应用程序和代理的安全操作](/zh/guides/safe-operations) — 使用 `--allow-write` 之前请先阅读
- [系统架构](/zh/concepts/architecture) — 工具背后的服务
- [MCP 工具参考](/zh/reference/mcp-tools) — 每个工具及其参数
- [入门](/zh/guides/getting-started) — 构建、初始化并启动这些工具所对接的整套服务
