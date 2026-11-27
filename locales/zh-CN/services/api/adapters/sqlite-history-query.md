---
title: "Aether SQLite 历史查询"
description: "面向 aether-history 所拥有的嵌入式 SQLite 文件的生产级 HistoryQuery 适配器。"
updated: 2026-07-27
---

# Aether SQLite 历史查询

面向 `aether-history` 所拥有的嵌入式 SQLite 文件的生产级 `HistoryQuery` 适配器。它读取现有的表：

```text
history(time_ms, series_key, point_id, value)
```

适配器绝不初始化或迁移这个表结构。构造是惰性的，因此历史数据库暂时不存在不会阻塞组合根。每次查询都以只读模式加 `query_only=ON` 打开或复用 SQLite；文件缺失或无法访问时返回带类型的 `Unavailable`，文件出现之后，后续查询即可恢复。所有 SQL 都使用绑定参数。

SQLite 的只读标志不是文件系统层面的安全边界。生产宿主必须通过专用的只读目录挂载，或等效的独立授权账户/ACL，把历史数据库文件族（数据库加上 WAL/SHM 文件）暴露给 API 读取器。当前的基础 Compose 把整个 `/app/data` 以读写方式挂载到 `aether-api` 中，因此尚未满足这一纵深防御要求；在部署覆盖配置把历史库的读取访问与 API 自身可写的配置/审计数据库分离之前，生产路由保持阻塞。

每条已投运的路由都固定了确切的任务身份、绑定身份、特征定义（包括单位）、任务节奏、核心 `HistoryAggregation` 和物理序列。不存在隐式的聚合默认值：路由和 `HistoryWindow` 必须声明相同的策略。重复数据的处理同样归任务所有：`Latest` 在聚合之前保留同一时间戳上 SQLite `rowid` 最大的那一行，而 `Reject` 以带类型的无效数据失败。逻辑上的 `(task, binding, feature)` 路由是唯一的。同一个物理 `(series_key, point_id)` 可以被不同任务复用，使每个任务都能应用自己投运的节奏和聚合策略。

对于逻辑上的区间末标签 `t`，落在 `(t - cadence, t]` 内的原始数值观测按投运的 `Mean`、`Last`、`Sum`、`Min` 或 `Max` 策略归约，并以 `t` 作为时间戳。EMS 负荷路由显式使用 `Mean`。输出始终是请求的完整网格；没有数值观测的桶用 `FeatureValue::missing()` 和 `SampleQuality::Missing` 表示。空值行不参与聚合，也不推进出处。已存储特征的水位线是实际参与聚合的原始数值观测的最大时间戳，而不是桶标签。读取绝不会越过 `HistoryWindow::cutoff()`。

每次已存储特征的查询都会请求 `max_raw_samples_per_feature + 1` 行。如果多出的那一行存在，操作将失败关闭，而不是悄悄截断原始输入。日历特征（包括 UTC 的日内 15 分钟序号）基于同一套区间末网格确定性地生成。一次逻辑查询中的所有特征读取共享一个读事务，因而共享同一个 SQLite 快照。

这个快照在调用时刻是读一致的；它并不是针对 `as_of` 的历史时间点快照。当前的表既没有 `ingested_at`/系统时间列，也没有来源纪元或配置纪元。因此，在某个较早的 `as_of` 之后回填的行可能出现在之后的重放中，而在同一个 `(series_key, point_id)` 背后被重新映射的设备可能把新旧物理来源拼接在一起。任务修订号和绑定修订号会针对当前路由失败关闭，但无法过滤从未随行存储的纪元。离线的基准样本或回测应使用在评估截面处捕获的冻结数据库/导出。严格的时间点适配器需要双时态的摄取元数据以及存储下来的来源/绑定纪元，并同时按这两个截面查询。

适配器路径也只是部署配置，不能证明哪个历史写入器处于活动状态。`history_config.storage_*` 记录的是已保存的意图，而 `PUT /hisApi/storage` 不会让正在运行的历史后端重新连接。在更改存储期间应禁用数据处理，重新连接或重启 `aether-history`，验证活动的 SQLite 后端和一条已投运的哨兵序列，然后使用相同的路径重启 `aether-api`。当前的权威性检查本身无法区分已保存的意图和尚未重新连接的写入器。

```rust
use aether_domain::{
    BindingIdentity, FeatureDefinition, FeatureRole, HistoryAggregation,
    HistoryDuplicatePolicy, TaskIdentity,
};
use aether_sqlite_history_query::{
    SqliteHistoryFeatureRoute, SqliteHistoryQuery, SqliteHistoryQueryConfig,
};

# async fn example() -> Result<(), Box<dyn std::error::Error>> {
let task = TaskIdentity::new("energy.site-load-forecast", 1)?;
let binding = BindingIdentity::new("site-a", 1)?;
let load = FeatureDefinition::numeric("load", FeatureRole::History, "kW")?;
let route = SqliteHistoryFeatureRoute::stored(
    task,
    binding,
    load,
    900_000,
    HistoryAggregation::Mean,
    HistoryDuplicatePolicy::Latest,
    "inst:1:M",
    "101",
    "site.load.active_power",
)?;
let config = SqliteHistoryQueryConfig::new(
    "/var/lib/aether/aether-history.db",
    vec![route],
    100_000,
)?;
let history = SqliteHistoryQuery::open(config).await?;
# let _ = history;
# Ok(())
# }
```

使用真实 SQLite 的契约测试这样运行：

```bash
cargo test -p aether-sqlite-history-query
```
