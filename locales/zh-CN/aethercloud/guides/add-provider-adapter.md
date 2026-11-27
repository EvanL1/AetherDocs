---
title: "添加提供商适配器"
description: "在应用端口之后实现提供商发现，并用共享一致性套件加以证明"
updated: 2026-07-14
status: implemented
---

# 添加提供商适配器

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/guides/add-provider-adapter.md)。此页面镜像到统一的 AetherIoT 文档中。

本指南介绍已实现的只读提供商发现契约，不是通用的云 SDK 封装。提供商适配器把一个显式的 CloudConnection 转换为提供商观测结果，同时保留提供商原生标识符和带命名空间的能力。

## 已实现的契约

当前基础包括：

- `CloudProviderDescriptor`、`CloudConnection` 和 `ProviderRegion` 领域值
- 应用层拥有的 `ProviderAdapter` 端口和动态 `ProviderAdapterRegistry`
- 租户/项目范围的 `DiscoverProviderRegions` 查询，需要 `cloud-connections:read` 权限
- 类型化的身份验证、配置、权限、速率限制和可用性失败
- 应用边界对提供商身份、连接身份、观测时间、重复区域和未声明能力的检查
- `providerAdapterConformance`，可复用的适配器测试套件
- `MemoryProviderAdapter`，确定性的测试适配器

尚未实现任何提供商 SDK、凭据解析器、持久化适配器、公开发现端点或基础设施变更。

## 适配器工作流程

1. 定义一个描述符，包含稳定的小写提供商身份、提供商类型、可移植能力和带命名空间的提供商能力。
2. 在 `packages/domain` 和 `packages/application` 之外实现应用层拥有的 `ProviderAdapter` 接口。
3. 只接受已针对获授权的租户和项目范围解析的 CloudConnection。它的 `credentialSource` 是工作负载身份或机密引用，绝不是凭据值本身。
4. 在适配器边界内解析短期访问凭据。不要把令牌放进快照、错误、日志、测试夹具、提示词或生成的模块。
5. 把预期内的提供商失败映射为类型化结果。不要把 SDK 错误泄漏为应用契约，也不要把速率限制报告成空的区域列表。
6. 返回规范的 UTC 观测时间、准确的提供商与连接身份、不重复的区域，以及描述符已声明的能力。
7. 运行共享一致性套件和提供商专属的测试夹具。
8. 只在组合根中注册适配器。

最小形态：

```ts
export class ExampleProviderAdapter implements ProviderAdapter {
  readonly descriptor = exampleProviderDescriptor;

  async discoverRegions(
    request: ProviderRegionDiscoveryRequest,
  ): Promise<ProviderRegionDiscoveryResult> {
    // Resolve short-lived access from request.connection.credentialSource.
    // Decode the provider response and return typed domain observations.
  }
}
```

## 必需的一致性测试

每个适配器测试都从 `@aether-cloud/provider-conformance` 导入 `providerAdapterConformance`。提供一个全新的适配器和一个属于该提供商的 CloudConnection。共享套件检查提供商与连接范围、规范的观测时间、唯一的区域身份、已声明的能力，以及对不匹配连接的拒绝。

响应解码、分页、身份验证、限流、配额行为和畸形的上游数据仍然需要提供商专属测试。默认测试路径使用测试夹具，不得调用真实的云账户。

## 独立的生命周期支持

基础设施规划现已在独立的、仅生成计划的 `InfrastructureEngine` 端口之后实现。真实的本地 OpenTofu 计划进程执行已经实现；Terraform 进程执行和基础设施变更仍在规划中。未来的提供商适配器可以选择版本化的提供商模块并规范化提供商观测结果，但不要给只读发现方法添加 `plan`、`apply`、`destroy`、导入或状态修复。

阅读[多云融合](/zh/aethercloud/concepts/multi-cloud-fusion)了解状态与权威规则，阅读[仓库布局](/zh/aethercloud/reference/repository-layout)了解依赖的放置位置。
