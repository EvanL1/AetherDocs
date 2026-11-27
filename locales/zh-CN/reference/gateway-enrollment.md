---
title: "AetherCloud 网关注册"
description: "生成并认领本地 AetherEdge 网关身份，同时不暗示存在已激活的 CloudLink 凭据或会话。"
updated: 2026-07-29
---

# AetherCloud 网关注册

网关注册是在安装阶段进行的身份认领。已实现的基础能力会生成 Ed25519 密钥、持久化待处理的身份状态、调用严格的 HTTP 认领端点，并记录与之匹配的认领服务器确认。

`claimed` 不等于 `credential-active`、`cloudlink-connected` 或 `online`。AetherCloud 的生产认领部署、凭据签发和生产 CloudLink 组合仍处于计划阶段。

## 交互式注册

使用隐藏输入的终端提示，这样注册令牌就不会出现在进程参数和 shell 历史中：

```bash
aether cloud enroll \
  --cloud-url https://api.aetheriot.ai \
  --tenant-id 11111111-1111-4111-8111-111111111111 \
  --project-id 22222222-2222-4222-8222-222222222222 \
  --gateway-id 33333333-3333-4333-8333-333333333333
```

对于明确的非交互式机密提供方，向 stdin 流式输入恰好一行有长度上限的令牌：

```bash
secret-provider-command | aether cloud enroll \
  --cloud-url https://api.aetheriot.ai \
  --tenant-id 11111111-1111-4111-8111-111111111111 \
  --project-id 22222222-2222-4222-8222-222222222222 \
  --gateway-id 33333333-3333-4333-8333-333333333333 \
  --token-stdin
```

这里有意不提供 `--token` 选项。不要把令牌放进环境变量、配置文件、命令参数、日志或智能体对话记录。

成功时，面向人的输出以下面这行结尾：

```text
Identity claimed; CloudLink credentials not yet activated
```

要获得稳定且不含机密的输出，把全局 JSON 标志放在命令之前：

```bash
aether --json cloud enroll \
  --cloud-url https://api.aetheriot.ai \
  --tenant-id 11111111-1111-4111-8111-111111111111 \
  --project-id 22222222-2222-4222-8222-222222222222 \
  --gateway-id 33333333-3333-4333-8333-333333333333
```

data 对象只包含：

- `cloud_url`
- `tenant_id`
- `project_id`
- `gateway_id`
- `public_key_fingerprint`
- `enrollment_state`
- `claimed_revision`

它绝不包含注册令牌、私钥、Authorization 材料或完整的公钥。

## 读取本地状态

状态是一次本地读取，不会联系 AetherCloud 或消息代理：

```bash
aether cloud status
aether --json cloud status
```

可能的注册状态有：

| 状态 | 含义 |
|---|---|
| `unconfigured` | 本地不存在网关身份 |
| `key-generated` | 私钥和不可变 scope 已持久化 |
| `claim-pending` | 稳定的认领幂等键已持久化；重试是安全的 |
| `claimed` | 所配置的认领服务器已确认公钥绑定和修订 |

这里有意不包含 MQTT 连接状态。

## 重试与冲突

如果 HTTP 结果未知，用有效的注册令牌再次运行同一条命令。AetherEdge 会复用已持久化的私钥、公钥、指纹和 `Idempotency-Key`。它不会创建第二个身份。

对完全相同的云端、租户、项目和网关重复执行已经认领过的命令，是一次成功的本地空操作。不同的不可变 scope 会产生冲突并失败关闭。CLI 不提供强制覆盖选项。

## 开发用环回服务器

生产注册只接受 HTTPS。本地测试服务器只有在带上显式标志、并且主机恰好是 `localhost` 或 `127.0.0.1` 时才可以使用 HTTP：

```bash
aether cloud enroll \
  --cloud-url http://127.0.0.1:8080 \
  --tenant-id 11111111-1111-4111-8111-111111111111 \
  --project-id 22222222-2222-4222-8222-222222222222 \
  --gateway-id 33333333-3333-4333-8333-333333333333 \
  --allow-insecure-localhost
```

该标志不允许其他 HTTP 主机、IPv6 别名、URL 路径、用户信息、查询、片段或重定向。

## 本地存储

身份存储在：

```text
<data-directory>/uplink/identity
```

已安装的数据目录由常规的 CLI 路径解析选定；`--db-path` 可以为开发和测试选择一个隔离的数据目录。身份目录的权限是 `0700`；其中的私钥文件和状态文件是 `0600`，父目录中相邻的注册锁也是如此。首次创建时，会把一个完整且已 fsync 的 `0700` 暂存目录原子重命名到位；之后的状态变更会先 fsync，再原子替换状态文件。目录链和预期的身份路径会拒绝符号链接、不安全的权限、非常规文件、硬链接、格式错误的状态以及身份替换。无关的多余条目不会被当作经过校验的身份材料呈现。

这种普通文件实现只是当前的 Linux 基线。它不提供 TPM、Secure Enclave、系统密钥环、HSM 或硬件级的密钥保护。

## HTTP 认领契约

端点和请求头：

```http
POST {cloudOrigin}/api/v1/fleet/enrollment-claims:claim
Content-Type: application/json
Idempotency-Key: <stable UUID>
```

请求：

```json
{
  "schema": "aether.cloud.gateway-enrollment-claim.v1",
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "projectId": "22222222-2222-4222-8222-222222222222",
  "gatewayId": "33333333-3333-4333-8333-333333333333",
  "enrollmentToken": "<opaque token>",
  "credentialRequest": {
    "algorithm": "ed25519",
    "publicKey": "<unpadded base64url raw 32-byte public key>",
    "fingerprint": "<64 lowercase hex SHA-256>"
  }
}
```

接受的成功响应：

```json
{
  "schema": "aether.cloud.gateway-enrollment-claimed.v1",
  "gatewayId": "33333333-3333-4333-8333-333333333333",
  "state": "claimed",
  "revision": 1
}
```

适配器会拒绝未知字段或未知的结构定义、身份不匹配、`claimed` 以外的任何状态、为零或超出 JSON 安全范围的修订、非 JSON 的成功响应、超大响应体、重定向、超时以及 HTTPS 降级。远程响应体不会被复制到错误信息中。

响应中不包含凭空编造的 CloudLink 凭据包。归属与恢复边界见[网关身份恢复](/zh/recovery/gateway-identity-recovery)。
