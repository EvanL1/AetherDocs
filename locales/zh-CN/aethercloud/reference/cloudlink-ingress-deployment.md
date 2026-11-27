---
title: "CloudLink 入口部署"
description: "部署只读的 CloudLink MQTT 入口进程，配置其环境变量，并了解它的身份验证就是你的消息代理 ACL"
updated: 2026-08-01
status: mixed
---

# CloudLink 入口部署

> 权威来源：[AetherCloud](https://github.com/EvanL1/AetherCloud/blob/main/docs/reference/cloudlink-ingress-deployment.md)。此页面镜像到统一的 AetherIoT 文档中。

`apps/cloudlink` 是一个长期运行的 MQTT 订阅者。它连接到操作员选定的消息代理，订阅 CloudLink v1 上行主题，并存储 AetherEdge 网关上报的 Home Assistant 拓扑和观测投影。它只启用一个 CloudLink 扩展 `aether.cloudlink.integration.v1alpha1`，这一组合中没有任何东西能够发送设备命令。

它不监听任何 HTTP 端口。它不读取 `PORT` 或 `HOST` 变量，不提供健康检查端点，因此它的 Railway 服务也不带健康检查。

该进程是实验性的。在决定是否要运行它之前，请先阅读 [Home Assistant 集成](/zh/aethercloud/concepts/home-assistant-integration)和 [CloudLink 可靠传输与生命周期](/zh/aethercloud/concepts/cloudlink-and-core-state-machines)。

## 部署前必读：你的消息代理 ACL 就是身份验证

入口不验证任何网关签名，无论是在建立会话时还是在之后的任何上行消息上。它根据消息自身携带的网关 ID、凭据 ID 和凭据代次，解析出一份由操作员配置的凭据。这三个值都是非机密标识符。配置的证明从不经过线路传输，AetherCloud 也从不存储它。

- **身份验证完全依赖消息代理侧按网关配置的 ACL。没有这些 ACL，实际上就没有身份验证**。任何能够写入 `{prefix}/v1/gateways/{gatewayId}/up/...` 并且知道这三个标识符的发布者都能获得会话，随后可以上报运行时清单，并覆盖该网关已投影的家庭拓扑和观测。
- **`AETHER_CLOUD_CLOUDLINK_MQTT_USERNAME` 和 `AETHER_CLOUD_CLOUDLINK_MQTT_PASSWORD` 是入口自己的消息代理登录凭据**。它们验证的是 AetherCloud 的订阅者连接到消息代理的身份。它们不是按网关配置的发布者 ACL，也不说明哪些发布者可以写入某个网关的上行主题。本仓库中没有任何内容配置、强制或验证这些 ACL，无论你是否创建了它们，入口都能成功启动。
- **不消费任何发布者证明**。经过评审的受信连接器可以带外为每一次发布提供经过验证的发布者证明。本组合完全不消费它。它假定消息代理 ACL 是正确的，并且无法检测 ACL 是否不正确。

把每个网关的消息代理凭据限制在该网关自己的主题命名空间内，是必需的部署步骤，而不是可选的加固措施。这种模式适合单个家庭：消息代理归你所有，并且你可以带外确认发布者身份。它不是网关身份验证，不得被描述为网关身份验证，也不支持多租户或多网关规模。

## 单实例

MQTT 客户端 ID 是固定的，正因如此，传输层的 `clean: false` 持久消息代理会话才能在重启后恢复，而不是被遗弃。代价是**共用同一个客户端 ID 的两个入口实例会互相把对方从消息代理上挤掉**，陷入循环断连。因此 A0 对每个客户端 ID 只支持一个入口实例。不要把 Railway 服务扩展到一个副本以上。多实例套接字所有权是规划中的能力，不是受支持的部署方式。

## 必需的环境变量

下面的每个变量都由 `apps/cloudlink/src/runtime.ts` 中的 `composeCloudLinkRuntime` 读取，不合规的值在组合阶段就会被拒绝，此时还没有建立任何消息代理连接。空字符串视为未设置。

| 变量 | 规则 |
| --- | --- |
| `AETHER_CLOUD_CLOUDLINK_MQTT_URL` | 消息代理 URL，使用 `mqtt://` 或 `mqtts://`，最长 2048 个字符。不得在其中嵌入凭据。 |
| `AETHER_CLOUD_CLOUDLINK_TOPIC_PREFIX` | 主题前缀。校验方式是构建真实的上行过滤器，因此不可用的前缀会在启动时失败，而不是在 `subscribe` 内部失败。 |
| `AETHER_CLOUD_TENANT_ID` | 规范的小写 UUID。 |
| `AETHER_CLOUD_PROJECT_ID` | 规范的小写 UUID。 |
| `AETHER_CLOUD_CLOUDLINK_TRUSTED_GATEWAY_CREDENTIALS` | 包含 1 到 64 个网关凭据条目的 JSON 数组。见下文。**包含机密**。 |

### `AETHER_CLOUD_CLOUDLINK_TRUSTED_GATEWAY_CREDENTIALS`

一个 JSON 数组。每个条目必须是一个对象，恰好包含下面四个字符串字段，不能有其他字段：

| 字段 | 规则 |
| --- | --- |
| `gatewayId` | 规范的小写 UUID。 |
| `credentialId` | 1 到 256 个字符，匹配 `^[A-Za-z0-9][A-Za-z0-9._:-]*$`。在所有条目中必须唯一。 |
| `generation` | 规范的十进制 uint64 字符串，无前导零，最大为 `18446744073709551615`。 |
| `proof` | 1 到 4096 个 UTF-8 字节。**这是长期有效的机密**。 |

下面的示例只说明结构。请替换每一个值；不要部署本文档中打印的任何值。

```json
[
  {
    "gatewayId": "<the Gateway's canonical lowercase UUID>",
    "credentialId": "<the credential id you bound to that Gateway>",
    "generation": "<that binding's generation, as a decimal string>",
    "proof": "<the secret you and the Gateway agreed out of band>"
  }
]
```

`gatewayId`、`credentialId` 和 `generation` 是非机密标识符；当网关出示了入口无法解析的绑定时，入口会把它们写到 stderr，方便你找到不匹配的条目。`proof` 是机密：它绝不会被写入日志行、错误消息、审计载荷、响应或云端存储，也绝不能被粘贴到 issue、提示词或智能体上下文中。请把整个变量作为机密保存在你所用平台的机密存储中；轮换时，同时更改网关绑定及其 `generation`。

## 可选的环境变量

| 变量 | 默认值 | 规则 |
| --- | --- | --- |
| `AETHER_CLOUD_CLOUDLINK_MQTT_CLIENT_ID` | `aether-cloud-cloudlink-ingress` | 1 到 128 个字符。更改之前请先阅读上文的单实例约束。 |
| `AETHER_CLOUD_CLOUDLINK_MQTT_USERNAME` | 无 | 最长 256 个字符。入口自己的消息代理登录名，不是按网关配置的 ACL。 |
| `AETHER_CLOUD_CLOUDLINK_MQTT_PASSWORD` | 无 | 最长 4096 个字符。**机密**。 |
| `AETHER_CLOUD_INTEGRATION_PROJECTION_STORE` | `memory` | 只能是 `memory` 或 `postgres`。任何其他值（包括空字符串）都会在启动时失败。 |
| `AETHER_CLOUD_CLOUDLINK_INGRESS_POSTGRES_URL` | 无 | 存储为 `postgres` 时必需。见 PostgreSQL 一节。**机密**。 |
| `AETHER_CLOUD_CLOUDLINK_MQTT_TLS_CA_PATH` | 无 | 消息代理 CA 证书的绝对路径。见 TLS 一节。 |
| `AETHER_CLOUD_CLOUDLINK_MQTT_TLS_CLIENT_CERTIFICATE_PATH` | 无 | 入口客户端证书的绝对路径。 |
| `AETHER_CLOUD_CLOUDLINK_MQTT_TLS_CLIENT_PRIVATE_KEY_PATH` | 无 | 入口客户端私钥的绝对路径。 |

## 消息代理 TLS 信任

TLS 信任与消息代理 URL 和主题前缀一样，属于操作员配置。A0 开放了这项配置，但带有一条从传输层继承而来的约束。

**三个 TLS 变量是一个整体**。要么三个都设置，要么都不设置。不能只配置 CA：传输层只接受以双向 TLS 套件形式提供的信任材料，因此指向私有 CA 也就意味着要为入口签发客户端证书和密钥。只设置三者中的一个或两个会在启动时失败。

三个都设置时：

- URL 必须使用 `mqtts://`；
- 每个路径都必须是绝对路径，每个文件都必须是常规文件、不能是符号链接，大小为 1 字节到 1 MiB；
- 私钥必须拒绝组和其他用户访问，因此请对它执行 `chmod 0600`；
- 必须依据所配置的 CA 进行证书验证。

都不设置时，连接使用 Node 默认的系统信任链。通过 `mqtts://` 连接时验证仍然生效——本组合中没有任何配置可以禁用证书验证，也不应添加这样的配置。`mqtt://` URL 不加密，也不验证任何身份；只应在消息代理仅能通过受信专用网络访问时使用它。

## 投影存储与 PostgreSQL 角色

`AETHER_CLOUD_INTEGRATION_PROJECTION_STORE` 默认为 `memory`，它把所有投影保存在进程内存中，重启后即丢失。CloudLink 会话状态遵循同一选择，因此部署永远不会出现持久投影搭配重启即消失的会话这种组合。

`postgres` 模式需要 `AETHER_CLOUD_CLOUDLINK_INGRESS_POSTGRES_URL`，它必须使用 `postgres:` 或 `postgresql:` 协议，以专用的 `aethercloud_cloudlink_ingress` 角色（或带 `aethercloud_cloudlink_ingress.` 前缀的 Supabase 连接池用户名）进行身份验证，包含密码，并设置 `sslmode=verify-full`。该角色被有意限定得比 API 的 `aethercloud_app` 更窄，因为入口是一条消费不可信外部输入的写入路径。

**先供应角色，再部署**。`supabase/migrations/20260728000900_cloudlink_ingress_role.sql` 把 `aethercloud_cloudlink_ingress` 创建为不带密码的 `NOLOGIN` 角色，并只授予它所需的 CloudLink 会话表和集成投影表。为它开通登录是一项带外的操作员步骤：

```sql
ALTER ROLE aethercloud_cloudlink_ingress LOGIN PASSWORD '<a generated password>';
```

这与 `aethercloud_cloudlink_health_worker` 的处理方式一致。只有 `aethercloud_app` 在仓库内有激活路径，位于 `apps/api/src/postgres-role-activation.ts`；另外两个角色依赖这一运维步骤。把得到的连接字符串放入 `AETHER_CLOUD_CLOUDLINK_INGRESS_POSTGRES_URL`，并注意它与 `AETHER_CLOUD_POSTGRES_URL` 是不同的变量，后者仍然只表示 `aethercloud_app`。让两个服务共用一个变量会悄无声息地破坏其中一个。

三个角色迁移的结尾都有一道防护：如果角色已经具有 `LOGIN` 或任何其他不安全属性，它就会抛出错误。因此，对一个已正确供应的数据库重新运行其中任何一个迁移，都会抛出 `... has unsafe role attributes`。这是预期行为，不是缺陷：Supabase 按版本前缀记录已应用的迁移，不会重新运行已经应用过的迁移。

A0 没有 PostgreSQL 运行时清单适配器。即使在 `postgres` 模式下，清单声明也只存在于本进程中，因此重启之后，集成上行消息会以失败关闭方式被拒绝，直到每个网关重新上报其清单。这是正确的失败方向，不得放宽。

## Railway 服务

`railway.json` 是单服务文件，已经用于提供 `@aether-cloud/api`。入口需要它自己的 Railway 服务，其配置即代码路径指向 `railway.cloudlink.json`。不要改动 `railway.json`。

`railway.cloudlink.json` 有意不带 `healthcheckPath`：该进程不打开任何 HTTP 端口，健康检查只会让每次部署失败，而观察不到任何东西。`drainingSeconds` 为 30，必须保持高于进程自身的关闭时限。

在该服务上设置环境变量。不要依赖项目级共享变量来提供这两个 PostgreSQL URL。

## 启动、日志和关闭

成功启动时，进程向 stderr 写入一行，指明它选择的存储，这样你可以确认没有误部署成 `memory`：

```text
cloudlink ingress started with postgres projection store
```

启动失败时写入 `cloudlink failed to start: ...` 并以非零状态退出。消息代理不可达属于启动失败，而不是静默的降级模式。

消息级输出有意保持低基数，绝不包含载荷、失败消息或机密：

- `cloudlink uplink discarded: <code>` 对应被拒绝的上行消息，只携带失败代码；
- `cloudlink uplink deferred` 表示上行消息已处理，但其确认无法发布；这意味着网关将会重传，而不是入口正在承受背压；
- `cloudlink uplink rejected` 和 `cloudlink internal failure` 对应其余结果；
- `cloudlink no trusted connector credential is configured: ...` 会列出网关出示的非机密 `gatewayId`、`credentialId` 和 `generation`，方便你找到不匹配的条目。

最后这条诊断信息没有上限，由消息驱动，因此一个卡在过期 `generation` 上的网关，每发布一条消息就会产生一行日志，速率与消息代理的消息速率相同。应当修复绑定，而不是过滤日志。

`SIGINT` 和 `SIGTERM` 会启动关闭流程：排空处理中的上行消息，关闭消息代理连接，并结束 PostgreSQL 连接池。这一关闭过程本身没有上限（消息代理的连接有时限，但订阅没有），因此入口点让它与一个 15 秒的时限竞速。干净的关闭以零状态退出，通常在一秒之内完成。如果时限先到，进程会写入 `cloudlink close exceeded 15000ms; exiting without a clean Broker close` 并以非零状态退出，这样卡住的关闭是可见的，而不会看起来像一次普通的停止。此处的非零退出意味着消息代理可能仍然认为会话处于连接状态；下一个实例连接时会收回该客户端 ID。

该时限有意低于 `drainingSeconds`，这样进程会自己报告超时，而不是被一个无从解释的 `SIGKILL` 替换掉。重复的信号是安全的：处理函数保持注册，关闭只运行一次。这一点很重要，因为停止信号会不止一次到达本进程：容器运行时会向整个进程组发信号，`pnpm run` 也会把信号转发给脚本。

## 本地验证

```bash
AETHER_CLOUD_CLOUDLINK_MQTT_URL=mqtt://127.0.0.1:1883 \
AETHER_CLOUD_CLOUDLINK_TOPIC_PREFIX=aethercloud \
AETHER_CLOUD_TENANT_ID=11111111-1111-4111-8111-111111111111 \
AETHER_CLOUD_PROJECT_ID=22222222-2222-4222-8222-222222222222 \
AETHER_CLOUD_CLOUDLINK_TRUSTED_GATEWAY_CREDENTIALS="$CREDENTIALS_JSON" \
pnpm --filter @aether-cloud/cloudlink start
```

有消息代理在监听时，它会打印 `cloudlink ingress started with memory projection store`。没有时，它会打印 `cloudlink failed to start:` 并以非零状态退出，这是正确的行为：它从不假装已经连接。

`pnpm test:mqtt-integration` 针对真实的本地消息代理检验传输层。`pnpm check` 绝不能依赖消息代理。
