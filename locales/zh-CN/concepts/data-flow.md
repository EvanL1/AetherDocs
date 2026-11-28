---
title: "数据流"
description: "基于 SHM 的端到端上行和下行路径，以及延迟预算"
updated: 2026-07-15
---

# 数据流

Aether 沿两条相互独立的路径传递数据。**上行**路径把测量点位，即遥测（T）和信号（S）值，从设备经 aether-io 送入共享内存，再从那里送达每个使用方。**下行**路径把动作点位，即控制（C）和调节（A）命令，从规则引擎或 HTTP API 经 aether-automation 送回设备。实时点位值和命令传输都以共享内存段作为事实来源和传输通道。没有任何默认服务需要 Redis 或 PostgreSQL 来处理实时数据。

## 上行（设备 → 使用方）

1. 协议帧到达某个通信通道，aether-io 中该通道的协议适配器把它解码为点位值。
2. aether-io 通过 `ShmAcquisitionStateWriter`（`libs/aether-shm-bridge/src/acquisition_writer.rs`）提交每个带类型的 T/S 批次。适配器在修改前后校验不可变的清单和写入器代次；按槽索引的写入是私有的实现细节。
3. **事件路径（立即）**。每次槽写入之后，`PointWatchPublisher`（`libs/aether-shm-bridge/src/point_watch.rs`）都会检查每个事件使用方各自拥有的独立位图。命中时，一个有界队列会向该使用方的 UDS 发送一个 `PointWatchEvent`。aether-automation、aether-alarm 和 aether-api 无法窃取或覆盖彼此的订阅。事件只是一个唤醒提示；每个使用方都会重新读取 SHM，丢失的事件由轮询修复。
4. **直接读取路径**。使用方从同一份 SQLite 拓扑快照解析通道/实例坐标，并重新读取对应的 SHM 槽。历史服务和上行服务把它们确切配置的点位和所需路由绑定到同一个已提交的点位/健康纪元，然后在一整轮采集/上传过程中固定这个不可变的代次。事件不会悄悄改变它们的节奏。

生产环境的 `aether-uplink` 组合仍然使用已弃用的旧版 MQTT 主题及其通用的 `FileOutbox` 交付边界。实验性的 CloudLink 路径把同一个被固定的代次转换为 `PointSample` 事实，加上发布纪元和拓扑摘要，并把规范的业务内容放入独立的 `CloudLinkSpool`。MQTT QoS 1/PUBACK 只推进传输状态；与之匹配的云端持久应用 ACK 是删除记录的唯一依据。连接断开时，记录在相同的流位置/批次 ID/摘要下保持可重放，并且不会阻塞任何 SHM 使用方。
```
Device ──frame──► aether-io protocol adapter (decode)
                        │
                        ▼  set_direct (~10 ns/point)
                  SHM T/S slot (authoritative)
                   │             │
      per-consumer │             │ periodic sampling
      bitmap + UDS │             ├─► aether-history
       ┌───────────┴────┐        └─► aether-uplink
       ▼                ▼
 aether-automation aether-alarm/aether-api
    event hint   event hint → SHM re-read
```

## 下行（规则/API → 设备）

1. 外部的 HTTP、CLI 或 MCP 控制调用在 aether-automation 中变成与传输无关的 `RequestContext`。`ControlApplication` 检查 `device.control` 权限和显式确认，在本地 SQLite 中持久化一条强制的“已尝试”审计事件，然后才调用命令分发器。在分阶段迁移期间，内部的确定性规则动作直接进入现有的分发器路径。
2. 分发器调用 aether-automation 的 `execute_action`（`services/automation/src/instance_data.rs`），它根据内存中的路由缓存（由 `aether sync` 填充的 `route:m2c` 表的镜像），把实例动作点位解析为其通道命令点位，并且**只解析一次**。解析出的目标会贯穿调用的其余部分，因此并发的路由重载不能在中途改变这个决定。
3. 离线闸门读取通道健康 SHM 段。通道离线时，在写入任何内容之前就以 `ChannelUnreachable` 拒绝这次写入。
4. 值校验通过后，`ShmDeviceCommandSink`（`libs/aether-shm-bridge/src/command_sink.rs`）镜像 C 或 A 槽。写入前后都会检查写入器代次和规范路径；不匹配意味着 aether-io 已经重启并重建了共享内存段，因此这次写入被丢弃、下发失败，而不是落入过期的布局。
5. 同一个命令适配器通过 Unix 域套接字发送一个固定大小的 56 字节帧。通知携带通道/点位坐标、值的位模式、发出/过期时间戳，以及用于去重的生产者 ID 加序列号。如果 aether-io 不可用，通知器会以指数退避（1–5 秒）重连。原生部署默认使用 `/tmp/aether-m2c.sock`；Docker 把 `AETHER_M2C_SOCKET` 设置为 `/shm/aether/aether-m2c.sock`，使两个相互隔离的容器都能看到这个套接字。
6. aether-io 的 `ShmCommandListener`（`services/io/src/core/channels/shm_listener.rs`）接收通知，拒绝已过期的帧，按序列号去重，并把命令转发到所属通道的队列。在协议下发之前，`CommandGuard` 会立即验证该可写点位存在，并且值满足其最小值/最大值/步长策略；只有这样，协议适配器才能把它写到现场总线。

实时命令数据从不经过数据库：传输通道是 SHM 加 UDS 通知。本地 SQLite 存储围绕外部命令的安全审计事件，但它不是命令交付的一部分，也从不镜像实时点位值。中途失败的下发（共享内存已写入但通知丢失，或者没有可用的写入器）会作为错误呈现给调用方；这些失败如何映射到 HTTP 状态码，见[数据模型](/zh/concepts/data-model)。

## 数据处理路径（源数据 → 派生数据）

Aether 数据处理为请求驱动的计算引入了第三条非权威路径。它既不是上行镜像，也不是下行命令路径：

```text
caller
  │ typed data-processing task
  ▼
DataProcessingApplication
  ├─ HistoryQuery ───────────── historical observations
  ├─ LiveState ──────────────── current read-only tail
  └─ task/request context ───── future or external covariates
             │
             ▼ complete, bounded ProcessingFrame
         DataProcessor
             │
             ▼ schema-validated, expiring ProcessingResult
       authenticated HTTP DerivedData response
```

应用解析语义绑定，对齐并聚合时间戳，要求已投运的单位/符号元数据完全一致，检查缺失和过期的输入，并把这些值放入处理器请求中发送。版本 1 不执行运行时的单位/符号转换。处理器永远不会得到 SHM、SQLite 或内部服务 API 的凭据，也永远不会通过回访 Aether 来解析站点标识符。

结果记录其输入水位线、输入摘要、处理器出处、质量、状态和过期时间。它是派生证据而不是测量值：它不会被写入归 IO 所有的 T/S 段。如果自动化服务要使用这个结果，需要由另一个独立的规划/控制用例先校验新鲜度和安全性，现有的受审计命令路径才能据此行动。因此，处理器丢失只是去掉了一项可选的参考性输入，不会中断采集或本地安全规则。完整的契约见[数据处理流程](/zh/concepts/data-processing-flow)。

事件时间上的 `as_of` 本身并不是一个历史知识截面。当前的历史库没有摄取/来源纪元，制品出处也没有训练/可用时间截面，因此时间点评估使用冻结的历史和制品输入，而不是为了一个旧的帧去查询今天仍可变的数据源。

## 延迟预算

微秒级的数字是 README 和 CHANGELOG 中记录的、在生产硬件（Cortex-A55 @ 1.4 GHz，ECU-1170 / EdgeLinux 22.04）上的历史测量值。纳秒级的数字是 README 对热路径写入给出的数量级；发布验收必须重新运行当前的压力门槛。

| 阶段 | 延迟 | 来源标注 |
|-------|---------|--------------|
| aether-io 共享内存写入（`set_direct`） | 每个点位约 10 ns | README |
| 数据变化 → aether-automation 收到事件（PointWatch 交付） | P50 206 µs，P99 526 µs | README/CHANGELOG，实测 |
| + 规则评估 + 控制 SHM 写入 + 向 aether-io 发送 UDS 通知 | P50 约 215 µs，P99 约 540 µs（累计） | README，实测 |
| + 设备协议写入（Modbus / IEC 104 现场总线） | 增加 5–10 ms | README |
| aether-alarm → aether-api/aether-uplink，服务间 HTTP 跳转 | 本地 HTTP | — |

CHANGELOG 还记录了事件路径的 P99.9 为 1.4–2.2 ms，并指出 PointWatch 取代了此前 100 ms 的 Redis 定时轮询模型（端到端 50–150 ms），关键路径上大约有 500 倍的改进。软件内部的控制路径是亚毫秒级的；现场总线写入在物理控制回路中占主导。

## 可选的状态镜像

下游状态镜像不是控制路径的参与者。自定义组合可以实现 `StateMirror` 端口并发布一份最终一致的远程视图，但没有任何内核服务读取这份镜像，它的故障也不会影响采集、规则、告警、历史、API 读取、上行或命令交付。

自定义存储留在本仓库之外，通过已发布的契约读取只读状态，保持非权威，并且不能成为核心服务的启动依赖。

## 相关页面

- [系统架构](/zh/concepts/architecture) — 这些路径所连接的服务
- [共享内存](/zh/concepts/shared-memory) — 槽布局、seqlock、写入所有权
- [数据模型](/zh/concepts/data-model) — 点位、实例以及 NaN/缺失语义
- [数据处理](/zh/concepts/data-processing) — 可选的与行业无关的处理边界
- [数据处理流程](/zh/concepts/data-processing-flow) — 处理器请求的数据流和失败语义
- [CloudLink MQTT v1](/zh/reference/cloudlink-mqtt-v1) — 实验性的应用 ACK/重放边缘路径
- [规则引擎](/zh/concepts/rule-engine) — PointWatch 事件到达之后发生什么
