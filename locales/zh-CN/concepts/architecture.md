---
title: "系统架构"
description: "相互隔离的边缘服务，通过共享内存、各使用方独立的 UDS 事件、SQLite、HTTP 和 MQTT 通信"
updated: 2026-08-02
---

# 系统架构

Aether 是一个 AI 原生的工业边缘网关，由六个独立受监管的 Rust 服务围绕共享内存热路径构建而成。aether-io 轮询设备，值写入 SHM，每个实时使用方从 SQLite 解析自己的逻辑点位并直接读取共享内存段。下游组合可以把 SHM 镜像到外部存储，但没有任何内核服务读取这份镜像。生成的应用和下游产品界面都是可选的客户端；它们不是边缘内核的架构边界。

```
  Devices ─────► aether-io(:6001) ───── authoritative SHM live state
   protocols       sole T/S writer       │          │
                         ▲               │          └─ downstream read-only mirror
                         │ SHM + UDS      │
                         └──── aether-automation(:6002) (rules / C/A command owner)
                                          │
                 ┌──────────────┬──────────┼──────────────┐
                 ▼              ▼          ▼              ▼
          aether-alarm(:6007) aether-history(:6004) aether-api(:6005) aether-uplink(:6006)
          SHM + own event  SHM sampling  SHM + own event  SHM sampling
          bitmap / UDS     SQLite history bitmap / UDS    durable outbox
                 │              │          │              │
                 └─ local HTTP ─┘          └─ WebSocket   └─ MQTT cloud

  SQLite aether.db ───── configuration/discovery for every process
  SQLite history.db ──── default local historian store
  PostgreSQL/TimescaleDB ─ optional history adapter
```

在参考 Docker 部署（`docker-compose.yml`）中，每个容器都以 `network_mode: host` 运行。`/dev/shm` 以读写方式挂载到 `/shm/aether`，用于主共享内存段、各使用方的订阅位图以及跨容器的 UDS 套接字。五个内部进程 API 绑定到 `127.0.0.1`；只有受 JWT 保护的 `aether-api` 网关可以远程访问。设备动作还会由自动化服务再次认证，因此环回请求头无法冒充操作员。没有任何核心服务挂载 Redis 套接字或等待外部数据库。

## 服务

默认部署端口定义在 `libs/common/src/service_ports.rs` 中，当运行时配置没有覆盖它们时，工具以其作为回退值。

| 服务 | 端口 | 职责 |
|---------|------|------|
| aether-io | 6001 | 通信服务：显式编译的物理协议驱动（Modbus、IEC 101/104、IEC 61850、OPC UA、BACnet/IP、MQTT、HTTP、DL/T 645、CJ/T 188、GB/T 32960、JT/T 808、CAN/J1939、GPIO、BLE、Zigbee、Aether-485）、通道管理，是向共享内存写入遥测的唯一写入器 |
| aether-automation | 6002 | 模型服务：产品定义、设备实例、规则引擎执行 |
| aether-history | 6004 | 历史数据服务：默认使用嵌入式 SQLite；可通过 `postgres-storage` 选用 PostgreSQL / TimescaleDB |
| aether-api | 6005 | API 网关：统一的 REST API、向浏览器推送的 WebSocket、JWT 认证 |
| aether-uplink | 6006 | 网络服务：云端上行链路的 MQTT 消息代理集成、TLS 证书管理 |
| aether-alarm | 6007 | 告警服务：告警规则、告警事件、通知 |
| TimescaleDB | 5432 | 用于历史数据的可选时序数据库，通过 aether-history 在运行时配置 |

## IO 运行时组合

```text
SQLite
  ├─ fixed 5-scan snapshot transaction
       └─ owned RuntimeChannelConfig
            └─ process-wide immutable protocol registry
                 └─ selected adapter compiles its typed mappings once
                      └─ ChannelManager common lifecycle/task/SHM wiring
  └─ fixed 2-scan post-activation authority witness
```

一次完整的对账只读取一遍通道表和四张带类型的点位表，与通道数量无关。运行时投影之后，再用一次通道修订号/启用状态扫描和一次墓碑扫描，验证所投影的代次仍然具有权威性；出现漂移时会隔离受影响的运行时，而不是让过期的采集继续在线。这份自有的快照在投影过程中按值传递，协议运行时绝不会重新打开 SQLite。

被选中的适配器拥有自己严格的参数结构定义、映射结构定义和具体的带类型地址。因此 `ChannelManager` 没有 SQLite 连接池、协议分支或映射预处理；它只添加共享的运行时策略、日志、命令防护、生命周期/任务发布和 SHM 接线。SHM 采集路径只接受带有 `aether_domain::PointQuality` 的有限数值或布尔型 T/S 样本；文本、缺失值和非有限值会在写入实时状态之前失败关闭。

## 可选的数据处理应用

Aether 数据处理在不改变默认六服务的前提下，增加了一项与行业无关的应用能力。它从只读的实时状态、历史查询、请求上下文和行业包绑定中组装有界的观测帧，然后调用配置的本地或远程 `DataProcessor`。

```text
authenticated HTTP
              │ typed processing query (non-idempotent)
              ▼
  DataProcessingApplication
       ├─ LiveState (read-only)
       ├─ HistoryQuery
       └─ task/context inputs
              │ complete ProcessingFrame
              ▼
         DataProcessor
              │ validated, expiring result
              ▼
       direct DerivedData response
```

处理器被有意放在 Aether 的所有数据权威之外：它不能附加到 SHM，不能读取历史数据库，也不能通过回调内部服务 API 来解析 `plant_id`。默认运行时不需要任何处理器。部署可以在进程内组合这项能力，也可以把模型和网络依赖隔离在处理器边车之后。版本 1 把 `DataProcessingApplication` 托管在需要显式启用的 `aether-api` 中；没有实现独立的 `aether-data-processor`、缓存、CLI/MCP 绑定或调度器。该进程名称保留给未来的编排边界。

默认的 SQLite 读取是一份调用时刻的快照，而不是双时态的历史截面。`as_of` 过滤的是事件时间，而延迟摄取、物理来源纪元以及模型训练/可用时间截面，需要冻结的评估输入或更强的适配器/契约。

数据处理绝不写入归 IO 所有的 T/S 平面，也绝不下发设备命令。自动化服务可以把新鲜且经过校验的派生数据用作另一个独立的规划或控制用例的输入之一，而该用例的授权、安全和审计规则保持不变。见[数据处理](/zh/concepts/data-processing)和[数据处理流程](/zh/concepts/data-processing-flow)。

## 通信路径

下面的延迟数字来自历史上 `README.md` 和 CHANGELOG 中在生产硬件（Cortex-A55 @ 1.4 GHz，ECU-1170）上的测量。发布验收使用当前的跨进程压力门槛和长稳门槛。

| 路径 | 机制 | 延迟等级 |
|------|-----------|---------------|
| aether-io → 所有使用方（实时数据） | 共享内存写入；每个使用方从 SQLite 解析配置的槽 | 每个点位写入 SHM 约 10 ns |
| aether-io → aether-automation/aether-alarm/aether-api（点位变化提示） | 各使用方独立过滤的 PointWatch 位图 + UDS | 有界的亚毫秒级本地事件路径；轮询修复丢失的事件 |
| aether-automation → aether-io（控制命令） | 共享内存写入加 UDS 通知（aether-io 一侧的 `ShmCommandListener`） | 亚毫秒级；包含规则评估在内 P50 约 215 µs（实测） |
| aether-io → 设备（协议写入） | 现场总线（Modbus、IEC 104 等） | 增加 5–10 ms；在物理控制回路中占主导 |
| aether-alarm → aether-api、aether-uplink | HTTP（目标通过 `AETHER_API_URL` / `AETHER_UPLINK_URL` 配置） | 本地 HTTP |
| aether-uplink → 云端 | 默认使用旧版 MQTT；与消息代理无关的实验性 CloudLink MQTT v1 需要显式启用 | 网络 |
| aether-api → 生成的/下游客户端 | 带认证的 HTTP 和 WebSocket | 网络 |
| 所有服务 ↔ SQLite | 进程内配置发现（`AETHER_DB_PATH`）；aether-history 使用单独的嵌入式历史文件 | 本地 |

如果 aether-io 重启，UDS 通知通道会以指数退避（1–5 秒）自动重连，因此重启 aether-io 不需要重启 aether-automation。

有两个性质保证热路径的安全：

- **写入所有权**。aether-io 是共享内存中遥测/信号槽的唯一写入器；aether-automation 是控制/动作槽的唯一写入器。见[共享内存](/zh/concepts/shared-memory)。
- **事件只是提示，SHM 才是事实**。事件使用方总是重新读取槽；aether-history 和 aether-uplink 保持基于间隔的采样语义。
- **外部存储始终位于实时路径之外**。六个默认服务全部可以在没有 Redis 或 PostgreSQL 的情况下启动和运行。下游镜像不能成为控制路径的一部分。

## 启动顺序

aether-io 拥有点位/健康 SHM 的发布权，通常最先启动。它用同一个非零纪元和最终的提交见证发布两个平面；aether-automation 只能附加到与其从 SQLite 派生的清单相符、且属于同一次已提交发布的文件。

这个顺序由应用代码强制执行，而不是让每个外围服务都依赖 Redis。外围的 SHM 读取器惰性打开，可以先于 aether-io 启动；写入器缺失是一种在读取时可重试的状况。aether-io 重启时，新的点位代次和健康代次会被完整初始化，并以原子重命名的方式覆盖各自的规范路径。现有使用方继续持有旧的 inode，直到它们的周期性身份检查重新打开新的代次，并且它们的订阅位图不会被截断：

1. aether-automation 对 aether-io 没有 HTTP 存活依赖。它从 SQLite 加载规范拓扑，创建一个惰性的 SHM 代次，在写入器离线时也能完成启动。
2. 当 aether-automation 打开实时状态时，`ShmReadTopologyGeneration` 会检查两个物理标头和提交见证。哈希、槽数量、纪元或写入器代次不匹配时，实时状态保持可重试的不可用状态，直到服务发布一个完整的代次。

## 配置流程

```
config/*.yaml ──► aether sync ──► SQLite (aether.db) ──► services load at startup
```

配置以 YAML（以及 CSV 点表）的形式编写在 `config/` 下。`aether` CLI 解析它并写入共享的 SQLite 数据库（`tools/aether/src/core/syncer.rs`）；服务只从 SQLite 读取，没有任何服务 crate 解析 YAML。每个服务容器都收到同一个指向 `aether.db` 的 `AETHER_DB_PATH`。aether-io 会根据 SQLite 自动对账通道运行时、点位/健康布局、协议映射和路由投影；受治理的显式对账仍然可用于操作员恢复。

## 状态存放在哪里

- **实时点位值**：共享内存段（`AETHER_SHM_PATH`，Linux 上为 `/dev/shm`）。这是热路径的事实来源；见[共享内存](/zh/concepts/shared-memory)。
- **下游镜像**：自定义组合可以通过只读契约观察 SHM，并发布一份最终一致的外部视图。它永远不是事实来源，也不是内核服务的启动依赖。
- **SQLite（`aether.db`）**：所有配置：通道、产品、实例、规则、服务设置。只由 `aether sync` 和各服务自己的配置 API 写入。
- **历史数据库**：默认是嵌入式的 `aether-history.db`。PostgreSQL / TimescaleDB 仍是面向较大部署的可选适配器。

## 相关页面

- [共享内存](/zh/concepts/shared-memory) — 段布局、seqlock、写入所有权
- [数据流](/zh/concepts/data-flow) — 端到端的上行和下行路径
- [数据处理](/zh/concepts/data-processing) — 可选的跨行业处理编排
- [数据处理流程](/zh/concepts/data-processing-flow) — 数据组装和派生结果流程
- [规则引擎](/zh/concepts/rule-engine) — aether-automation 如何评估和执行规则
- [数据模型](/zh/concepts/data-model) — 产品、实例、点位
- [部署指南](/zh/guides/deployment) — Docker Compose 和安装器
