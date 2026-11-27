---
title: "从 AetherIot 迁移到 AetherEdge"
description: "边缘产品和仓库已从 AetherIot 重命名为 AetherEdge，AetherIoT 成为 AetherEdge、AetherCloud 和 AetherContracts 的总括项目名称。"
updated: 2026-07-16
---

# 从 AetherIot 迁移到 AetherEdge

边缘产品和仓库已从 AetherIot 重命名为 AetherEdge。AetherIoT 成为 AetherEdge、AetherCloud 和 AetherContracts 的总括项目名称。这是产品身份的变更，而不是对协议或包命名空间的改写。

## 更改内容

- 仓库 URL：`https://github.com/EvanL1/AetherEdge`。
- 源码检出目录和新的源码归档前缀：`AetherEdge`。
- 面向产品的文档、徽章、发布链接、CI 示例和网站导航使用 AetherEdge。
- AetherCloud 和未来的 AetherContracts 文档将边缘产品称为 AetherEdge。

## 保持稳定的内容

- `aether` CLI 和 `aether-*` 二进制文件。
- Rust crate 名称和导入名称，包括 `aether-edge-sdk` 和 `aether_sdk`。
- 配置键、环境变量、服务标识和磁盘路径，除非另有单独的兼容性决策更改它们。
- 安装程序名称 `AetherEdge-<arch>-<version>.run`。
- CloudLink、Thing Model、结构定义、TCK 和失败代码标识符。
- 已发布的标签、发布资产、证明以及按摘要固定的 AetherContracts alpha.3 工件。

## 更新现有克隆

GitHub 仓库重命名后：
```bash
git remote set-url origin https://github.com/EvanL1/AetherEdge.git
git remote -v
```

现有的 GitHub 重定向只是过渡期的辅助手段，而不是永久配置。请把 Git 依赖、子模块、徽章、发布自动化、证明命令和允许列表更新为新 URL。

## 维护者推进清单

1. 发布产品系列概述、统一文档结构、ADR、兼容性矩阵、状态页面和本迁移指南。
2. 更新面向产品的引用，同时排除不可变的发布版本、证据、出处记录和按摘要固定的契约导入。
3. 验证 AetherEdge 的文档和发布工作流、AetherCloud 文档、网站以及 AetherContracts 迁移通知。
4. 在 GitHub 上将 `EvanL1/AetherIot` 重命名为 `EvanL1/AetherEdge`。
5. 更新本地的远程仓库地址、仓库描述、网站链接、默认分支引用、发布徽章和证明示例。
6. 重新运行检查，并通过新地址核对未关闭的拉取请求和发布链接。
7. 公布兼容窗口期，并保留对旧名称的说明，直到下游引用不再依赖重定向。

## 回滚

如果某个发布、CI、包使用方或文档部署无法解析新的仓库身份，请暂停推进并恢复原来的 GitHub 仓库名称。保留 AetherIoT 产品系列文档和稳定的软件标识符；只回退面向仓库的 URL 和源码归档示例。切勿通过改写已发布的工件来模拟回滚。
