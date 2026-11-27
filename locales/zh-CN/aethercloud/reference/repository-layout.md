---
title: "仓库布局"
description: "把代码放进正确的应用、领域、适配器或组合根包"
updated: 2026-08-01
status: mixed
---

# 仓库布局

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/reference/repository-layout.md)。此页面镜像到统一的 AetherIoT 文档中。

工作区把稳定的产品逻辑与交付机制分开。一部分目录由仓库基础建立，其余目录在各自的第一个垂直切片实现时添加。

```text
apps/
  api/                  HTTP composition root with Supabase JWKS authentication
  mcp/                  implemented transport-neutral MCP application interface; wire root planned
  cloudlink/            experimental deployable MQTT ingress process; authenticated only by the Broker ACL
  worker/               planned background-work composition root
  web/                  implemented independent Cloudflare operator console
packages/
  domain/               values, identifiers, invariants
  application/          transport-neutral use cases
  provider-conformance/ reusable Provider Adapter contract tests
  infrastructure-conformance/ reusable Infrastructure Engine contract tests
adapters/
  fleet/memory/          implemented Gateway repository/token test adapters
  fleet/postgres/        implemented Gateway SQL/migration/driver adapter; production composition planned
  cloudlink/memory/      implemented session, challenge, and heartbeat test adapter
  cloudlink/postgres/    implemented session/challenge SQL adapter; composed by the CloudLink ingress in postgres mode
  cloudlink/mqtt/        experimental strict codec and MQTT.js transport adapter
  cloudlink/node-crypto/ experimental Ed25519 challenge and hello authentication adapter
  runtime/memory/        implemented Runtime Manifest history test adapter
  telemetry/memory/      implemented atomic telemetry conformance adapter
  alarm/memory/          implemented alarm projection conformance adapter
  artifacts/memory/      implemented Artifact Registry conformance adapter
  deployment/memory/     implemented edge deployment conformance adapter
  jobs/memory/           implemented governed Job ledger conformance adapter
  audit/memory/          implemented append-only Audit query test adapter
  audit/postgres/        implemented forced-RLS Audit query adapter
  integration/memory/    implemented webhook subscription/delivery and export test adapters
  observability/opentelemetry/ optional implemented operational-signal adapter
  providers/memory/      deterministic implemented test adapter
  providers/<provider>/  planned SDK discovery and normalization adapters
  infrastructure/memory/ implemented deterministic Plan engine and repository
  infrastructure/opentofu/ implemented real local Plan-only CLI adapter
  infrastructure/terraform/ planned Terraform CLI adapter
  persistence/          planned shared migration runner and object-store adapters
infra/modules/           planned versioned provider-specific IaC modules
deploy/certs/             pinned public CA certificates used by compositions
supabase/                 CLI config and ordered bindings to adapter-owned SQL migrations
contracts/cloudlink/     experimental JSON Schemas and golden fixtures
ai/                      invariants and machine-readable documentation catalog
skills/aether-cloud/     coding-agent workflow and routing
docs/                    concepts, guides, reference, and decisions
tests/                   repository-wide contract tests
```

## 放置规则

当一个类型不涉及 I/O、只表达业务含义时，把它放进 `domain`。当一个接口描述某个用例所需的能力时，把它放进拥有该端口的应用模块。把编排放进 `application`。把 Fastify 路由、进程信号、环境访问和依赖构造放进应用（app）。

适配器可以依赖端口和第三方 SDK。端口不能依赖它的适配器。不要创建通用的工具包；把辅助代码与拥有其语义的概念放在一起。

提供商中立的意图属于领域包和应用包。提供商专用的模块、SDK 客户端、身份验证和规范化留在适配器和 `infra/modules` 下。工作进程组合根选择一个提供商适配器和一个 `InfrastructureEngine`；两者都不在领域用例内部选择。

## 包导出

包只开放经过设计的公共入口点。通过另一个包声明的导出来导入它，而不要深入它的内部目录。避免使用桶式导出，以免无意中让持久化记录或框架类型成为应用契约的一部分。

## 添加限界上下文

从一个可观测的用例及其领域语言开始。在选择持久化方式之前，先添加测试和应用契约。如果该上下文需要适配器，请提供一个内存一致性实现，使默认测试保持自包含。

只有当上下文改变了系统职责或依赖关系时，才更新[架构](/zh/aethercloud/concepts/architecture)；日常的文件新增属于本参考页或包的 README。
