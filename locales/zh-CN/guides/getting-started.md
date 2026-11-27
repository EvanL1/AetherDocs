---
title: "入门"
description: "安装安全空运行时、建立操作员访问、验证健康状态，并选择下一项投运步骤"
updated: 2026-07-26
---

# 入门

本指南把操作员或源码开发者带到同一个首要里程碑：一个健康、尚未投运的 AetherEdge 运行时，没有任何设备、规则或领域解决方案被静默启用。

如果你想要的是现成的能源管理产品，而不是行业中立的运行时，请从 [AetherEMS](https://github.com/EvanL1/AetherEMS) 开始。AetherEdge 的黄金路径是：

```text
安全空安装 -> 操作员身份 -> 已禁用的设备通道
  -> 点位映射 -> 只读验证 -> 经过审查的行为
  -> 显式投运 -> 审计与运行
```

面向操作员、解决方案构建者、应用和 AI 的各种路径变体见 [AetherEdge 用户旅程](/zh/overview/user-journeys)。

## 从发行版安装

这是 Linux 边缘操作员的常规路径。从 [GitHub 发行页面](https://github.com/EvanL1/AetherEdge/releases)下载匹配的 `.run` 安装包和校验和，然后验证并运行这个全新安装包：

```bash
sha256sum -c AetherEdge-<arch>-<version>.run.sha256
chmod +x AetherEdge-<arch>-<version>.run
sudo ./AetherEdge-<arch>-<version>.run
```

安装器会创建由六个服务组成的运行时、`aether` CLI、私有引导凭据、嵌入式数据库和安全空配置。它不会投运站点。安装完成后，请从[启动并验证](#启动并验证)继续；不要重复下面的源码检出设置。

## 源码检出的先决条件

- **Rust**：工具链由 `rust-toolchain.toml` 固定为 `1.90.0`；rustup 会在首次构建时自动安装它。这份固定配置还声明了边缘构建使用的 `aarch64-unknown-linux-musl` 交叉编译目标。
- **Docker Engine 和 Docker Compose**：容器组合需要它们。`aether services start` 在底层驱动 Docker Compose。Redis 和 PostgreSQL 不是先决条件。

## 准备源码检出

这条路径用于 AetherEdge 开发、SDK 评估或手动 Compose 安装，不是操作员的常规安装流程。

构建 `aether` CLI：

```bash
cargo build --release -p aether
```

把二进制文件安装到 PATH 中（`cp target/release/aether /usr/local/bin/` 或 `cargo install --path tools/aether`），这样本指南和其他所有指南都可以直接以 `aether` 调用它。

仓库在 `config.template/` 中提供一份故障安全的空配置。在源码检出中，CLI 和 `docker-compose.yml` 默认都使用 `./data/config` 和 `./data`。规划始终是只读的，不会创建其中任何一个目录：

```bash
aether --json setup
```

从 JSON 输出中读取 `data.plan_id`，审查列出的操作，然后显式应用这份完全未改动的计划：

```bash
aether setup apply --plan-id <PLAN_ID>
```

只有全新站点，或者恰好是四个分发文件的某个安全子集的站点，才接受应用。在任何持久化写入之前，Aether 会暂存完整配置，针对临时 SQLite 数据库运行常规校验和完整的原子同步，然后只创建缺失的文件，不做覆盖。它会初始化 `aether.db` 并同步空运行时，但不会启动服务、启用设备或规则，也不会安装领域包。如果站点在规划之后发生了变化，计划 ID 即告过期，应用会在不写入的情况下停止。在由此得到的 `safe_ready` 站点上再次运行 setup 不会执行任何操作。

setup 会报告已有站点或自定义站点，但绝不会改写它们。操作员仍然可以使用 `aether init` 执行显式的数据库结构迁移，使用 `aether sync` 显式应用配置；`aether sync --dry-run` 会校验同一组嵌套文件，但不改动已安装的数据库。

CLI 按以下顺序独立解析每个路径：命令行参数、`AETHER_CONFIG_PATH`/`AETHER_DATA_PATH`、`/etc/aether/install.yaml`，最后是当前检出中的 `data/config/` 和 `data/`。已安装的软件包会自动写入这个上下文文件。没有该上下文时，Aether 绝不会仅仅因为某个旧安装目录存在就采用它。

对于全新的手动 Compose 部署，请创建一个私有环境文件，并在校验组合之前填入两个首次启动机密。打包的安装器会自动完成这一步；仓库的设置流程有意不把机密放进配置模板。

```bash
cp .env.example .env
chmod 600 .env

random_hex_32() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}
export JWT_SECRET_KEY="$(random_hex_32)"
export AETHER_BOOTSTRAP_ADMIN_PASSWORD="$(random_hex_32)"

env_tmp="$(mktemp ./.env.tmp.XXXXXX)"
chmod 600 "$env_tmp"
awk '
  /^JWT_SECRET_KEY=/ {
    print "JWT_SECRET_KEY=" ENVIRON["JWT_SECRET_KEY"]; next
  }
  /^AETHER_BOOTSTRAP_ADMIN_PASSWORD=/ {
    print "AETHER_BOOTSTRAP_ADMIN_PASSWORD=" ENVIRON["AETHER_BOOTSTRAP_ADMIN_PASSWORD"]; next
  }
  { print }
' .env > "$env_tmp"
mv "$env_tmp" .env

JWT_SECRET_KEY="$JWT_SECRET_KEY" \
  AETHER_BOOTSTRAP_ADMIN_PASSWORD="$AETHER_BOOTSTRAP_ADMIN_PASSWORD" \
  docker compose config --quiet
unset JWT_SECRET_KEY AETHER_BOOTSTRAP_ADMIN_PASSWORD
```

保持 `JWT_SECRET_KEY` 稳定。使用生成的引导值以 `admin` 身份登录，立即修改密码，然后从 `.env` 中删除 `AETHER_BOOTSTRAP_ADMIN_PASSWORD`。示例设置了 `AETHER_ALLOW_PUBLIC_REGISTRATION=false`，因此公开注册保持关闭。

## 启动并验证

```bash
aether services start
aether doctor
```

`aether services start` 会启动 Docker Compose 栈。Compose 文件引用预构建镜像；在还没有 `aetherems:latest` 的机器上，可以运行 `./scripts/build-installer.sh`（它会用交叉编译的二进制文件构建镜像）来生成该镜像，或者用 `docker load` 加载预构建的镜像归档，详见[部署](/zh/guides/deployment)。

`aether doctor` 检查必需的本地运行时；任何必需组件失败时，它都会以非零状态退出：

1. **Docker Engine**：守护进程已安装并正在运行。
2. **六个核心服务**：IO、automation、history、API、uplink 和 alarm 各自的服务专用健康路由均有响应。可选的云端或存储依赖可以报告降级，而不会成为核心故障。
3. **SQLite 数据库**：`aether.db` 存在、已初始化，并显示其最后一次同步时间。
4. **配置文件**：`global.yaml`、`io/io.yaml`、`automation/automation.yaml` 和 `automation/instances.yaml` 均存在。
5. **共享内存**：段文件 `/dev/shm/aether-live-state.shm` 存在，并且具有可读、有效的数据平面头部和新鲜的 IO 写入者心跳。SHM 是权威的实时状态平面，因此缺失、陈旧、被截断、是符号链接或无效的 SHM 都属于错误。当某个安装有意使用其他位置时，`AETHER_SHM_PATH` 会覆盖平台默认值。

一切健康时，以下端口处于监听状态（各服务的职责见[系统架构](/zh/concepts/architecture)）。打包的组合只对远程暴露带认证的 API 网关；其余五个进程 API 监听 `127.0.0.1`：

| 服务 | 端口 |
|---------|------|
| aether-io | 6001 |
| aether-automation | 6002 |
| aether-history | 6004 |
| aether-api | 6005 |
| aether-uplink | 6006 |
| aether-alarm | 6007 |

AetherEdge 有意不提供任何内置的网页界面。AetherEMS 等产品控制台独立部署，并通过 `aether-api` 接入。

## 获取操作员令牌

CLI 数据平面和 MCP 只与 6005 端口上带认证的 API 网关通信，因此每条 `aether` 数据命令都需要访问令牌。以引导管理员身份登录，并为当前 Shell 会话导出令牌。登录 API 要求的是密码的十六进制 MD5 摘要，而不是明文：

```bash
# The bootstrap value was unset from the shell above; read it back from .env
bootstrap_password="$(grep '^AETHER_BOOTSTRAP_ADMIN_PASSWORD=' .env | cut -d= -f2-)"
digest="$(printf '%s' "$bootstrap_password" | md5sum | cut -d' ' -f1)"
export AETHER_ACCESS_TOKEN="$(curl -s http://localhost:6005/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$digest\"}" | jq -r '.data.access_token')"
unset bootstrap_password digest
```

令牌默认在 30 分钟后过期；命令报告 401 时请重新登录。日常操作应使用专用账户，而不是引导管理员，认证端点见 [HTTP API 参考](/zh/reference/http-api)。

## 确认安全空状态

默认模板有意不包含任何设备通道或实例，因此以下命令最初应返回空集合：

```bash
# 1. The communication channels aether-io is polling
aether channels list

# 2. The device instances aether-automation is serving
aether models instances list

# 3. Confirm that no control rule was activated implicitly
aether rules list
```

每条命令都接受 `--json` 以输出结构化结果，AI 智能体和脚本应使用这种模式。只有在显式的投运步骤添加并启用通道之后，数据才会开始流动；接下来请阅读“连接设备”。

## 后续步骤

你的第一个生产里程碑应当是一条只读采集路径。连接一个已禁用的通道，完成映射，验证质量和新鲜度，然后才审查规则或控制。

- [AetherEdge 用户旅程](/zh/overview/user-journeys)：完整的安全生命周期和按角色划分的路径
- [连接设备](/zh/guides/connect-devices)：添加真实通道，并把它的点位映射到实例
- [编写规则](/zh/guides/writing-rules)：用规则引擎实现自动化控制
- [AI 助手](/zh/guides/ai-assistants)：通过 AI 智能体驱动 Aether
- [部署](/zh/guides/deployment)：Docker Compose 细节和边缘安装器
