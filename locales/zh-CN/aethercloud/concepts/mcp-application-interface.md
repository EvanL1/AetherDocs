---
title: "MCP 应用接口"
description: "在不建立智能体专用数据通道的前提下，提供能力元数据、有界集成发现、精确租户资源和受治理工具"
updated: 2026-07-23
status: mixed
---

# MCP 应用接口

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/mcp-application-interface.md)。此页面镜像到统一的 AetherIoT 文档中。

[英文版](https://docs.aetheriot.ai/aethercloud/concepts/mcp-application-interface/)

MCP 接口是 AetherCloud 应用命令和查询之上的适配器。它不拥有业务状态，不放宽授权，不凭空造出规划中的能力，也不直接连接 PostgreSQL、发件箱、CloudLink 或边缘运行时。

## 已实现的接口基础

`apps/mcp` 实现了传输中立的 `AetherCloudMcpInterface`，带运行时解码和类型化结果：

- `listResources()` 公布 `aethercloud://capabilities` 和 `aethercloud://audit/events{?cursor,limit}` 资源模板；
- 能力资源把应用状态与 MCP 暴露状态分开报告，包括规划中的 MCP 暴露；
- 审计资源注入经过认证的租户、项目、主体和权限，然后调用 HTTP 使用的同一个 `SearchAuditEvents` 查询；
- `listTools()` 只暴露可执行的 MCP 适配器，并包含权限、风险、确认、幂等性、有效期、审计和输入结构定义元数据；
- `data.export.request` 调用 `RequestDataExport`；其高风险显式确认仍由应用命令强制执行；
- `edge.job.create` 调用 `CreateGovernedJob`；对所请求的工作，能力声明和边缘端决定仍然是权威；
- `integration.device.power.set` 只有在同时注入 `CreateIntegrationPowerControl` 和可信治理解析器时才会公布。与主体绑定的策略和确认引用由解析器提供，而不是由调用方提供。调用成功只表示请求已被接受并在等待边缘证据；
- `aethercloud://integration/projections{?gatewayId,cursor,limit}` 只有在注入 `ListIntegrationProjections` 时才会公布。它通过应用查询提供有界、稳定分页的集成摘要目录；
- `aethercloud://integration/projections/{gatewayId}/{integrationId}` 只有在注入 `GetIntegrationProjection` 时才会公布。它是按标识精确读取拓扑和最新观测副本的应用查询；
- 未知能力或仅存在于应用层的能力会在调用任何用例之前以 `mcp-tool-not-implemented` 失败。

目录接受可选的精确网关筛选、不透明游标，以及 1 到 100 的数量限制。其稳定顺序是先按网关标识、再按集成标识。每一项只包含网关标识、集成标识和类型、快照代次、实体数量和最新观测数量、接收时间以及修订版。它不暴露提供方载荷、来源地址、凭据、令牌或任意拓扑数据。

两个集成资源都声明 `authority: edge-reported-copy` 和 `liveStateAuthoritative: false`。目录是供智能体使用的发现上下文，不是对物理网络的清点扫描，也不能证明设备当前状态。`receivedAt` 是这份投影副本可用的新鲜度证据。智能体可以先列出摘要，再读取一个精确投影，但每一步仍然要经过租户和项目范围内的应用查询和权限检查。

经过认证的范围由未来的 MCP 组合根提供，绝不来自工具的业务 `input`。命令信封包含确认、幂等键、签发时间和有效期；接口把它们原样转发给应用解码器。它不能削弱能力元数据。

## 已实现与规划中

资源和工具注册表、有界目录与精确详情委托、外部解码、能力状态资源以及行为测试已经实现。API 应用现在把这个接口挂载为无状态的 MCP Streamable HTTP 端点 `POST /api/v1/mcp`，位于与 API 其余部分相同的 HTTP Bearer 认证器之后：每个请求一条 JSON-RPC 消息，响应为 `application/json`，没有 SSE 流，没有会话 ID，非 POST 方法返回 405。已提供 `initialize`、`ping`、`tools/list`、`tools/call`、`resources/list`、`resources/templates/list` 和 `resources/read`；工具失败以带内 `isError` 结果返回，经过认证的主体原样传给每一次接口调用。目前仍然没有 stdio 服务器、OAuth 流程、限流器或生产身份组合；配置的静态令牌认证器仍是开发凭据，不是租户身份提供方。

增加网络传输时，它必须是围绕这个接口的一层薄组合根。它必须转换 MCP 协议错误和内容，而不改变底层命令或查询上下文，也不绕过用例。命令工具仍然默认拒绝；只有应用行为和显式的 MCP 适配器都可执行时，工具才会出现。

## 安全与内容边界

资源和工具返回有界的 JSON 内容。原始凭据、登记令牌、制品字节、Webhook 机密、导出字节、SHM 地址和设备寄存器值都不是 MCP 内容。集成目录是摘要投影，绝不返回任意提供方字段。数据导出只返回其受治理的资源状态和不可变对象元数据；下载仍是一个独立的、规划中的授权边界。

在暴露其他资源或工具之前，请阅读[应用契约目录](/zh/aethercloud/reference/application-contracts)、[审计与集成](/zh/aethercloud/concepts/audit-and-integrations)和[受治理的能力作业](/zh/aethercloud/concepts/governed-capability-jobs)。
