---
title: "网关身份与登记"
description: "通过注册和短期引导声明建立租户范围的网关身份"
updated: 2026-07-30
status: mixed
---

# 网关身份与登记

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/concepts/gateway-identity-and-enrollment.md)。此页面镜像到统一的 AetherIoT 文档中。

网关是 AetherCloud 为一个 AetherEdge 运行时建立的租户范围身份。它不是设备会话，不是实时状态的所有者，也不是证书记录。登记过程把已注册的云端资源逐步绑定到运行时持有的证明上。

## 已实现的基础

当前的 TypeScript 基础实现了：

- 经运行时校验、带品牌类型的 `TenantId`、`ProjectId` 和 `GatewayId` 值
- 不可变的网关登记转换 `registered -> awaiting-claim -> claimed`
- 相互独立的 `RegisterGateway`、`IssueGatewayEnrollment` 和 `ClaimGatewayEnrollment` 应用命令
- 租户范围的 `GetGatewayEnrollment` 查询
- 包含权限、风险、确认、幂等性、到期、审计和授权策略的命令定义
- 带类型的应用失败，以及对不可信输入的运行时解码
- 乐观的 `GatewayIdentityRepository` 插入和替换操作
- 携带已验证参与者、命令治理和集成事件身份的变更证据
- 读取和写入路径上带类型的存储不可用结果
- 用于一致性测试和本地测试的内存存储库和令牌服务
- PostgreSQL 存储库、显式迁移、租户 RLS、Node `pg` 连接池边界、乐观修订版检查，以及原子的网关／审计／发件箱写入
- 需显式启用的 PostgreSQL 18 集成测试，使用受限的应用角色

注册、声明签发／状态以及严格的 AetherEdge 声明消费 HTTP 路由现已组合在已部署的强制 RLS PostgreSQL 适配器之上。真实编译的 AetherEdge CLI 本地测试工具针对 Fastify 内存组合可以到达 `claimed`。活动凭据签发、生产 CloudLink、CA／KMS 和完整的迁移编排仍不可用。

## 命令边界

| 能力 | 授权 | 风险 | 确认 | 幂等性和到期 |
| --- | --- | --- | --- | --- |
| `fleet.gateway.register` | 租户上下文中的 `fleet.gateway.create` | 低 | 不需要 | 必需 |
| `fleet.gateway.enrollment.issue` | 租户上下文中的 `fleet.gateway.enrollment.issue` | 高 | 显式 | 必需 |
| `fleet.gateway.enrollment.claim` | 已绑定的登记令牌 | 中 | 不需要 | 必需 |

按策略，这三个命令都需要审计。注册和声明签发使用经过身份验证的租户上下文；声明消费只使用它的短期令牌和严格绑定的范围。PostgreSQL 以原子方式持久化每一次聚合、审计和发件箱转换。

签发命令只返回一次原始登记令牌。完全相同的重试只返回公开的网关和声明状态。使用相同幂等键但输入不同的重试会失败。网关聚合存储令牌摘要，绝不存储原始令牌。

认领命令通过由应用拥有的令牌服务比较令牌材料。它绑定凭据请求指纹，但不签发或激活证书。请求和指纹都相同的有效重复认领是重放；不同的认领方不能重新绑定网关。

## 查询边界

`fleet.gateway.enrollment.get` 需要 `fleet.gateway.enrollment.read`。该查询使用经过身份验证的上下文中的租户和项目范围，在该范围之外返回 `gateway-not-found`。它绝不返回令牌、令牌摘要或命令幂等键。

## 已实现的失败

- `invalid-input`
- `permission-denied`
- `confirmation-required`
- `command-expired`
- `idempotency-conflict`
- `gateway-already-exists`
- `gateway-not-found`
- `gateway-storage-unavailable`
- `invalid-enrollment-token`
- `enrollment-claim-expired`
- `invalid-gateway-enrollment-transition`
- `concurrent-modification`

Fastify 组合把这些失败映射为有界的 HTTP 错误信封。凭据激活和恢复的传输映射仍在规划中。

## 规划中的生命周期

生产生命周期在不改变其权威的前提下扩展该基础：

```text
registered -> awaiting-claim -> claimed -> credential-pending -> active
                    |                              |             |
                 expired                        failed       suspended
                                                                  |
                                                               revoked
                                                                  |
                                                        recovery-pending
                                                                  |
                                                   active (new generation)
```

声明是短期且可替换的；活动凭据单独进行版本管理。吊销会永久隔离一个凭据代次。恢复需要显式授权，并且会创建新的一代，而不是重新激活已吊销的材料。

[IoT Cloud 路线图](/zh/aethercloud/guides/iot-cloud-roadmap)说明了哪些凭据、持久化和公开 API 能力现在可用，哪些仍在规划中。
