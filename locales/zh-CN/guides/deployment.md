---
title: "部署"
description: "使用 Docker Compose 运行，或为边缘设备构建自包含的安装器"
updated: 2026-07-17
---

# 部署

Aether 可以部署为一组 Docker 容器，也可以在不使用 Docker 的目标上部署为原生 systemd 服务。共有三条路径：在能够构建镜像的机器上直接运行 Docker Compose 栈；把所有内容打包成一个基于 Docker 的自解压安装器并交付到边缘设备；或者构建裸机安装器，交付静态链接的二进制文件和 systemd 单元。

## Docker Compose

```bash
cp .env.example .env    # then edit: AETHER_BASE_PATH, HOST_UID/HOST_GID, RUST_LOG, ...

docker compose up -d
docker compose ps
```

默认 Compose 应用只启动六个 Rust 服务，全部使用 `network_mode: host`。TimescaleDB 只有在显式选择其 `postgres-storage` Profile 时才会启动。基础文件不定义也不启动任何领域专用的数据处理器。

AetherEdge 是无头的内核发行版，不构建也不安装浏览器客户端。EMS 操作员控制台、Energy Pack 和 Load-Forecasting 处理器属于独立的 [AetherEMS](https://github.com/EvanL1/AetherEMS) 发行版。

| 容器 | 镜像 | 职责 |
|-----------|-------|------|
| aether-timescaledb | timescale/timescaledb:2.25.2-pg17 | 可选的 PostgreSQL 历史记录后端（`postgres-storage` Profile） |
| aether-io | aetherems:latest | 通信服务（特权模式，挂载 `/dev` 以访问现场总线） |
| aether-automation | aetherems:latest | 模型服务和规则引擎 |
| aether-history | aetherems:latest | SHM 采样器，默认使用嵌入式 SQLite 历史记录 |
| aether-api | aetherems:latest | REST API、WebSocket、JWT 认证 |
| aether-uplink | aetherems:latest | MQTT 云端上行链路、TLS 证书 |
| aether-alarm | aetherems:latest | 告警规则和通知 |

通用的数据处理应用默认保持禁用。下游组合负责提供处理器镜像或进程、已投运的运行时 YAML、凭据、资源限制和网络策略。能源领域的组合见 [AetherEMS Load-Forecasting 处理器](https://github.com/EvanL1/AetherEMS/tree/main/processors/load-forecasting)。

历史库的权威性需要单独做一次运维检查。对存储执行 `PUT /hisApi/storage` 只保存设置，不会让当前的写入器重新连接。存储变更期间保持数据处理禁用，重新连接或重启 `aether-history`，核实其当前生效的 SQLite 后端和一条已投运的哨兵序列，然后重启 `aether-api`，并使运行时的 `history.path` 与实际生效的后端一致。仅凭持久化的 `history_config.storage_*` 行不能证明实时写入目标。

直接读取 SQLite 历史记录还需要一道文件系统边界。API 必须通过专用的只读目录挂载（或者权限独立的只读操作系统账户/ACL）获得历史数据库、WAL 和 SHM；它自己的 `aether.db` 和审计写入留在另一条可写路径上。基础 Compose 目前把整个 `/app/data` 目录以读写方式挂载进 `aether-api`，因此在站点覆盖配置提供并验证这种隔离之前，文档所述的生产数据处理路径是被阻断的。仅靠 SQLite 的 `mode=ro` 和 `query_only=ON` 不构成充分的隔离。

`/api/v1/data-processing/process` 调用是非幂等的，即使工作被拒绝也会写入一条强制审计记录。当前 API 不提供按操作者/IP 的请求限流器，也不提供审计保留配额。因此生产入口必须强制执行按已认证操作者和来源 IP 的速率限制以及在途请求上限，同时运维需要监控 `command_audit_events` 的增长，并采用能保留所需证据的保留/导出策略。没有这些控制措施，就不能在生产中启用；按路由设置的处理器信号量本身并不能限制被拒绝调用的审计写入。

下游处理器应绑定到环回地址，并且不获得任何 Aether 数据、配置、设备、历史数据库或 SHM 挂载。应用通过处理器端口发送完整且有界的 `ProcessingFrame`。下游组合还必须执行出站策略，以及经过实测的 CPU、内存和 PID 限制，使处理器负载不会饿死确定性服务。

六个 Rust 服务共用一个 `aetherems:latest` 兼容镜像，各自以自己的命令启动。在下游发布使用方完成迁移之前，镜像名称保持不变；这并不意味着本仓库拥有 EMS 产品或控制台。

主机网络不会让未认证的进程 API 对外公开：IO、自动化、历史、上行链路和告警只绑定到 `127.0.0.1`。远程客户端必须经由 6005 端口上的 `aether-api` 进入，JWT 和角色检查在那里生效。可选的 TimescaleDB 监听端口同样只在环回地址上。

对运行时而言，有两类挂载值得注意：

- **共享内存和本地事件套接字** — 主机的 `/dev/shm` 以绑定挂载的方式出现在全部六个 Rust 服务的 `/shm/aether`。该挂载是读写的，因为 SHM 所有者写入点位槽，而相互隔离的使用方会在段旁边创建各自的订阅位图和 UDS 端点。挂载目录还能避免 Docker 自动创建一个陈旧的文件条目。权威伴生文件是不可变的协调 inode，所有服务 UID 都可以对其加锁；使用方位图以共享读写模式创建，而重新打开已有的位图绝不会改写其所有者或权限。
- **可选的外部存储** — AetherEdge 不附带 Redis 镜像适配器，Compose 文件也不定义 Redis 服务；需要它的下游组合自行负责适配器及其基础设施。PostgreSQL 历史记录仍需通过 `--profile postgres-storage` 和启用了 PostgreSQL 的历史服务构建显式选用。选择该 Profile 之前，先设置一个唯一且非空的 `TIMESCALEDB_PASSWORD`；打包的安装器会生成一个，并且不会把它打印出来。

所有 Rust 容器都从 `${AETHER_BASE_PATH:-./data}/aether.db`（挂载在 `/app/data/aether.db`）读取共享的配置 SQLite 数据库，并把日志写入 `${AETHER_LOG_PATH:-./logs}`。aether-history 把采样存入 `/app/data/aether-history.db`，除非显式选择了启用 PostgreSQL 的构建和后端配置。

这些服务仍是六个独立的进程。SHM/UDS 取代的是强制性的实时数据消息代理，并没有抹平它们各自的重启边界和故障隔离边界。

## 边缘安装器

`scripts/build-installer.sh` 生成单个自解压的 `.run` 文件，其中包含离线边缘设备所需的一切：Docker 镜像归档、Compose 文件、配置模板、`aether` CLI 二进制文件和安装脚本：

```text
./scripts/build-installer.sh [VERSION] [ARCH] [TARGET] [--services=...] [--io-features=...] [--enable-swagger]
```

- `VERSION` — 版本字符串，默认为当天日期（`YYYYMMDD`）
- `ARCH` — `arm64`（默认）或 `amd64`
- `TARGET` — Rust 目标三元组；arm64 默认为 `aarch64-unknown-linux-musl`，amd64 默认为 `x86_64-unknown-linux-musl`
- `--services` / `-s` — 以逗号分隔的、要包含的子集（服务名称：`aether-io`、`aether-automation`、`aether-history`、`aether-api`、`aether-uplink`、`aether-alarm`、`timescaledb`；分组简写 `rust` 展开为全部六个 Rust 服务）。每个全新安装包都必须包含 Rust 核心；外部存储变体通过 `-s rust,timescaledb` 选择。默认安装包只包含 Rust 边缘运行时镜像；外部存储镜像必须显式选择。
- `--enable-swagger` — 编译唯一的 `aether-api` 网关 Swagger UI；它通过固定的网关路径呈现各服务自有的 OpenAPI 文档
- `--io-features` — 用一组显式的、以逗号分隔的选择替换 `aether-io` 的默认特性集。构建器会拒绝未知特性，对所需依赖只展开一次，并把同一份规范化后的集合同时用于二进制文件和打包的 `runtime-manifest.json`。

```bash
# Full installer for an ARM64 edge device
./scripts/build-installer.sh

# All Rust services only, with the gateway Swagger UI
./scripts/build-installer.sh v1.2.0 arm64 -s rust --enable-swagger
```

该脚本使用 `cargo zigbuild` 为目标三元组交叉编译六个服务和 `aether` CLI，用这些二进制文件构建 `aetherems` Docker 镜像，通过 `docker save` 保存镜像（选择了 TimescaleDB 时也包括它的镜像），再用 `makeself` 把结果打包为 `release/AetherEdge-<arch>-<version>.run`（通过 `--services` 构建子集时，文件名会追加服务列表后缀，`--enable-swagger` 会追加 `-swagger`）。构建主机需要 Docker、`cargo-zigbuild`（缺失时通过 `cargo install` 自动安装）和 `makeself`（在 macOS 上通过 Homebrew 自动安装）。

交付并运行：

```bash
scp release/AetherEdge-arm64-<version>.run root@192.168.30.21:/tmp/
ssh root@192.168.30.21 'chmod +x /tmp/AetherEdge-arm64-<version>.run && /tmp/AetherEdge-arm64-<version>.run'
```

内嵌的安装器**只支持全新部署**。它的第一步是只读预检：只要发现 Aether 安装根目录、安装上下文、站点配置或数据库、Aether 容器或 Aether systemd 单元，就会在停止任何服务、加载任何镜像或写入任何文件之前退出。在通过检查的干净主机上，它安装到 `/opt/AetherEdge`，用 `docker load` 加载随包镜像，在 `/opt/AetherEdge/data/config` 激活故障安全模板，把布局记录到 `/etc/aether/install.yaml`，初始化新数据库，并用 Docker Compose 启动六个容器。这种部署基于 Docker：安装器交付的是镜像和 Compose 配置，而不是独立的服务二进制文件。

本版本不支持就地升级、回滚到旧版本，也不支持导入旧数据库或旧安装布局。要替换一个安装，先导出并备份所有必须保留的内容，执行该部署对应的卸载流程，并在运行新安装器之前手动迁走或删除每一处保留下来的 Aether 痕迹。把保留的数据转换到新版本，目前是由操作员在安装器之外自行管理的迁移；不要让全新安装器指向旧的站点目录。

本版本有意把 `/opt/AetherEdge` 固定下来，因为打包的服务管理路径以这个组合根为前提。安装器会拒绝 `AETHER_INSTALL_DIR` 覆盖，而不是完成一个后续生命周期操作会指向另一个根目录的安装。`AETHER_BASE_PATH` 可以把一棵**全新且为空**的数据/配置目录树放到另一块磁盘上的专用子目录中，但必须在安装前选定，它不是迁移开关。在执行任何递归权限操作之前，安装器会拒绝 `/`、系统根目录、通用挂载根目录、符号链接路径、安装根目录，以及任何已包含 Aether 站点的目标。路径还被限制为能在 Docker Compose `.env` 中安全往返的字符。

位于站点根目录之外的 `AETHER_TIMESCALE_DATA_PATH` 属于外部服务存储。全新部署时它同样必须为空。复用或迁移外部存储不在安装器支持的流程之内。

安装器会生成 `AETHER_BOOTSTRAP_ADMIN_PASSWORD`，只把它保存在权限为 0600 的 `.env` 中，绝不打印其值。完成提示会给出一条本地取回命令。以 `admin` 登录，立即修改密码，然后删除这个引导变量。除非显式设置 `AETHER_ALLOW_PUBLIC_REGISTRATION=true`，否则匿名注册保持禁用。

API 容器以 `HOST_UID:HOST_GID` 运行。它既没有挂载 Docker 套接字，也没有挂载安装根目录，并且 `/etc/systemd/network` 是只读的。因此，修改主机网络的请求会失败关闭。不支持远程运行时升级；安装另一个版本需要走上面的显式全新部署流程，而不是扩大 API 进程的权限。

## 仅含 Pack 的工件

领域包 与全新安装的 `.run` 包分开发布。Pack 捆绑包只包含 `pack-artifact.json` 和声明式的 `pack/` 目录树，绝不包含 `aether` CLI、服务二进制文件或核心 crate。请根据为目标内核组合生成的那份确切的运行时清单来构建它：

```bash
./scripts/build-pack-artifact.sh \
  packs/<pack-id> \
  build/installer/runtime/runtime-manifest.json \
  release/<pack-id>.bundle
```

把该目录复制到已装有匹配内核的边缘主机上，然后用主机上的 CLI 安装：

```bash
aether packs install --artifact /tmp/<pack-id>.bundle
```

该命令会拒绝不同的内核版本、目标三元组或完整运行时清单摘要。它还会拒绝多余的顶层条目、符号链接、可执行文件/源码树、被篡改的载荷、无界的文件，以及不兼容的 `pack.yaml`。验证通过后，它把数据发布到已安装数据目录下的 `packs/<id>/<version>`，并且只有在验证了完整的候选激活 Pack 集合之后，才原子地替换 `global.yaml`。激活失败时保留先前的配置，并删除新发布的版本。

该命令不会重启服务，也不会投运 Pack。请另行安排维护重启，然后运行 `aether doctor`；启用通道、实例、规则、处理器或物理控制仍是一项独立的、经过审计的投运操作。本仓库可以构建并测试这种本地格式，但尚未声称具备独立发布/签名的内核工件、Pack 工件，或下游第二仓库的发布门禁。

## 裸机 Linux（systemd）

对于不能或不应运行 Docker 的边缘设备，`scripts/build-installer.sh --bare-metal` 生成第二种 `.run` 包：一个由静态链接的二进制文件和 systemd 单元组成的自包含包，对目标机器没有任何容器运行时依赖。它包含六个 Rust 服务、`aether` CLI 和核心 systemd 单元，由 `aether.target` 统一分组。该包不携带任何外部存储的二进制文件。

裸机运行时根目录同样固定为 `/opt/aether`，与打包的 systemd 单元一致。`AETHER_INSTALL_DIR` 覆盖会被拒绝。其引导管理员凭据保存在 `/etc/aether/aether.env`（权限 0600）中，取回、修改、删除的生命周期与 Docker 方式相同。

构建：

```bash
./scripts/build-installer.sh --bare-metal [VERSION] [ARCH]
```

它沿用与 Docker 构建相同的 `[VERSION] [ARCH] [TARGET]` 位置参数约定：`--bare-metal` 是额外加上的标志，其他参数的顺序不变。它交叉编译同样的六个服务和 `aether` CLI，并用 `makeself` 打包为 `release/AetherEdge-baremetal-<arch>-<version>.run`。裸机包必须包含 Rust 核心。TimescaleDB 在裸机上是外部服务，不由该构建器打包。

以 root 身份交付并运行；如果 PATH 中没有 `systemctl`，安装器会拒绝继续：

```bash
scp release/AetherEdge-baremetal-arm64-<version>.run root@192.168.30.21:/tmp/
ssh root@192.168.30.21 'chmod +x /tmp/AetherEdge-baremetal-arm64-<version>.run && /tmp/AetherEdge-baremetal-arm64-<version>.run'
```

`scripts/install-baremetal.sh`（`.run` 归档解压并运行的脚本）按如下布局安装：

| 路径 | 内容 |
|------|----------|
| `/opt/aether/bin/` | 服务二进制文件和 `aether` CLI |
| `/etc/aether/config/` | 已激活的配置（首次安装时来自 `config.template/`） |
| `/etc/aether/aether.env` | 显式的配置/数据/数据库路径、`AETHER_LOG_DIR`、`RUST_LOG`，以及新生成的机密（权限 600） |
| `/etc/aether/install.yaml` | CLI 使用的非机密安装布局（`config_dir`、`data_dir`、运行时模式、发布通道和已启用的 Pack） |
| `/var/lib/aether/` | 服务日志（`logs/`） |

它还会把 `aether` 符号链接到 `/usr/local/bin`，放置一个 `/etc/profile.d/aether.sh` PATH 条目，安装 systemd 单元，针对 `/etc/aether/config` 运行 `aether init` 和 `aether sync`，最后执行 `systemctl enable --now aether.target`。日常运维使用原生 systemd：

```bash
systemctl status aether.target
journalctl -u aether-io -f
```

`aether services` 和 `aether doctor` 会自动检测这种模式，无需任何标志，见 [CLI 参考：aether services](/zh/reference/cli#aether-services) 和 [aether doctor](/zh/reference/cli#aether-doctor)。检测逻辑（`tools/aether/src/deploy_mode.rs`）同时检查 `/etc/systemd/system/aether.target` 和 PATH 中的 `systemctl`；任一缺失就回退到 Docker Compose 代码路径。在 systemd 模式下，`aether services start/stop/restart/status` 把 `aether-io` 这样的规范服务名直接传给 `systemctl <verb>`（未指定服务时使用 `aether.target`），`aether services logs <service>` 则调用 `journalctl -u <service>`。`aether services build/pull/clean` 在这种模式下全部报错：裸机安装中没有容器镜像，`.run` 包也不是就地升级器。`aether services refresh --smart` 退化为普通的 `systemctl restart`，并打印一条说明 `--smart` 不起作用的提示，因为没有镜像可供比较。

没有任何 Rust 服务单元声明对外部存储的依赖。默认 target 独立启动并维持其 SHM/SQLite 工作。

裸机安装器与 Docker 安装器遵循同样的仅限全新安装的契约。在已有 `/opt/aether`、`/etc/aether`、`/var/lib/aether`、已安装单元或运行时数据的主机上重新运行 `.run` 包，会在只读预检阶段失败，此时 `aether.target` 尚未停止，文件也尚未被替换。不存在自动替换二进制文件、合并配置、迁移可选单元或回滚到上一版本的路径。请备份/导出需要的状态，卸载旧的运行时，并在安装新版本之前手动迁走每一处保留下来的痕迹；安装器目前不支持把这些状态导入新版本。这并不取消安装器对未完成的全新安装所做的失败清理。

使用安装器写入的脚本卸载：

```bash
/opt/aether/uninstall.sh
```

它会停止并禁用 `aether.target`，删除 systemd 单元、`aether` 符号链接、PATH 条目以及 `/opt/aether` 本身。`/etc/aether` 和 `/var/lib/aether`（配置和运行时数据）保留在原处。这些保留下来的目录会有意让之后的全新安装失败，直到操作员把它们导出、迁走或删除。

## 运行时路径

共享内存段的路径按以下顺序解析（`crates/aether-dataplane/src/core/config.rs`）：

1. `AETHER_SHM_PATH` 环境变量（如果已设置）
2. `/shm/aether/aether-live-state.shm`，如果 `/shm/aether` 目录存在（Docker 挂载点）
3. Linux 上为 `/dev/shm/aether-live-state.shm`
4. 其他平台为 `/tmp/aether-live-state.shm`（macOS 开发环境）

在容器内，`/shm/aether` 就是主机的 `/dev/shm`，因此两种视图指向同一个文件。Docker 还通过 `AETHER_M2C_SOCKET` 和 `AETHER_AUTOMATION_POINT_WATCH_SOCKET` 把 aether-automation 的命令套接字和 PointWatch 套接字放在这个目录中；原生部署保持 `/tmp` 默认值。外围服务的 PointWatch 套接字名称由解析出的 SHM 路径派生，因此每个进程绑定各不相同的端点。

其他状态：

- **SQLite** — `aether.db` 位于数据目录中：已安装设备上是 `/opt/AetherEdge/data`，Compose 检出中是 `./data`（`AETHER_BASE_PATH`）；容器内看到的是 `/app/data/aether.db`（`AETHER_DB_PATH`）。
- **嵌入式历史记录** — aether-history 默认把 `aether-history.db` 写入同一个数据目录（`AETHER_HISTORY_DB_PATH`）。PostgreSQL/TimescaleDB 是需要显式选用的存储适配器，不是基础运行时的前提条件。
- **配置** — `aether` CLI 首先遵循标志和 `AETHER_*_PATH` 覆盖，然后读取 `/etc/aether/install.yaml`。没有安装上下文时，源码检出使用 `./data/config` 和 `./data`；未登记的旧安装目录绝不会被隐式采用。
- **日志** — 主机上是 `${AETHER_LOG_PATH:-./logs}`，容器内是 `/app/logs`。

## 设备上的服务管理

已安装的 `aether` CLI 封装了 Docker Compose，用于日常运维：

```bash
aether services start      # start one or more services (or all)
aether services stop       # stop services
aether services status     # container status
aether services refresh    # recreate containers from the installed composition
aether services logs       # view service logs

aether doctor              # Docker, core services, SQLite, config files,
                           # shared memory
```

`aether services refresh` 根据设备上已安装的组合和镜像集重新创建容器。它是同一版本内的恢复操作，不是替换已安装版本的受支持途径。一次健康的 `aether doctor` 运行涵盖哪些内容，见[入门](/zh/guides/getting-started)。

## 通过单一 HTTPS 入口远程访问

远程客户端只能经由 `aether-api` 的 `6005` 端口访问 AetherEdge，而 CLI 与 MCP 桥接拒绝在非环回的明文 HTTP 上发送令牌。网关本身只说明文 HTTP，因此常驻的远程访问需要在它前面放一个终结证书校验 TLS 的入口。任何能做到这一点的反向代理都可以。本节给出一个面向常见边缘场景的具体配方：主机位于 NAT 之后，没有公网地址，也没有入站端口。

[Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/) 适合这种场景，因为 `cloudflared` 由主机主动向外拨号。它是由运维人员管理的主机进程，不属于 AetherEdge：运行时不会因此产生依赖，停掉它即可撤除远程访问，六个服务不受影响。

入口改变了什么，没有改变什么：

- **认证不变**。网关不读取任何转发头，也不给环回客户端任何特权，所以经隧道到达的请求与本地请求的授权方式完全相同：看访问令牌、角色和 scope。
- **TLS 在 Cloudflare 终结**。Cloudflare 能读到经过隧道的每一个令牌和载荷。如果某个站点不能接受这一点，请改用[连接 AI 助手](/zh/guides/ai-assistants)中的 SSH 方式。
- **限流要在边缘自己做**。网关没有按操作者或来源 IP 的限流器。暴露主机名之前，先为它添加一条[速率限制规则](https://developers.cloudflare.com/waf/rate-limiting-rules/)。
- **边缘超时不是命令结果**。网关未在 Cloudflare 的[代理读取超时](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)内响应时，Cloudflare 返回 `524`。命令可能已经被接受。按其他结果未知的情况处理：保留 `request_id`，不要自动重试。

把网关绑定到环回地址，使隧道成为唯一的远程路径。各服务使用主机网络，所以同一主机上的 `cloudflared` 仍能访问它。在 Compose 部署中，于 `.env` 里设置下面这一项并重建 `aether-api`：

```bash
AETHER_API_HOST=127.0.0.1
```

创建隧道，并把你所控制的域上的一个主机名路由到它。请使用 `edge.example.test` 这样的一级子域名：Cloudflare 的默认证书不覆盖 `edge.home.example.test` 这类更深的名称，而 CLI 会拒绝证书校验不通过的主机名。

```bash
cloudflared tunnel login
cloudflared tunnel create aether-edge
cloudflared tunnel route dns aether-edge edge.example.test
```

`tunnel create` 会打印隧道 UUID 以及凭据文件的写入位置。在 `config.yml` 中把隧道指向网关。末尾的兜底规则是必需的：

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: edge.example.test
    service: http://127.0.0.1:6005
  - service: http_status:404
```

校验规则，然后按照 [Cloudflare 的服务指南](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/)把隧道作为服务运行：

```bash
cloudflared tunnel ingress validate
```

从另一台机器检查边界的两侧。不带令牌的请求必须被网关拒绝，带令牌的 CLI 必须可用：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://edge.example.test/api/v1/io/api/channels
# 401

AETHER_API_URL=https://edge.example.test \
AETHER_ACCESS_TOKEN=<SCOPED_ACCESS_TOKEN> aether --json channels list
```

签发该令牌时，使用远程客户端所需的最窄 `scope`；见[连接 AI 助手](/zh/guides/ai-assistants#只读与写入访问)。

### 网关前的 Cloudflare Access

如果这个主机名上有 Cloudflare Access 应用，不带 Access 凭据的请求会在 Cloudflare 的边缘被拒绝。`aether` 无法完成浏览器登录，所以要给它一个 Access [服务令牌](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)：创建令牌，添加一条动作为 **Service Auth** 且包含该令牌的策略，然后通过 `AETHER_API_HEADERS` 传入令牌的两个请求头：

```bash
export AETHER_API_URL=https://edge.example.test
export AETHER_API_HEADERS='CF-Access-Client-Id=<CLIENT_ID>,CF-Access-Client-Secret=<CLIENT_SECRET>'
AETHER_ACCESS_TOKEN=<SCOPED_ACCESS_TOKEN> aether --json channels list
```

`AETHER_API_HEADERS` 是一组以逗号分隔的 `Name=value` 键值对。CLI 会在发往网关的每个请求上带上它们，`aether mcp` 也一样。在 MCP 客户端配置中，它们与 URL 和令牌放在同一个 `env` 块里：

```json
{
  "mcpServers": {
    "aether-site-a": {
      "command": "aether",
      "args": ["mcp"],
      "env": {
        "AETHER_API_URL": "https://edge.example.test",
        "AETHER_API_HEADERS": "CF-Access-Client-Id=<CLIENT_ID>,CF-Access-Client-Secret=<CLIENT_SECRET>",
        "AETHER_ACCESS_TOKEN": "<SCOPED_ACCESS_TOKEN>"
      }
    }
  }
}
```

- **Access 是第二道检查，不是替代**。网关仍然要求 `AETHER_ACCESS_TOKEN`，并按其角色和 scope 授权。服务令牌只决定请求能否到达网关。
- **这些值是机密**。没有对应的命令行标志，因为参数在进程列表中可见。CLI 不会在错误信息、`--json` 输出或 `--verbose` 日志中打印它们。
- **格式**：每个键值对在第一个 `=` 处拆分，名称和值两侧的空白会被忽略。值必须是 ASCII，且不能包含逗号。
- **输入无效时，命令在发出任何请求之前就会停止**。这包括缺少 `=` 的条目、无效的请求头名称或值、空值、重复的名称，以及保留名称。保留名称是 CLI 自己设置的请求头：`Authorization`、`X-Request-ID`、`Idempotency-Key`、`Content-Type`、`Content-Length`、`Host`、`Accept`、`If-Match`、`If-None-Match`，连接类请求头 `Connection`、`Transfer-Encoding`、`TE`、`Trailer` 和 `Upgrade`，以及所有以 `X-Aether-` 开头的名称。因此，确认只能来自 `--confirmed` 或 MCP 的 `confirmed: true` 参数，绝不会来自环境变量。
- **每个网关请求都需要受保护的传输**。只要设置了该变量，CLI 就拒绝在非环回的明文 HTTP 上发送任何网关请求，包括不带令牌的只读查询。发往环回网关 URL 的请求永远不经过代理，无论 `HTTP_PROXY`、`HTTPS_PROXY` 或 `ALL_PROXY` 如何设置，也无论是否设置了该变量。
- **重定向不离开网关的源**。只要设置了该变量，CLI 就不会跟随指向其他源的重定向，而是报告错误。
- **Access 和网关都会返回 `401` 和 `403`**。如果 CLI 报告拒绝了一个指向 Access 登录主机的重定向，或者 `401`/`403` 响应体不是网关的 JSON 错误，那就是 Access 拒绝了服务令牌，网关根本没有见到这个请求。Access 用这两种方式中的哪一种回应，取决于组织的[严格服务令牌认证](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/#strict-service-token-authentication)设置。响应体是网关 JSON 错误（一个带有 `code` 和 `message` 的 `error` 对象）的 `401`/`403` 已经通过了 Access：`401` 表示 `AETHER_ACCESS_TOKEN` 缺失、无效或已过期，`403` 表示其角色或 scope 不允许该请求。

## 相关页面

- [入门](/zh/guides/getting-started) — 构建、初始化并验证一份全新的检出
- [连接设备](/zh/guides/connect-devices) — 整套服务运行起来之后，添加通道并映射点位
- [连接 AI 助手](/zh/guides/ai-assistants) — 常驻入口之外的 SSH 方式
- [系统架构](/zh/concepts/architecture) — 这些容器所运行的服务
