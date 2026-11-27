---
title: "aether-store-local"
description: "供必须在没有外部服务的情况下运行的网关使用的本地适配器。"
updated: 2026-07-27
---

# aether-store-local

供必须在没有外部服务的情况下运行的网关使用的本地适配器。

| 适配器 | 持久性 | 预期用途 |
|---|---|---|
| `MemoryLiveState` | 进程内 | SDK 嵌入、测试、小型组合 |
| `MemoryHistorySink` | 进程内 | 测试和由宿主管理的持久化 |
| `MemoryHistoryQuery` | 进程内 | 数据处理使用的有界逻辑历史测试夹具 |
| `MemoryCovariateSource` | 进程内 | 数据处理使用的已知未来协变量测试夹具 |
| `SnapshotCovariateSource` | 可原子替换的 JSON | 无需外部服务的生产级已知未来协变量 |
| `MemoryAuditSink` | 进程内 | 测试和由宿主管理的持久化 |
| `SqliteAuditSink`（`sqlite-audit`） | 嵌入式 SQLite | 无需外部服务的强制命令审计 |
| `MemoryOutbox` | 进程内 | 一致性测试和临时工作负载 |
| `FileOutbox` | 崩溃可恢复的文件 | 生产环境的离线存储转发 |
| `MemoryCloudLinkSpool` | 进程内 | 确定性的应用 ACK/重放一致性测试 |
| `FileCloudLinkSpool` | 崩溃可恢复的文件 | 实验性的 CloudLink 位置、重放和丢失证据 |
| `FileIntegrationTopologyGenerationStore` | 原子替换的私有文件 | 跨重启保持稳定的各集成拓扑世代 |

`MemoryHistoryQuery` 和 `MemoryCovariateSource` 以完整的带版本 `BindingIdentity` 为键。它们只按请求顺序投影被请求的逻辑特征，应用半开时间窗口和硬性样本上限，并为每个返回的特征保留一条精确的出处条目。未知的绑定属于永久性的投运错误；选定窗口为空则仍是一种可用性结果。

这些读取适配器有意与 `MemoryHistorySink` 分开。查询或替换确定性的测试夹具不会修改只追加的历史接收器，也绝不会改变 SHM 实时状态的权威地位。

## SnapshotCovariateSource

`SnapshotCovariateSource` 是面向天气预报等预测协变量的生产级零服务适配器。构造时只保留路径和硬性上限，因此可选的快照缺失不会妨碍宿主启动。每次解析预测时，它都会在阻塞工作线程上读取当前已发布的文件，在解析之前先应用字节上限，并对文件做完整校验。

```rust
use aether_store_local::{SnapshotCovariateLimits, SnapshotCovariateSource};

# fn example() -> Result<(), Box<dyn std::error::Error>> {
let limits = SnapshotCovariateLimits::new(
    4 * 1024 * 1024, // file bytes
    256,             // bindings
    32,              // runs per binding
    64,              // features per run and response
    4_096,           // samples per run and response
)?;
let source = SnapshotCovariateSource::open("./data/covariates.json", limits)?;
# let _ = source;
# Ok(())
# }
```

JSON 的结构是严格的：未知字段和未知枚举值都会被拒绝。时间戳是 UTC Unix 毫秒。一次预测运行有一个发布时间、一个来源水位线、一套精确的有效时间网格，并为每个非确定性特征提供一个可安全脱敏的逻辑来源引用。

```json
{
  "schema": "aether.covariate-snapshot.v1",
  "bindings": [
    {
      "id": "example-site",
      "revision": 1,
      "runs": [
        {
          "issued_at_ms": 1783741200000,
          "watermark_ms": 1783741800000,
          "valid_times_ms": [1783743300000, 1783744200000],
          "features": [
            {
              "name": "temp_avg",
              "value_type": "number",
              "unit": "Cel",
              "source_ref": "weather.nwp.air_temperature",
              "values": [32.1, 32.0],
              "quality": ["good", "good"]
            }
          ]
        }
      ]
    }
  ]
}
```

`value_type` 为 `number`、`string` 或 `boolean`；非数值特征省略 `unit`。只有当对应的质量为 `missing` 时，值才可以是 `null`。质量为 `good`、`uncertain`、`substituted` 或 `missing`。

对于请求的 `as_of`，适配器选择满足 `issued_at_ms <= as_of` 的最新一次运行。如果最新的合格运行在网格、类型或单位上不符，它绝不会悄悄回退到更早的运行。所选运行的水位线也必须不晚于 `as_of`。请求的半开窗口和样本数量定义了一套精确的规则网格；有效时间缺失、多余或不在网格上时，结果是 `InvalidData`，而不是被截断的响应。

对于节奏为 `c` 的 v1 区间末预测，这套未来网格从 `as_of+c` 开始。当前的能源负荷/光伏任务要求每个非日历类未来协变量都带有 `issued_at`。

`quarter_hour` 是保留名称，不得存储在文件中。当它作为单位为 `1` 的数值型未来协变量被请求时，会根据 UTC 有效时间确定性地生成，出处为 `calendar.utc.quarter_hour`，水位线为请求的 `as_of`。

发布更新的方式是：先写入并同步一个同目录下的临时文件，再在同一文件系统上把它重命名覆盖到配置的路径。下一次解析就会看到新的运行集合。文件缺失返回 `Unavailable`；无效的更新返回 `InvalidData`（触及硬性上限时返回 `Rejected`），并且绝不复用内存中过期的快照。应避免原地写入，否则并发的读取器可能看到不完整的文件。

## FileOutbox

```rust
use std::sync::Arc;

use aether_ports::{DurableOutbox, OutboxMessage};
use aether_domain::TimestampMs;
use aether_store_local::FileOutbox;

# async fn example() -> Result<(), Box<dyn std::error::Error>> {
let outbox: Arc<dyn DurableOutbox> =
    Arc::new(FileOutbox::open("./data/uplink.outbox", 10_000)?);
outbox
    .enqueue(OutboxMessage::new(
        "telemetry/site-a",
        br#"{"temperature": 21.5}"#.to_vec(),
        TimestampMs::new(1_700_000_000_000),
    ))
    .await?;
# Ok(())
# }
```

每次成功的变更都已同步到日志。恢复时会重放校验和有效的完整记录，并把不完整或校验和无效的最后一条记录视为崩溃造成的撕裂尾部。如果损坏出现在某条后续已提交记录之前，则失败关闭，而不是丢弃后面的数据。日志只允许一个进程写入，按条目数量设限，并且可以通过 `FileOutbox::compact()` 回收空间。

长期运行的宿主应定期调用压缩；兼容性的 `uplink` 在启动时和每小时各执行一次。容量限制的是存活条目，压缩限制的是日志中已确认的过期记录。

磁盘持久性并不等于网络交付。条目何时可以被确认，由所选的 `UplinkPublisher` 决定。

## 集成拓扑世代

`FileIntegrationTopologyGenerationStore` 为第一个拓扑摘要保留世代 1，对相同的摘要返回相同的世代，并在返回发生变化的摘要之前先持久地递增世代。网关和集成共同构成计数器的完整作用域。适配器使用进程独占锁、私有替换文件、文件同步、原子重命名和父目录同步。状态损坏和 `u64` 耗尽都会失败关闭。

## CloudLink 待发送队列

`MemoryCloudLinkSpool` 和 `FileCloudLinkSpool` 实现专用的 `CloudLinkSpool` 端口。它们保存流纪元、单调位置、稳定的批次身份/摘要、发出/PUBACK 状态、最近一次持久的应用 ACK，以及容量溢出时的数据丢失证据。传输层的发布绝不会删除记录。会话过期、流错误、批次错误和摘要错误的 ACK 都会失败关闭；完全相同的重复 ACK 是幂等的。

文件适配器持有进程独占锁，并在增量日志中同步每一次状态转换。恢复时只截断不完整的尾部；校验和失败或语义失败属于损坏，即使发生在最后一条完整记录中也会失败关闭。`FileCloudLinkSpool::compact()` 以原子方式重写游标元数据和存活记录，适配器在发生 256 次变更后会先压缩再接受新的工作。它的文件格式独立于旧的 `FileOutbox`，不能通过通用发件箱端口打开。

## CloudLink 质询重放账本

`FileCloudLinkChallengeLedger` 在首次发布之前持久化一份精确的质询请求，并在首次发布之前持久化一份精确的已签名网关 hello。因此，重启后会重试原始的客户端随机数、恢复游标、云端质询和已签名的响应，而不是产生第二份认证记录。已完成的记录会擦除原始认证记录，只保留有界的重放证据。

该适配器仅支持 Unix。新建的直接父目录权限为 0700；已存在的直接父目录不得允许组或其他用户写入。账本文件、临时文件和锁文件的权限为 0600，打开时不跟随符号链接。存在多个硬链接的账本文件或锁文件会被拒绝。每次变更都在持有进程独占锁的情况下，使用经过同步并原子重命名的替换文件。该适配器只存储重放状态。它不是密钥库，也不提供网关注册、硬件支持的密钥托管或密钥轮换。
