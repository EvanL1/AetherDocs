---
title: "AetherEdge 用户旅程"
description: "选择负责目标的产品，并沿着从安全空边缘运行时到已投运应用的最短安全路径前进。"
updated: 2026-07-26
---

# AetherEdge 用户旅程

AetherEdge 是面向设备厂商、系统集成商、解决方案开发者、应用开发者和边缘运维人员的行业中立边缘运行时。它不是完整的垂直行业应用，也不是通用 Web Console。

请先选择负责最终结果的产品：

| 你希望…… | 应从哪里开始 |
|---|---|
| 在 Linux 网关上连接现场设备并运行确定性行为 | **AetherEdge** |
| 部署包含能源模型和操作员 Console 的能源管理解决方案 | [**AetherEMS**](https://github.com/EvanL1/AetherEMS) |
| 协调边缘节点群或云端任务 | [**AetherCloud**](https://github.com/EvanL1/AetherCloud) |
| 实现或验证公共线协议 | [**AetherContracts**](https://github.com/EvanL1/AetherContracts) |

## AetherEdge 黄金路径

主要用户旅程刻意保持安全并逐步推进：

```text
安装安全空运行时
  -> 建立操作员身份
  -> 连接一个默认禁用的设备 Channel
  -> 把物理点映射到逻辑模型
  -> 验证实时状态、质量和历史记录
  -> 添加默认禁用的规则、告警或命令
  -> 审核并显式投运行为
  -> 通过 API、CLI、MCP 或专用应用使用能力
  -> 监控健康状态、审计证据和实际结果
```

每项重要变更都遵循同一生命周期：

```text
检查 -> 规划 -> 验证 -> 确认 -> 应用 -> 审计 -> 观测 -> 修订
```

创建配置不等于启用硬件。Channel、规则、Pack 示例或控制路径必须由已授权操作员显式投运，否则始终保持不活动。

## 1. 安装安全空运行时

运行时操作员通常从签名 AetherEdge Release 开始，而不是克隆源码。请验证并运行与目标 Linux 主机匹配的安装包：

```bash
sha256sum -c AetherEdge-<arch>-<version>.run.sha256
chmod +x AetherEdge-<arch>-<version>.run
sudo ./AetherEdge-<arch>-<version>.run
```

安装器会创建六项服务、`aether` CLI、嵌入式 SQLite 状态和故障安全空配置。它不会添加设备、启用规则或安装领域解决方案，也不要求 Redis、PostgreSQL、浏览器、云连接或大语言模型。

执行第一个健康门禁：

```bash
aether doctor
```

成功意味着六项服务、SQLite、配置和权威 SHM 平面均健康，同时现场仍未投运。安装和引导身份的详细步骤见[入门指南](https://docs.aetheriot.ai/zh/guides/getting-started/)。

## 2. 建立操作员身份

使用安装器生成的私有引导凭据登录，立即修改密码，并创建专门用于日常工作的账户。CLI、HTTP、MCP 和生成的客户端都在同一个应用网关进行认证：

```text
aether-api:6005
```

IO、automation、history、uplink 和 alarm API 始终只监听回环地址。客户端不得暴露这些端口，也不得直接写入 SHM 或 SQLite。

## 3. 安全连接第一台设备

选择已编译进所安装 IO 运行时的协议，然后创建或导入一个 Channel。新 Channel 默认禁用。启用前必须：

1. 验证传输和协议参数；
2. 声明遥测、信号、控制和调节点；
3. 将协议地址映射到这些物理点；
4. 将所需物理点映射到逻辑 Instance；
5. 检查生成的拓扑和尚未解析的映射；
6. 显式启用 Channel。

尚无硬件时，应先使用虚拟 Channel 或协议模拟器。Channel 和路由流程见[连接设备](https://docs.aetheriot.ai/zh/guides/connect-devices/)。

## 4. 验证只读数据链路

引入控制前，先证明观测链路：

```text
device -> aether-io -> 权威 SHM -> API 和嵌入式历史记录 -> client
```

检查 Channel 健康状态、时间戳、质量、新鲜度、拓扑代次、历史样本和未映射点。传输连接成功但没有新鲜数据，并不代表采集链路健康；缺失值也不得按零处理。

这一只读里程碑就是首个有用部署：应用和智能体可以检查真实状态，但没有写权限。

## 5. 添加确定性行为

解决方案开发者现在可以通过 Domain Pack 或应用组合添加逻辑模型、计算、告警和本地规则。草稿行为必须保持禁用，直到输入、目标点、权限、失败行为和审计路径全部完成审核。

AetherEdge 在本地确定性地执行已经接受的行为。移除 UI、断开云连接或停止 AI 客户端，都不能中断已经投运的采集或安全闭环。

需要现成能源模型和工作流时，应使用 AetherEMS，而不是向 AetherEdge 添加能源领域实现。

## 6. 选择客户端入口

所有可替换客户端都使用同一个受治理的应用边界：

| 客户端 | 最适合的任务 |
|---|---|
| `aether` CLI | 安装、投运、诊断和运维 |
| HTTP/OpenAPI | 专用应用和生成的客户端 |
| 只读 MCP | AI 辅助检查、解释和应用生成 |
| 启用写入的 MCP 会话 | 边界明确、显式授权的临时维护任务 |
| `aether-edge-sdk` | 构建下游解决方案或嵌入式组合 |
| 下游 Console | AetherEMS 等领域专用操作员体验 |

AetherEdge 刻意不提供通用浏览器 Console。下游 UI 是可替换 API 客户端，绝不能成为第二个状态权威。

## 7. 添加 AI，但不把 AI 放进控制闭环

当前测试版支持边界明确的助手工作流：

1. 连接默认只读的 MCP Server；
2. 检查 runtime manifest、活动 Pack、实时能力目录、状态、质量和 revision；
3. 要求助手生成明确的变更提案；
4. 由人工审核尚不可用的能力、风险和预期影响；
5. 只为具体维护任务临时启用写工具；
6. 保留确认、request ID、receipt 和审计证据；
7. 检查实际结果，并让助手恢复只读模式。

完整的对话式意图编译器、历史仿真、临时行为到期和持续效果评估仍是产品方向，不是当前测试版已经交付的功能。参见[连接 AI 助手](https://docs.aetheriot.ai/zh/guides/ai-assistants/)和[平台状态](https://docs.aetheriot.ai/zh/roadmap/status/)。

## 8. 运维与扩展

操作员应监控服务健康、SHM Writer 新鲜度、Channel 连接、历史记录、告警、审计记录、Outbox 投递、磁盘使用量和配置 revision。可选存储、CloudLink 和 Data Processor 由 composition root 选择；它们都不会成为运行前提或实时状态权威。

解决方案开发者应把领域资产保留在自己的仓库：

```text
aether-edge-sdk + Domain Pack + 专用应用/智能体
```

下游产品应针对公开应用契约进行测试，绝不复制 AetherEdge 实现 crate。AetherEMS 是这一所有权模式在能源领域的参考实现。

## 当前交付边界

当前已经实现：安全空六服务运行时、SHM 实时状态权威、嵌入式历史记录、设备协议、确定性规则和告警、CLI、OpenAPI、受治理命令、审计证据、MCP 基础、Pack v1 和 SDK Facade。

试验性或规划中的能力必须保持明确标记。尤其需要注意：CloudLink 仍为试验性能力，完整的对话优先最终用户体验尚未交付。当前用户应期待的是带有受治理 AI 接入能力的集成商级运行时，而不是完整的无代码垂直行业应用。
