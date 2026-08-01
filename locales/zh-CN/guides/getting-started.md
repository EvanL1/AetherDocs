---
title: "入门"
description: "安装安全空运行时、建立操作员访问、验证健康状态，并选择下一项投运步骤。"
updated: 2026-07-26
---

# 入门

本指南让边缘操作员和源码开发者到达同一个首要里程碑：AetherEdge 运行时健康且尚未投运，没有任何设备、规则或领域解决方案被静默启用。

如果你需要现成的能源管理产品，而不是行业中立运行时，请从 [AetherEMS](https://github.com/EvanL1/AetherEMS) 开始。AetherEdge 黄金路径是：

```text
安全空安装 -> 操作员身份 -> 默认禁用的设备 Channel
  -> 点位映射 -> 只读验证 -> 审核行为
  -> 显式投运 -> 审计与运维
```

各类操作员、解决方案开发者、应用和 AI 路径见 [AetherEdge 用户旅程](https://docs.aetheriot.ai/zh/overview/user-journeys/)。

## 从 Release 安装

这是 Linux 边缘操作员的正常路径。从 [GitHub 发行页面](https://github.com/EvanL1/AetherEdge/releases) 下载匹配的 `.run` 安装包和校验和，然后验证并运行全新安装包：

```bash
sha256sum -c AetherEdge-<arch>-<version>.run.sha256
chmod +x AetherEdge-<arch>-<version>.run
sudo ./AetherEdge-<arch>-<version>.run
```

安装器会创建六项服务、`aether` CLI、私有引导凭据、嵌入式数据库和安全空配置，但不会投运现场。安装后直接继续执行[启动并验证](#启动并验证)，不要重复下面的源码检出配置。

## 源码检出的先决条件

- **Rust**：工具链由 `rust-toolchain.toml` 固定为 `1.90.0`；rustup 会在第一次构建时自动安装。该 Pin 还声明边缘构建使用的 `aarch64-unknown-linux-musl` 交叉编译目标。
- **Docker Engine 和 Docker Compose**：容器组合需要它们。`aether services start` 在底层驱动 Docker Compose。Redis 和 PostgreSQL 不是先决条件。

## 准备源码检出

这条路径用于 AetherEdge 开发、SDK 评估或手工 Compose 安装，不是普通操作员的安装入口。

构建 `aether` CLI：

```bash
cargo build --release -p aether
```

把二进制文件安装到 `PATH`，例如执行 `cp target/release/aether /usr/local/bin/` 或 `cargo install --path tools/aether`，这样本指南和其他指南就可以直接使用 `aether`。

仓库在 `config.template/` 中提供故障安全空配置。在源码检出目录中，CLI 和 `docker-compose.yml` 默认使用 `./data/config` 和 `./data`。规划操作始终只读，也不会创建这两个目录：

```bash
aether --json setup
```

从 JSON 输出读取 `data.plan_id`，检查列出的操作，然后显式应用完全相同、未经修改的 Plan：

```bash
aether setup apply --plan-id <PLAN_ID>
```

只有新站点或恰好包含四个发行文件安全子集的站点才允许应用。持久化写入前，Aether 会暂存完整配置，针对临时 SQLite 数据库执行常规验证和完整原子同步，然后只创建缺失文件，绝不覆盖已有文件。它会初始化 `aether.db` 并同步空运行时，但不会启动服务、启用设备或规则，也不会安装 Domain Pack。如果站点在规划后发生变化，Plan ID 会过期，应用会在写入前停止。对生成的 `safe_ready` 站点再次执行 setup 是 No-op。

setup 会报告已有或自定义站点，但不会改写它们。操作员仍可使用 `aether init` 显式迁移数据库结构，使用 `aether sync` 显式应用配置；`aether sync --dry-run` 会验证同一组嵌套文件，但不修改已安装数据库。

CLI 按以下顺序分别解析每个路径：命令行参数、`AETHER_CONFIG_PATH`/`AETHER_DATA_PATH`、`/etc/aether/install.yaml`，最后是当前源码检出中的 `data/config/` 和 `data/`。安装包会自动写入上下文文件。如果没有该上下文，Aether 不会仅因为旧安装目录存在就采用它。

全新的手工 Compose 部署必须创建私有环境文件，并在验证组合前填入两个首次启动 Secret。打包安装器会自动完成这一步；仓库配置刻意不把 Secret 放进配置模板。

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

保持 `JWT_SECRET_KEY` 稳定。使用生成的引导值以 `admin` 身份登录，立即修改密码，然后从 `.env` 删除 `AETHER_BOOTSTRAP_ADMIN_PASSWORD`。示例设置 `AETHER_ALLOW_PUBLIC_REGISTRATION=false`，因此公共注册保持关闭。

## 启动并验证

```bash
aether services start
aether doctor
```

`aether services start` 会启动 Docker Compose Stack。Compose 文件引用预构建镜像；如果目标主机尚无 `aetherems:latest`，可以运行 `./scripts/build-installer.sh` 从交叉编译的二进制文件构建镜像，或通过 `docker load` 加载预构建镜像归档。详情见[部署](https://docs.aetheriot.ai/zh/guides/deployment/)。

`aether doctor` 检查必需的本地运行时；任何必需组件失败时都会以非零状态退出：

1. **Docker Engine**：Daemon 已安装并正在运行。
2. **六项核心服务**：IO、automation、history、API、uplink 和 alarm 的专用健康路由均正常。可选云端或存储依赖项可以报告降级，但不会因此成为核心故障。
3. **SQLite 数据库**：`aether.db` 存在、已初始化，并显示最后同步时间。
4. **配置文件**：`global.yaml`、`io/io.yaml`、`automation/automation.yaml` 和 `automation/instances.yaml` 均存在。
5. **共享内存**：Segment 文件 `/dev/shm/aether-rtdb.shm` 存在，并具有可读、有效的数据平面 Header 和新鲜的 IO Writer Heartbeat。SHM 是权威实时状态平面，因此缺失、陈旧、截断、符号链接或无效 SHM 都属于错误。安装刻意使用其他位置时，可以通过 `AETHER_SHM_PATH` 覆盖平台默认值。

所有组件健康后，以下端口会开始监听。各服务职责见[系统架构](https://docs.aetheriot.ai/zh/concepts/architecture/)。打包组合只对远程公开经过认证的 API Gateway；另外五项进程 API 只监听 `127.0.0.1`：

| 服务 | 端口 |
|---|---|
| aether-io | 6001 |
| aether-automation | 6002 |
| aether-history | 6004 |
| aether-api | 6005 |
| aether-uplink | 6006 |
| aether-alarm | 6007 |

AetherEdge 刻意不提供内置网页界面。AetherEMS 等产品 Console 独立部署，并通过 `aether-api` 接入。

## 获取操作员 Token

CLI 数据平面和 MCP 只能访问 `6005` 上经过认证的 API Gateway，因此每条 `aether` 数据命令都需要 Access Token。以引导管理员登录，并为当前 Shell Session 导出 Token。登录 API 要求密码的十六进制 MD5 Digest，而不是明文密码：

```bash
# 上面已从 Shell 清除引导值；从 .env 重新读取
bootstrap_password="$(grep '^AETHER_BOOTSTRAP_ADMIN_PASSWORD=' .env | cut -d= -f2-)"
digest="$(printf '%s' "$bootstrap_password" | md5sum | cut -d' ' -f1)"
export AETHER_ACCESS_TOKEN="$(curl -s http://localhost:6005/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"$digest\"}" | jq -r '.data.access_token')"
unset bootstrap_password digest
```

Token 默认 30 分钟后过期；命令报告 `401` 时应重新登录。日常操作应使用专用账户，而不是引导管理员。认证端点见 [HTTP API 参考](https://docs.aetheriot.ai/zh/reference/http-api/)。

## 确认安全空状态

默认模板刻意不包含设备 Channel 或 Instance，因此以下命令最初应返回空集合：

```bash
# 1. aether-io 正在轮询的通信 Channel
aether channels list

# 2. aether-automation 正在提供的设备 Instance
aether models instances list

# 3. 确认没有控制规则被隐式启用
aether rules list
```

每条命令都接受 `--json` 以返回结构化输出，AI 智能体和脚本应使用这一模式。只有显式投运步骤添加并启用 Channel 后，数据才会开始流动；下一步请连接设备。

## 后续步骤

第一个生产里程碑应是只读采集链路。连接一个默认禁用的 Channel，完成映射并验证质量和新鲜度，然后才审核规则或控制。

- [AetherEdge 用户旅程](https://docs.aetheriot.ai/zh/overview/user-journeys/)：完整安全生命周期和角色路径
- [连接设备](https://docs.aetheriot.ai/zh/guides/connect-devices/)：添加真实 Channel，并把点映射到 Instance
- [编写规则](https://docs.aetheriot.ai/zh/guides/writing-rules/)：使用规则引擎实现自动化控制
- [AI 助手](https://docs.aetheriot.ai/zh/guides/ai-assistants/)：通过 AI 使用 Aether
- [部署](https://docs.aetheriot.ai/zh/guides/deployment/)：Docker Compose 详情和边缘安装器
