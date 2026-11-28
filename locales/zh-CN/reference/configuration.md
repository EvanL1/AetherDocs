---
title: "配置参考"
description: "YAML 配置结构定义、协议通道权威、同步流水线和环境变量"
updated: 2026-10-02
---

# 配置参考

运行配置以 YAML、CSV 和 JSON 文件的形式存放在 `config/` 目录下，由 `aether sync` 导入 SQLite（`aether.db`）。启动时唯一的例外是 `global.yaml` 的 `packs` 列表：automation 和 `aether mcp` 直接读取同一个条目，这样 Pack 的身份和根目录就不会在两个进程之间出现偏差。

## 同步流水线

```
config/*.yaml, *.csv, *.json  →  aether sync  →  SQLite (aether.db)  →  services (at startup)
```

只编辑 YAML 文件不会产生任何效果。离线的 `aether sync` 要求拥有配置的服务处于停止状态，在一个事务中写入所有期望状态的头部，并在下一次受监管的服务启动时生效。在线的通道、实例、路由和规则变更则走各自的受治理应用命令，并自动对账其运行时投影。

`aether sync`（实现于 `tools/aether/src/core/syncer.rs`）在一个站点级 SQLite 事务内处理三个目标，因此任何一个目标失败都不会改动数据库：

- **global** — 把 `config/global.yaml` 解析到 `service_config` 表。
- **aether-io** — 把 `config/io/io.yaml` 解析到 `channels` 表，把各通道的 CSV 文件解析到四张点位表（`telemetry_points`、`signal_points`、`control_points`、`adjustment_points`）。通道名称重复会中止同步。
- **aether-automation** — 把 `config/automation/automation.yaml`、`instances.yaml` 和 `rules/*.json` 解析到实例表和规则表，从 `instance_routing.csv` 导入测量（`M`）条目，并校验 `config/automation/products/` 下的外部产品 JSON 文件。不存在独立的计算引擎同步路径：此前无人引用的 `calculations.yaml` 模板、它未被使用的表以及已失效的 API 结构定义类型都已移除。派生量改为在各条规则内用 `calculation` 节点表达（见[以规则表达控制策略](https://github.com/EvanL1/AetherEdge/blob/main/docs/domain/control-strategies.md)）。

写入之前，`aether sync` 会校验全部三个域。随后它在一个 SQLite 事务中应用 global、IO 和 automation 配置，因此靠后的域出错会回滚之前的所有更改。默认情况下，没有对应配置文件的行（例如通过 HTTP API 创建的规则）会被保留。使用 `--force` 时，受管理的表会被完全替换，但校验仍然是强制的。动作（`A`）路由被有意排除在这个兼容导入器之外：它选定未来设备命令的物理目标，必须使用经过认证、确认和审计的动作路由应用命令。出现 `A` 行会回滚整次同步。只要存在任何动作路由，`--force` 也会拒绝启动，因此它不可能级联删除一个已投运的命令目标。在删除这些路由的实例、通道、控制点或调节点之前，先通过受治理的路由 API 删除或迁移它们。测量路由仍由同步管理。

有两个相关命令容易与 sync 混淆：

- `aether init` 只初始化或升级**数据库结构**（`CREATE TABLE IF NOT EXISTS`，仅做迁移，拒绝重置已有数据库）。它不创建也不复制任何配置文件。
- `config/` 目录本身是在**部署时**搭好的：Docker 安装器（`scripts/install.sh`）把 `config.template/` 与二进制文件放在一起，并且只在干净的主机上把它激活到 `<data-dir>/config/`。只要存在任何已有的站点配置，仅限全新安装的安装器就会在写入之前失败。容器把这个新目录挂载在 `/app/config/`；安装器不合并、不升级也不导入操作员自有的配置。在开发检出中，`aether setup` 只规划并激活 `./data/config` 下由站点编写的四个安全文件，并在显式应用返回的计划 ID 之后初始化 `./data/aether.db`。之后开发者必须提供下文所述的显式组合清单；setup 绝不猜测编译了哪些 IO 特性。

## 目录布局

仓库的 `config.template/` 目录是规范的故障安全起点。它不包含任何已投运的通道、设备实例或已启用的控制规则。领域示例需要显式选用；能源示例位于 [AetherEMS](https://github.com/EvanL1/AetherEMS/tree/main/packs/energy/examples/config)。通用的配置布局如下：

```
config.template/
├── global.yaml                 # Shared settings: active Packs, API bind
│                               # host, log level/rotation, rule scheduler
│                               # tick interval (rules.tick_ms, default 100)
├── runtime-manifest.json       # Generated, checksummed build composition;
│                               # never inferred or edited by site setup
├── io/
│   ├── io.yaml                 # Empty channel list until commissioning
│   │                           # (modbus_tcp, bacnet_ip, iec101, cjt188,
│   │                           # gb32960, jt808, ...), enabled flag, protocol
│   │                           # connection parameters, per-channel logging
│   └── <channel-id>/           # (expected by the syncer; not shipped in
│       │                       # the template) One directory per channel,
│       │                       # named by its numeric channel id (e.g. 1/)
│       ├── telemetry.csv       # T (telemetry) point definitions
│       ├── signal.csv          # S (signal) point definitions
│       ├── control.csv         # C (control) point definitions
│       ├── adjustment.csv      # A (adjustment) point definitions
│       └── mapping/            # Protocol register mappings, one CSV per
│                               # point type (telemetry_mapping.csv, ...)
└── automation/
    ├── automation.yaml         # Instance auto-load is disabled by default
    ├── instances.yaml          # Empty instance map until commissioning
    ├── instances/              # Optional per-instance directories, each
    │   └── <name>/instance.yaml  # holding one instance definition
    ├── rules/                  # One JSON file per control rule (Vue Flow
    │   └── *.json              # graph: nodes, edges, priority, enabled)
    └── products/               # (optional, not in the template) Site-owned
                                # product JSON files; when present they may
                                # override models from an active Pack
```

点位类型简写：Aether 在所有 API 和文件格式中都用 T（遥测）、S（信号）、C（控制）和 A（调节）表示四类点位。

`global.yaml` 中的故障安全默认值是 `packs: []`，因此全新站点不暴露任何领域产品，也没有 Pack 自有的 MCP 知识。已安装的 Pack 通过一个与身份绑定的根目录来激活：

```yaml
packs:
  - id: energy
    root: /opt/aether/packs/energy
```

清单中的身份必须与 `id` 一致；兼容性、能力、协议、投运和资产限定检查必须全部通过。相对的 `root` 从配置目录解析，并且不能包含 `..`。如果 `automation.yaml` 设置了 `products_path`，这个站点自有的目录最后加载，可以有意覆盖某个激活 Pack 中的模型。运行时加载和 `aether sync` 都会拒绝符号链接、非常规文件或过大的 JSON、无效的 JSON，以及同一目录内重复的产品名称。

`runtime-manifest.json` 必须与 `global.yaml` 放在一起。它由运行时组合或安装器生成，不由 Pack 编写，也不由单个服务推断。这份封闭的 v1 文档在一个规范的 SHA-256 校验和之下记录 Aether 版本、目标、包含的服务、确切的 `aether-io` 协议特性、派生的适配器和应用能力。在激活任何 Pack 之前，Automation 和 MCP 会拒绝缺失、被篡改、版本不匹配、目标不匹配、未知、特性不一致、为符号链接、非常规文件或过大的清单。对于显式的本地开发组合，用以下命令生成它：

```bash
HOST_TARGET=$(rustc -vV | sed -n 's/^host: //p')
cargo run -p aether-runtime-catalog --bin aether-runtime-manifest -- \
  generate "$HOST_TARGET" data/config
```

要得到有意裁剪过的 IO 特性集，给 `generate` 传入第三个以逗号分隔的参数；不存在假定所有适配器都在场的回退。使用 `aether runtime-manifest`（或 `--path <artifact>`）可以运行与安装器、Automation 和 MCP 相同的校验器。

## 环境变量

Docker Compose 和各服务使用的关键变量（大多数可选值在 `.env.example` 中有示例；部署覆盖配置会加入必需的生产门禁）：

| 变量 | 默认值 | 用途 |
|----------|---------|---------|
| `AETHER_BASE_PATH` | `./data` | 站点配置和数据库的基础路径；日志使用 `AETHER_LOG_PATH` |
| `AETHER_LOG_PATH` | Compose 中为 `./logs` | 挂载进容器的主机日志目录；CLI 的日志命令也使用它 |
| `AETHER_TIMESCALE_DATA_PATH` | `./data/timescaledb/data` | 需显式选用的 Compose `postgres-storage` Profile 的主机数据库目录 |
| `TIMESCALEDB_USER` | `postgres` | 需显式选用的 Compose `postgres-storage` Profile 的数据库用户 |
| `TIMESCALEDB_PASSWORD` | 未设置（该 Profile 必需） | 可选 TimescaleDB 容器的密码 |
| `AETHER_API_HOST` | `0.0.0.0` | Compose 的输入，作为网关的 `API_HOST` 转发；设为 `127.0.0.1` 可将其限制为本地客户端 |
| `HOST_UID` | `1000` | 容器进程的用户 ID；必须与主机用户一致，以免出现文件权限问题 |
| `HOST_GID` | `1000` | 容器进程的组 ID；与 `HOST_UID` 配对 |
| `DIALOUT_GID` | `20` | 访问串口所需的 dialout 组 ID（仅限 Linux） |
| `AETHER_API_URL` | `http://localhost:6005` | `aether` CLI 数据平面和 MCP 使用的 API 网关基础 URL；唯一的远程应用边界 |
| `AETHER_API_HEADERS` | 未设置 | `aether` CLI 数据平面和 MCP 在每个网关请求上附带的额外 HTTP 请求头，格式为逗号分隔的 `Name=value` 键值对，用于网关前面的访问代理，例如 Cloudflare Access 服务令牌。这些值是机密。CLI 自己设置的请求头会被拒绝，包括 `Authorization` 和所有 `X-Aether-*` 名称；见[网关前的 Cloudflare Access](/zh/guides/deployment#网关前的-cloudflare-access) |
| `AETHER_SHM_PATH` | 由平台选定的 tmpfs 路径 | io 与只读使用方共享的规范权威点位状态段 |
| `AETHER_CHANNEL_HEALTH_SHM_PATH` | 同级的 `*-health` 路径 | 独立的权威通道连通性段；通常由 `AETHER_SHM_PATH` 派生 |
| `SHM_WRITER_STALE_AFTER_MS` | `30000` | 读取侧 SHM 适配器可接受的写入方心跳最大时长 |
| `SHM_IDENTITY_CHECK_INTERVAL_MS` | `250` | 检查规范 SHM inode 是否被替换的兜底间隔；正常的切换由代次围栏立即处理 |
| `SHM_TOPOLOGY_REFRESH_INTERVAL_MS` | `1000`（最小 `100`） | API、alarm 和 automation 重新加载一份 SQLite 拓扑快照，并原子地发布一个经过校验的点位/健康/路由代次所用的间隔 |
| `JWT_SECRET_KEY` | 未设置（必需） | 长度不少于 32 字节的共享访问 JWT 签名/验证密钥，供 aether-api 以及受治理的 io、automation 和 alarm 操作使用；由安装器生成，并保存在配置资产之外 |
| `AETHER_ACCESS_TOKEN` | 未设置 | `aether` CLI 数据平面和 MCP 附加到每个网关请求上的已签名访问 JWT。Viewer 令牌可用于查询；受治理写入（通道投运/生命周期、设备命令、动作路由变更、自动化/告警策略，以及 MCP 的 22 个写入工具）需要 Admin 或 Engineer 令牌 |
| `AETHER_UPLINK_CONTROL_TOKEN` | 未设置 | 长度不少于 32 字节的独立服务凭据，仅用于上行链路到 automation 的设备命令；由安装器生成，且绝不打印 |
| `DEVICE_SN` | 未设置 | 配置为 `auto` 时由安装器预置的上行链路设备身份；硬件序列号优先，其次以主机名兜底 |
| `AETHER_CONFIG_PATH` | 未设置 | automation 和 `aether mcp` 共用的配置目录；CLI 的路径解析可以通过部署上下文或 `--config-path` 设置它 |
| `AETHER_DATA_PATH` | 未设置 | 为 `aether` CLI 覆盖安装上下文中的数据目录 |
| `AETHER_INSTALL_CONTEXT_PATH` | `/etc/aether/install.yaml` | 覆盖已安装布局的描述文件；CLI 标志和上面两个路径变量优先 |
| `AETHER_BOOTSTRAP_ADMIN_PASSWORD` | 未设置 | 仅在 `users` 为空时必需；安装器会在其权限为 0600 的环境文件中生成一个强口令，首次修改密码后应将其删除 |
| `AETHER_ALLOW_PUBLIC_REGISTRATION` | `false` | 显式开启匿名 Viewer 注册；公开注册永远无法创建 Admin |
| `AETHER_DATA_PROCESSING_ENABLED` | `false` | 显式启用需选用的数据处理应用和 HTTP 路由；启用后若配置无效，启动会失败关闭 |
| `AETHER_DATA_PROCESSING_CONFIG` | `/app/data/config/data-processing/runtime.yaml` | 严格的运行时 YAML，包含已投运的任务、绑定、历史、协变量、处理器和审计组合；处理器专用的凭据变量由该文件命名，并由下游组合提供 |
| `RUST_LOG` | `info` | Rust 服务的日志级别；支持 `info,io=debug,automation=trace` 这样的过滤语法 |

### 服务绑定地址

每个服务读取自己的监听端口，但读取的变量名并不统一：三个服务用 `SERVICE_PORT`，三个用 `API_PORT`。Compose 会显式设置它们；源码部署或裸机部署如果不想用默认值，必须按进程分别设置。

| 变量 | 服务 | 默认值 | 用途 |
|----------|---------|---------|---------|
| `SERVICE_PORT` | io | `6001` | 环回监听端口 |
| `SERVICE_PORT` | automation | `6002` | 环回监听端口 |
| `API_PORT` | history | `6004` | 环回监听端口 |
| `API_PORT` | api | `6005` | 唯一的远程应用边界 |
| `API_PORT` | uplink | `6006` | 环回监听端口 |
| `SERVICE_PORT` | alarm | `6007` | 环回监听端口 |
| `API_HOST` | api | `0.0.0.0` | 网关绑定地址；Compose 转发 `AETHER_API_HOST` |
| `API_HOST` / `SERVICE_HOST` | 内部服务 | `127.0.0.1` | 环回绑定地址；具体变量因服务而异 |

### 内部服务地址

`aether-api` 和内部服务客户端使用相同的 `AETHER_*_URL` 名称。网关只接受带显式环回端口的 HTTP 源；格式错误或非环回的值会导致启动失败。Compose 把这些值从 `.env` 转发给网关。CLI 和 MCP 只使用 `AETHER_API_URL`。

| 变量 | 默认值 |
|----------|---------|
| `AETHER_IO_URL` | 网关中为 `http://127.0.0.1:6001`；内部客户端中为 `http://localhost:6001` |
| `AETHER_AUTOMATION_URL` | 网关中为 `http://127.0.0.1:6002`；内部客户端中为 `http://localhost:6002` |
| `AETHER_HISTORY_URL` | `http://127.0.0.1:6004` |
| `AETHER_UPLINK_URL` | 网关中为 `http://127.0.0.1:6006`；alarm 中为 `http://localhost:6006` |
| `AETHER_ALARM_URL` | `http://127.0.0.1:6007` |
| `AETHER_SERVICE_REQUEST_TIMEOUT_SECS` | `60` |

请移除已退役的 `AETHER_IO_SERVICE_URL`、`AETHER_AUTOMATION_SERVICE_URL`、`AETHER_HISTORY_SERVICE_URL`、`AETHER_UPLINK_SERVICE_URL` 和 `AETHER_ALARM_SERVICE_URL` 变量。只要它们存在，网关就会拒绝启动，包括值为空，或同时设置了当前名称的配置。

### 存储和 IPC 路径

| 变量 | 默认值 | 用途 |
|----------|---------|---------|
| `AETHER_DB_PATH` | `/app/data/aether.db` | 共享的 SQLite 配置数据库 |
| `AETHER_HISTORY_DB_PATH` | 与 `AETHER_DB_PATH` 同目录的 `aether-history.db` | 嵌入式历史数据库 |
| `AETHER_UPLINK_OUTBOX_PATH` | `/app/data/uplink.outbox` | CloudLink 待发送队列文件 |
| `AETHER_UPLINK_OUTBOX_CAPACITY` | `10000` | 待发送队列中消息的上限，超过后丢弃最旧的消息 |
| `AETHER_LOG_DIR` | `/app/logs` | 日志目录 |
| `AETHER_M2C_SOCKET` | `/tmp/aether-m2c.sock` | automation 向 io 分发受治理命令所用的 Unix 套接字 |
| `AETHER_AUTOMATION_POINT_WATCH_SOCKET` | 由 SHM 路径派生 | automation 的点位变化通知套接字 |
| `AETHER_API_POINT_WATCH_SOCKET` | 由 SHM 路径派生 | 网关的点位变化通知套接字 |
| `AETHER_ALARM_POINT_WATCH_SOCKET` | 由 SHM 路径派生 | alarm 的点位变化通知套接字 |
| `SHM_SNAPSHOT_PATH` | `data/shm-snapshot.bin` | 周期性的点位状态快照，用于重启后恢复 |
| `SHM_SNAPSHOT_INTERVAL` | `300` | 快照周期，单位为秒 |
| `SHM_RESTORE_ON_START` | `true` | 设为 `false` 时以空的点位状态启动，而不是恢复快照 |
| `CERT_DIR` | `/app/config/cert` | 证书目录 |
| `NETWORK_CONFIG_DIR` | `/etc/systemd/network` | 网关的网络端点读取的主机网络单元目录 |

在一台主机上运行两个实例，意味着要为第二个实例的上述每一条路径以及它的端口都单独赋值，因为默认值是整机全局的。IO 在其整个生命周期内，为每条点位和健康 SHM 路径持有一个独占的 `.writer.lock` 伴生文件。第二个 IO 只要使用其中任一路径，就会在改动拓扑之前失败。锁在进程退出（包括崩溃）时由操作系统释放；IO 运行期间请保留这些伴生文件。

### 时序和会话有效期

| 变量 | 默认值 | 用途 |
|----------|---------|---------|
| `DATA_FETCH_INTERVAL` | alarm 中为 `5`，api 中为 `1` | 轮询周期，单位为秒。两个服务读取同一个名称，但默认值不同，含义也不同 |
| `AETHER_IO_RECONCILIATION_INTERVAL_MS` | `2000` | io 将期望的通道状态与已应用的通道状态对账的间隔 |
| `POINT_WATCH_DEBOUNCE_MS` | `25` | 两次点位变化通知之间的最小间隔 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | 访问 JWT 的有效期 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | 刷新令牌的有效期 |

### 实验性的 CloudLink MQTT 设置

当前 `aether-uplink` 的生产组合保持在已弃用的 `legacy` 模式。实验性的 `aether-cloudlink-mqtt` 嵌入 API 暴露显式的 `legacy`、`cloudlink-v1` 和 `dual` 迁移取值；它不会在已有安装中悄悄启用 CloudLink。第一个使用真实消息代理的垂直切片是下面这个需显式开启的测试工具。只有当 `AETHER_CLOUDLINK_RUN_INTEGRATION=1` 时才会读取这些变量：

| 变量 | 默认值 | 用途 |
|---|---|---|
| `AETHER_CLOUDLINK_RUN_INTEGRATION` | 未设置 | 精确设为 `1` 才运行外部消息代理测试工具 |
| `AETHER_CLOUDLINK_BROKER_HOST` | `127.0.0.1` | 用户选定的 MQTT 消息代理主机名/IP |
| `AETHER_CLOUDLINK_BROKER_PORT` | `1883` | 用户选定的消息代理端口 |
| `AETHER_CLOUDLINK_BROKER_USERNAME` | 未设置 | 可选的消息代理用户名 |
| `AETHER_CLOUDLINK_BROKER_PASSWORD` | 未设置 | 可选的只写消息代理密码；绝不打印或序列化 |
| `AETHER_CLOUDLINK_BROKER_TLS` | 未设置 | 设为 `1` 时使用平台的 TLS 根证书 |
| `AETHER_CLOUDLINK_BROKER_CA` | 未设置 | 自定义 PEM CA 路径；存在时选用自定义 TLS |
| `AETHER_CLOUDLINK_BROKER_CLIENT_CERT` | 未设置 | 可选的 mTLS 客户端证书，与密钥一起配置 |
| `AETHER_CLOUDLINK_BROKER_CLIENT_KEY` | 未设置 | 可选的 mTLS PKCS#8 私钥，与证书一起配置 |
| `AETHERCLOUD_ROOT` | 未设置 | 可选的只读路径，供这个仅含边缘侧的测试工具之外的联合编排使用；测试不会修改或启动它 |

明文只被这个显式的开发测试工具接受。生产验证要求 TLS。MQTT v3.1.1、QoS 1、非保留消息以及按网关精确划分的主题由实验性的 CloudLink 配置档固定；MQTT 5 仍是可选的，正确性不能依赖它。

对于 MCP 写入，`--allow-write` 只是注册 22 个工具的写入允许列表。桥接把 `AETHER_ACCESS_TOKEN` 作为 `Authorization: Bearer` 凭据发送，并添加一个 `X-Request-ID`；每次调用仍然需要 `confirmed: true`。请保留返回的请求/命令 ID，不要自动重试超时或审计/发布不完整的结果。通道变更还会返回一个期望状态修订，并且可能在运行时投影降级的情况下成功；请检查 `request_id`、`resulting_revision` 和 `reconciliation_required`，而不是自动重试。

### 数据处理与历史存储变更

数据处理运行时的 `history.path` 必须指向正在运行的历史服务实际写入的 SQLite 文件。`history_config.storage_*` 下的值是持久化的期望设置。特别是，`PUT /hisApi/storage` 会保存它们，但不会让当前生效的后端重新连接，因此与这些行一致并不足以证明实时写入方。只在数据处理禁用时更改存储；重新连接或重启 `aether-history`，核实其当前生效的后端/健康状态和一条已投运的哨兵序列，然后以匹配的运行时路径重启 `aether-api`。

API 还需要对历史数据库/WAL/SHM 目录拥有独立的操作系统只读权限。请让该路径与 API 可写的配置/审计数据库分开。在基础 Compose 的 `/app/data:rw` 挂载之上使用 SQLite `mode=ro`，并不构成完整的生产权限边界。

## 相关页面

- [入门](/zh/guides/getting-started) — 首次设置和启动的完整流程
- [连接设备](/zh/guides/connect-devices) — 通道和点位配置的实际操作
- [协议适配器参考](/zh/reference/protocol-adapters) — 确切的特性门控、运行时 ID、参数和映射
- [编写规则](/zh/guides/writing-rules) — 存放在 `automation/rules/` 下的规则 JSON
- [HTTP API](/zh/reference/http-api) — 同步后的配置所支撑的运行时 API
- [系统架构](/zh/concepts/architecture) — 每个服务所处的位置
