---
title: "安全地规划基础设施"
description: "运行已实现的受治理 OpenTofu 计划工作进程，既不暗示基础设施发生变更，也不暴露敏感的引擎输出"
updated: 2026-07-14
status: implemented
---

# 安全地规划基础设施

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/guides/plan-infrastructure.md)。此页面镜像到统一的 AetherIoT 文档中。

本指南介绍 AetherCloud 已实现的基础设施计划边界。它为一个部署堆栈生成一份不可变、经过策略评估的回执。当前的 `InfrastructureEngine` 端口没有 Apply 操作，因此成功的或经策略批准的计划都无法变更提供商基础设施。

## 已实现的契约

`PlanDeploymentStack` 是传输中立的应用命令。它：

1. 在运行时解码租户、项目、堆栈、引擎、幂等性、到期时间、模块、拓扑和内容摘要；
2. 在解析堆栈或调用引擎之前要求 `infrastructure.stack.plan` 权限；
3. 对同一范围内的相同幂等请求进行重放，并拒绝有冲突的复用；
4. 从动态的 `InfrastructureEngineRegistry` 中恰好解析出一个 `opentofu` 或 `terraform` 实现；
5. 向 `InfrastructureEngine.plan` 提供一个生成的计划身份、一个部署堆栈，以及不可变的模块和拓扑选择；
6. 除非结果指向完全一致的堆栈和状态、证明状态锁已获取并已释放，并且按摘要引用了一个加密的敏感计划制品，否则以失败关闭方式拒绝；
7. 汇总创建、更新、删除、替换和读取变更，供存储和策略使用，而不在计划回执中返回提供商资源细节；
8. 把策略决定记录为 `policy-approved` 或 `policy-rejected`，并让批准保持在 `not-requested`。

计划存储库的键是租户 + 项目 + 幂等请求。一个租户中的请求无法取回另一个租户的回执。

```text
authorized Plan request
        ↓
tenant/project Stack lookup → one remote State key
        ↓
InfrastructureEngine.plan → encrypted saved-Plan reference + lock evidence
        ↓
runtime contract checks → change summary → policy
        ↓
idempotent Plan receipt (never Apply)
```

## 敏感的计划数据

把已保存的计划二进制文件和原始的版本化 JSON 都当作含有机密的数据。[OpenTofu `show`](https://opentofu.org/docs/v1.10/cli/commands/show/) 和 [Terraform `show`](https://developer.hashicorp.com/terraform/cli/commands/show) 都警告敏感值可能以明文出现在 JSON 输出中。原始计划 JSON 是敏感的：绝不要把它放进日志、审计载荷、HTTP 响应、测试快照、提示词或智能体上下文。

应用层只接收策略所需的、经过验证的变更列表，然后持久化一份变更汇总，以及加密制品的引用和 SHA-256 摘要。真正的 CLI 工作进程必须把已保存的计划和 JSON 写入隔离的工作区，加密持久制品，并在上传后销毁工作区。它绝不能把这两个文件中的任何一个提交到源代码管理。

## 已实现的 OpenTofu 工作进程

`adapters/infrastructure/opentofu` 下的 `OpenTofuInfrastructureEngine` 是真实的、仅生成计划的 CLI 适配器。它的异步工厂执行 `tofu version -json`，并从该响应推导描述符版本，而不是硬编码一个版本。对每个计划，它使用 `NodeOpenTofuProcessRunner` 把可执行文件和 argv 直接传给 `child_process.spawn`，并设置 `shell: false`：

```text
tofu init -input=false -no-color
tofu validate -json
tofu plan -json -input=false -lock=true -lock-timeout=… \
  -detailed-exitcode -no-color -out=<saved-plan>
tofu show -json <saved-plan>
```

计划退出码 0 表示成功且差异为空，2 表示成功且差异非空，其他任何退出码都是类型化失败。版本化的 `show` JSON 把创建、更新、删除、读取、无操作以及两种替换动作顺序映射到应用契约。不受支持的 JSON 主版本和未知动作以失败关闭方式处理。

模块配置和拓扑变量通过注入的制品解析器进入。工作进程先验证每个选定的 SHA-256 摘要，再把 JSON 写入 `main.tf.json` 和 `aether.auto.tfvars.json`。注入的锁管理器必须为完全一致的堆栈状态键返回真实的租约，并且只有在该租约报告成功释放之后，结果才算成功。OpenTofu 也始终收到 `-lock=true`。

Node 工作区工厂创建一个全新的 0700 目录，并以 0600 权限写入源文件和已保存的计划文件。它拒绝符号链接和过大的已保存计划，限制捕获的子进程输出量，处理截止时间和取消，并在成功或失败时删除整个工作区。子进程只收到显式提供的环境变量；观察者事件只包含阶段、结果、退出状态、耗时和关联身份。

## 适配器一致性与测试

每个基础设施引擎适配器都必须运行 `@aether-cloud/infrastructure-conformance` 中的 `infrastructureEngineConformance`。共享套件验证计划、堆栈和状态之间的关联，加密的敏感制品元数据，锁证据，JSON 格式版本，以及不存在 `apply`。

`MemoryInfrastructureEngine`、`InMemoryInfrastructurePlanRepository` 以及围绕 OpenTofu 适配器的假边界，让默认测试路径不需要 OpenTofu 二进制文件、网络、远程状态、密钥提供方和云账户。真实的、不涉及提供商的本地 CLI 集成测试需要显式选择启用：

```bash
pnpm test:opentofu-integration
```

它使用已安装的 OpenTofu 二进制文件、临时的本地工作区、内存中的锁租约和 AES-GCM 测试存储。它证明真实的命令序列和清理过程，但不声称具备生产状态或存储。

## 仍在规划中

生产远程状态集成、分布式锁实现、短期凭据解析、生产加密制品存储、持久的计划存储库、审计接收端、成本模型、沙箱化的工作进程部署、Terraform CLI 适配器和公开 HTTP 端点仍在规划中。已实现的 Node 适配器是一个真实的本地 OpenTofu 进程，但它不能证明存在真实的云账户或生产远程状态。

Apply、会产生变更的刷新、导入和销毁仍然完全没有实现，它们是未来的命令，各自有自己的权限、确认、批准、审计和恢复契约。不要把它们作为 `PlanDeploymentStack` 的模式或标志添加进来。

在扩展此工作流之前，阅读[多云融合](/zh/aethercloud/concepts/multi-cloud-fusion)了解提供商与状态边界，并阅读 [AI 不变量](https://github.com/EvanL1/AetherCloud/blob/main/ai/invariants.md)。
