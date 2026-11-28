---
title: "AetherContracts 入门"
description: "选择精确的实验性发布版本，了解契约层次，运行 TCK，并采用摘要锁定的使用方制品全集。"
updated: 2026-07-17
status: implemented
---

# AetherContracts 入门

> 本页是面向中文用户的使用说明。带标签版本中的英文规范、JSON Schema、测试夹具和 TCK 才是规范性依据。

AetherContracts 是 AetherEdge、AetherCloud 与独立实现共同使用的公开互操作权威。请从一个精确发布版本开始，并始终把规范、结构定义、测试夹具、TCK 和发布清单作为整体使用。只复制一份结构定义或生成一种类型，并不构成完整的契约采用。

最新发布版本是 `v0.1.0-alpha.4`。仓库当前面向尚未发布的 `0.1.0-alpha.5` 开发版本。两者都处于实验阶段，旧传输仍是默认选项，都不是生产 CloudLink 切换版本。

## 选择契约范围

| 需求                                              | 可用性                                     | 首先阅读或运行                                                                                                         |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 通用 JSON、整数、规范化与失败规则                 | 已随 alpha.3 和 alpha.4 发布               | [基础规范](/zh/aethercontracts/spec/foundation/)                                                                       |
| Thing Model 结构和 P/M/A 迁移                     | 已随 alpha.3 和 alpha.4 发布               | [Thing Model v1 alpha](/zh/aethercontracts/spec/thing-model-v1alpha1/)                                                 |
| 委托提供方拓扑、类型化状态及其显式 CloudLink 扩展 | 已随 alpha.4 发布                          | [Integration v1 alpha](/zh/aethercontracts/spec/integration-v1alpha1/) 和[接入任务](/zh/aethercontracts/integration/) |
| 受治理的提供方控制                                | 已随 alpha.4 发布；默认关闭                | [Integration Control v1 alpha](/zh/aethercontracts/spec/integration-control-v1alpha1/)                                 |
| CloudLink 消息、质询请求生命周期与认证提案        | 已随 alpha.4 发布，在 alpha.3 基线上扩展   | [CloudLink v1 alpha](/zh/aethercontracts/spec/cloudlink-v1alpha1/)                                                     |
| 发布分发与使用方锁                                | 已随 alpha.3 和 alpha.4 发布               | [分发规范 v1 alpha](/zh/aethercontracts/spec/distribution-v1alpha1/)                                                   |
| 可执行一致性行为                                  | 因版本而异                                 | [TCK v1 alpha](/zh/aethercontracts/spec/tck-v1alpha1/)                                                                 |
| 当前门槛与产品兼容性                              | 因版本而异                                 | [兼容性与发布门槛](/zh/aethercontracts/compatibility/)                                                                 |
| 语言绑定和使用方证据                              | 因版本而异                                 | [一致性与使用方验证](/zh/aethercontracts/conformance/)                                                                 |

规范性英文规范定义语义，JSON Schema 定义结构是否可接受，测试夹具固定示例和稳定失败结果，TCK 证明可观察行为。语言绑定实现契约，但永远不能成为第二个权威。

## 验证源码检出

使用 Node.js 24 和仓库声明的 pnpm 版本：

```bash
git clone https://github.com/EvanL1/AetherContracts.git
cd AetherContracts
git checkout v0.1.0-alpha.4
corepack enable
pnpm install --frozen-lockfile
pnpm test:tck
```

`pnpm test:tck` 是自包含检查，不需要消息代理、数据库、云账号或边缘设备。修改仓库，或需要验证 TypeScript、Rust、C 与 C++ 的全部绑定基础时，再运行 `pnpm check`。

上面的检出命令有意选择最新的不可变发布版本。若要查看 alpha.5 的开发内容，请固定到一个精确的源码提交，并把它表述为候选版本。不要用浮动分支或并不存在的发布标签代替。

## 采用精确发布版本

面向生产的使用方不应跟随浮动分支，也不应复制未经验证的制品子集。请提交封闭的 `aether-contracts.lock.json`，导入精确的必需制品全集，并运行该发布版本的复合验证操作。验证器会检查解析后的发布提交、清单摘要、制品哈希、采用集合以及可选的在线发布身份。

AetherEdge 与 AetherCloud 中已提交的使用方锁以 `v0.1.0-alpha.3` 展示了这种分发模型；两个产品都还没有把锁移到 `v0.1.0-alpha.4`。alpha.4 的发布不会把认证、持久确认或旧传输切换提升为生产状态。

## 选择语言绑定

- [TypeScript](/zh/aethercontracts/packages/typescript/)
- [Rust](/zh/aethercontracts/packages/rust/)
- [C99](/zh/aethercontracts/packages/c/)
- [C++17](/zh/aethercontracts/packages/cpp/)

四种绑定都执行公开测试夹具清单。它们是刻意收窄的基础能力，不是完整的生产传输编解码器。Go、Java 与 Python 绑定仍在规划中。

共享消息代理认证提案明确默认关闭。它的质询请求只是针对已投运网关凭据绑定的限速触发器，不是认证证据。

如果现有使用方仍引用边缘仓库的旧名称，请阅读[产品命名迁移](/zh/aethercontracts/migration/)。软件包和协议标识保持不变。
