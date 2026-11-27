---
title: "数据处理契约"
description: "处理帧、请求、派生结果、校验与失败语义的版本 1 契约"
updated: 2026-07-11
---

# 数据处理契约

本参考规定了 **Aether 数据处理**已实现的版本 1 契约。Rust 领域值和编排位于 `aether-domain`、`aether-ports` 和 `aether-application` 中；`aether-data-processing` 提供严格的、与传输无关的 JSON 编解码器，`services/api/adapters/http-data-processor` 实现可选的 HTTP 传输。

这份契约体现了一条架构规则：Aether 先组装完整的输入帧，再请求处理器。`DataProcessor` 永远得不到可用来读取 Aether 的 SHM、历史数据库或站点配置的凭据或回调。

## 契约族

| 契约 | 标识符 | 用途 |
|----------|------------|---------|
| 任务声明 | `aether.data-processing-task.v1` | 可移植的领域语义和输入绑定 |
| 应用请求 | `aether.data-processing.process-task-request.v1` | 选择已投运的任务、绑定、数据截面和带类型的选项 |
| 处理帧 | `aether.processing-frame.v1` | 对齐后的观测和未来已知的协变量 |
| 处理器请求 | `aether.data-processing.request.v1` | 已解析的任务和绑定、截止时间、完整的帧、摘要和带类型的选项 |
| 结果信封 | `aether.data-processing.result.v1` | 状态、出处、过期时间和带类型的派生数据 |
| 预测输出 | `aether.data-processing.output.forecast.v1` | 处理器产生的、按时间索引的预测值 |
| 已接受的派生数据 | `aether.derived-data.v1` | 由 Aether 盖章、经过校验的任务输出 |
| 错误信封 | `aether.data-processing.error.v1` | 带类型的传输失败或处理器失败 |

HTTP 适配器使用以下媒体类型：

```text
application/vnd.aether.data-processing+json;version=1
```

契约标识符是精确的、区分大小写的字符串。版本 1 的使用方必须拒绝不受支持的主版本，而不是猜测如何解释它。只有在结构定义明确允许的位置才可以引入新增字段；实现不得利用未知字段，借通用信封夹带厂商专用的命令。

下文中的关键词 **MUST**（必须）、**MUST NOT**（不得）、**SHOULD**（应当）和 **MAY**（可以）具有规范性含义。

## 通用取值规则

- 时间必须是以 `Z` 结尾的 RFC 3339 UTC 字符串，不早于 Unix 纪元，精度不高于毫秒。它们可以无损地映射到 `TimestampMs`；编码器可以省略为零的小数部分，但不得输出超过三位小数。处理器不得悄悄地重新解释本地时间或数值形式的纪元值。
- 时长和节奏必须是大于零的整数秒。
- 数值必须是有限的 JSON 数字。`NaN`、正无穷和负无穷均无效。
- 缺失样本必须是 JSON `null`，并且样本质量为 `missing`。
- 数值特征和数值输出必须显式给出单位。任务声明选定规范单位。当前的 v1 运行时校验已投运的来源元数据已经与该单位和符号约定一致；它不会在请求时转换其中任何一项。
- 特征名称必须与任务声明完全一致，并且在段内唯一。
- 在 Aether 消解重复数据之后，时间戳必须严格递增。
- 摘要使用小写十六进制的 SHA-256，并带有前缀 `sha256:`。

## `ProcessingFrame`

`ProcessingFrame` 携带所选处理器获准使用的全部数据。它包含历史观测、可选的未来已知协变量、可选的静态特征、聚合质量，以及可安全脱敏的出处。

### 形状

```json
{
  "schema": "aether.processing-frame.v1",
  "as_of": "2026-07-11T12:00:00Z",
  "cadence_seconds": 900,
  "history": {
    "timestamps": ["2026-07-11T11:45:00Z", "2026-07-11T12:00:00Z"],
    "features": {
      "load": {
        "value_type": "number",
        "unit": "kW",
        "values": [820.0, 835.0],
        "quality": ["good", "good"]
      }
    }
  },
  "future_covariates": {
    "timestamps": ["2026-07-11T12:15:00Z", "2026-07-11T12:30:00Z"],
    "features": {
      "temp_avg": {
        "value_type": "number",
        "unit": "Cel",
        "values": [32.1, 32.0],
        "quality": ["good", "good"]
      },
      "quarter_hour": {
        "value_type": "number",
        "unit": "1",
        "values": [49, 50],
        "quality": ["good", "good"]
      }
    }
  },
  "static_features": {
    "rated_power": {
      "value_type": "number",
      "unit": "kW",
      "value": 2500.0,
      "quality": "good"
    }
  },
  "quality": {
    "input_watermark": "2026-07-11T11:59:58Z",
    "missing_ratio": 0.0,
    "max_gap_seconds": 900,
    "live_tail_included": false,
    "substituted_samples": 0
  },
  "provenance": [
    {
      "segment": "history",
      "feature": "load",
      "source_kind": "history",
      "source_ref": "energy.site.load.active_power",
      "watermark": "2026-07-11T11:59:58Z"
    },
    {
      "segment": "future_covariates",
      "feature": "temp_avg",
      "source_kind": "covariate",
      "source_ref": "weather.nwp.air_temperature",
      "watermark": "2026-07-11T11:50:00Z",
      "issued_at": "2026-07-11T11:40:00Z"
    },
    {
      "segment": "future_covariates",
      "feature": "quarter_hour",
      "source_kind": "calendar",
      "source_ref": "calendar.utc.quarter_hour",
      "watermark": "2026-07-11T12:00:00Z"
    },
    {
      "segment": "static_features",
      "feature": "rated_power",
      "source_kind": "constant",
      "source_ref": "energy.site.rated_power",
      "watermark": "2026-07-11T12:00:00Z"
    }
  ]
}
```

### 顶层字段

| 字段 | 必需 | 校验 |
|-------|----------|------------|
| `schema` | 是 | 必须正好是 `aether.processing-frame.v1` |
| `as_of` | 是 | 请求的逻辑截止点；UTC RFC 3339 |
| `cadence_seconds` | 是 | 与任务修订一致的正整数 |
| `history` | 是 | 至少一个时间戳和一个已声明的特征 |
| `future_covariates` | 取决于任务 | 声明了未来已知输入的任务必须提供；否则省略 |
| `static_features` | 否 | 只能包含任务声明的特征；允许为空对象 |
| `quality` | 是 | 由 Aether 计算的聚合质量 |
| `provenance` | 是 | 每个已填充的 `(segment, feature)` 对恰好有一个条目；出口策略只可以省略 `source_ref` |

通用契约包含 `static_features`，但当前需显式启用的 `aether-api` 运行时 YAML 加载器无法绑定静态值。在该加载器得到扩展和测试之前，只有使用 `DataProcessingBinding` 的自定义组合才能使用它们。随产品提供的负荷/光伏运行时路由没有声明任何静态特征。

### 段的结构定义

`history` 和 `future_covariates` 使用同一个结构定义：

```json
{
  "timestamps": ["2026-07-11T12:15:00Z"],
  "features": {
    "feature_name": {
      "value_type": "number",
      "unit": "kW",
      "values": [123.4],
      "quality": ["good"]
    }
  }
}
```

`value_type` 是 `number`、`string` 或 `boolean` 之一。段中每个序列的值数量和质量条目数量都必须与该段的时间戳数量完全相同。样本质量是以下之一：

| 质量 | 含义 |
|---------|---------|
| `good` | 值采用任务声明的表示，并被来源适配器和任务策略接受 |
| `uncertain` | 来源提供了值，但标明其可信度降低 |
| `substituted` | Aether 按任务声明的方法填补了该样本 |
| `missing` | 没有可用的值；对应的值为 `null` |

对于数值序列，`unit` 是必需的。对于字符串序列和布尔序列，必须省略 `unit`。只有当任务的缺失策略允许时才可以出现 `null`。处理器不得把缺失值转换为零，除非任务在帧构建之前就显式声明了这种确切的替代方式。

### 时间不变量

- 版本 1 使用区间末标签。对于节奏 `c`，历史标签 `t` 表示原始区间 `(t-c, t]`。
- 步数为 `N` 的历史网格必须是 `as_of-(N-1)c, ..., as_of`；它的最后一个标签正好是 `as_of`，来源读取不得越过该截止点。
- 未来协变量网格必须从 `as_of+c` 开始，并按确切的节奏推进。
- 版本 1 的帧使用确切的 `cadence_seconds` 网格。来源间隙要么保留为显式的缺失样本，要么被任务策略拒绝；时间戳不会被悄悄移除或重新定时。
- 未来的目标值不得出现在 `future_covariates` 中。只有当任务把某个特征标记为可提前获知时，它才可以出现在那里。
- `input_watermark` 必须小于或等于 `as_of`，并且表示所采用的最新来源观测，而不是请求的创建时间。

### 聚合质量

| 字段 | 必需 | 含义 |
|-------|----------|---------|
| `input_watermark` | 是 | 组装过程所采用的最新实际观测 |
| `missing_ratio` | 是 | 缺失单元数除以全部必需单元数，取值范围为 `[0, 1]` |
| `max_gap_seconds` | 是 | 必需的历史观测之间的最大间隙 |
| `live_tail_included` | 是 | 只读的实时状态是否在已存储的历史之后有所贡献 |
| `substituted_samples` | 是 | 标记为 `substituted` 的值的数量 |

聚合质量并不取代逐样本质量。处理器会对照所选任务和可选的处理器工件清单同时校验这两者。

v1 线上契约和 SHM v5 实时路径保留逐样本质量。实时读取把存储的来源质量与新鲜度策略结合起来。嵌入式历史表仍然只存储数值观测而不带设备质量，因此历史帧或历史/实时混合帧不能声称具有完整的来源质量保真度。要求历史特征带有原始质量的部署必须增加一个带质量信息的历史来源。

只有已投运的聚合为 `Last` 的历史特征才允许实时尾部，此时一个 SHM 瞬时值可以有效地替换最后一个单元。版本 1 对 `Mean`、`Sum`、`Min` 和 `Max` 拒绝实时尾部。当前能源负荷目标和光伏目标的历史使用 `Mean`，因此它们的帧设置 `live_tail_included: false`。

### 出处

`segment` 为 `history`、`future_covariates` 或 `static_features`，标明该条目描述的是某个特征的哪一次出现。`source_kind` 是 `history`、`live`、`history_and_live`、`covariate`、`calendar` 或 `constant` 之一。`source_ref` 是语义标识符，绝不是 SQL 查询、数据库凭据、SHM 路径、通道地址或模型的文件系统路径。当远程数据出口策略移除 `source_ref` 时，必须保留段、特征名称、来源类型和水位线。

`issued_at` 是可选的，记录带版本的外部预测（例如一次 NWP 运行）的发布时间。存在时，它必须满足 `issued_at <= watermark <= frame.as_of`。`future_covariates.timestamps` 中的有效时间可以晚于 `as_of`；发布截面则不可以。这可以防止组装过程选中在所请求的事件时间截面上尚不可用的协变量预测。它并不能让当前的历史存储或工件选择器在回测时具备时间点安全性。

每个已填充的 `(segment, feature)` 对必须恰好有一个出处条目。缺失的条目、元数据不同的重复键，以及针对不存在的特征的条目都是无效的。确定性生成的日历值和已投运的常量也不例外：它们分别使用 `calendar` 出处和 `constant` 出处。它们的水位线记录的是派生该值所用的数据截面，但它们不会推进聚合的 `input_watermark`，后者指的是组装过程所采用的最新实际观测。

### 已实现的历史适配器

生产环境的 `aether-api` 组合默认使用 `SqliteHistoryQuery`。它以惰性、只读的方式打开现有的 `aether-history.db` 表结构，绝不创建或迁移它，并且在同一个 SQLite 读事务内完成一次逻辑请求的全部特征读取。以任务为范围的路由固定了每个特征的物理序列、单位、节奏、聚合和重复数据策略。原始数值行被归约到区间末的桶中；空桶保持为显式的缺失值，水位线是实际参与的最新一条原始数值观测，而不是桶的标签。

`aether-history` 仍然是表结构、写入、保留和文件生命周期的所有者。查询适配器依赖 SQLite 的快照/WAL 行为和部署时的文件权限；文件缺失或无法访问只会让这次处理请求变成带类型的不可用，并且可以在之后的调用中恢复。选用外部历史库并不会悄悄地把这个适配器重定向过去——必须用符合要求的 `HistoryQuery` 实现重新组合当前运行时。

`mode=ro` 和 `query_only=ON` 约束 SQLite 操作，但不能取代操作系统层面的隔离。生产环境必须只授予 API 主体对一个专用历史库目录的读权限，该目录包含数据库/WAL/SHM 这一组文件，同时让 API 自己的配置/审计数据库保持独立可写。基础 Compose 目前把 `/app/data` 以读写方式挂载到 `aether-api` 中；这是开发基线，对于直接读取历史库而言，并不是完整的生产权限边界。

事务快照在调用运行时具有读一致性，但表结构不是双时态的。行中只有事件时间 `time_ms`：没有 `ingested_at`，也没有来源纪元、绑定纪元或配置纪元。因此 `as_of` 并不是对数据库的时间点重建。带有较早事件时间的迟到回填可能改变之后的重放，而在同一个逻辑 `(series_key, point_id)` 背后重新映射设备可能把不同的来源纪元拼接起来。预期的任务/绑定修订号校验的是当前的投运状态，但无法过滤已存储的行中不存在的元数据。不泄漏未来信息的离线评估必须使用在评估截面处捕获的冻结历史库快照/导出，或者使用另一个能按摄取时间和来源纪元过滤的适配器。

组合目前会对照持久化的 `history_config.storage_*` 校验自己的路径，但这些值是已保存的意图，而不是对活动写入器的证明。`PUT /hisApi/storage` 不会让历史库重新连接。发生存储变更时，先禁用数据处理，重新连接或重启 `aether-history`，验证活动的 SQLite 后端和一条已投运的哨兵序列，然后用匹配的路径重启 `aether-api`。

`HttpHistoryQuery` 是一个可选的环回适配器，用于已经物化出确切节奏网格的上游服务。每条路由投运的是完整的数值特征定义和节奏；所请求的角色、类型、单位、约束和网格必须完全一致，而 `max_samples` 仍然只是一个硬性上限。它只接受 `aggregation=last` 和 `duplicate_policy=reject`；它不能替代对原始 SQLite 数据的聚合。

## `ProcessTaskRequest`

应用调用方选择一个已投运的任务和一个事件时间数据截面。它们不提交帧、端点、处理器 ID、工件选择器、凭据或来源查询。

```json
{
  "task_id": "energy.site-load-forecast",
  "expected_task_revision": 1,
  "binding_id": "site-a",
  "expected_binding_revision": 7,
  "as_of": "2026-07-11T12:00:00Z",
  "options": {
    "kind": "forecast",
    "horizon_steps": 2
  }
}
```

传输通过通用的 `RequestContext` 提供请求身份和操作者数据；这些内容不会在这个带类型的请求中重复出现。`expected_task_revision` 和 `expected_binding_revision` 使调用在配置发生变化时失败关闭。`binding_id` 指明一个已启用、已投运的绑定；应用以原子方式解析它的点位、协变量、处理器路由、工件策略和出口策略。

## `DataProcessingRequest`

这是由 Aether 组装的、面向处理器的请求。它绝不是公开的应用输入。

### 结构定义

```json
{
  "schema": "aether.data-processing.request.v1",
  "request_id": "0190aee6-2139-7a87-8448-806f1b843201",
  "submitted_at": "2026-07-11T12:00:01Z",
  "deadline": "2026-07-11T12:00:06Z",
  "task": {
    "id": "energy.site-load-forecast",
    "revision": 1,
    "kind": "forecast"
  },
  "binding": {
    "id": "site-a",
    "revision": 7
  },
  "processor_contract": "aether.data-processing.forecast.v1",
  "artifact": {
    "kind": "model",
    "family": "site-load",
    "version": "v3",
    "artifact_digest": "sha256:98967bdedc60b8ab555e596516eb272063c139ccf3a3112fb29a46ab0610f270"
  },
  "frame": {
    "schema": "aether.processing-frame.v1",
    "as_of": "2026-07-11T12:00:00Z",
    "cadence_seconds": 900,
    "history": {
      "timestamps": ["2026-07-11T11:45:00Z", "2026-07-11T12:00:00Z"],
      "features": {
        "load": {
          "value_type": "number",
          "unit": "kW",
          "values": [820.0, 835.0],
          "quality": ["good", "good"]
        },
        "temp_avg": {
          "value_type": "number",
          "unit": "Cel",
          "values": [31.0, 31.2],
          "quality": ["good", "good"]
        },
        "humidity": {
          "value_type": "number",
          "unit": "%",
          "values": [64.0, 63.0],
          "quality": ["good", "good"]
        },
        "rain": {
          "value_type": "number",
          "unit": "mm",
          "values": [0.0, 0.0],
          "quality": ["good", "good"]
        },
        "quarter_hour": {
          "value_type": "number",
          "unit": "1",
          "values": [47, 48],
          "quality": ["good", "good"]
        }
      }
    },
    "future_covariates": {
      "timestamps": ["2026-07-11T12:15:00Z", "2026-07-11T12:30:00Z"],
      "features": {
        "temp_avg": {
          "value_type": "number",
          "unit": "Cel",
          "values": [32.1, 32.0],
          "quality": ["good", "good"]
        },
        "humidity": {
          "value_type": "number",
          "unit": "%",
          "values": [61.0, 62.0],
          "quality": ["good", "good"]
        },
        "rain": {
          "value_type": "number",
          "unit": "mm",
          "values": [0.0, 0.0],
          "quality": ["good", "good"]
        },
        "quarter_hour": {
          "value_type": "number",
          "unit": "1",
          "values": [49, 50],
          "quality": ["good", "good"]
        }
      }
    },
    "static_features": {},
    "quality": {
      "input_watermark": "2026-07-11T12:00:00Z",
      "missing_ratio": 0.0,
      "max_gap_seconds": 900,
      "live_tail_included": false,
      "substituted_samples": 0
    },
    "provenance": [
      {
        "segment": "history",
        "feature": "load",
        "source_kind": "history",
        "source_ref": "energy.site.load.active_power",
        "watermark": "2026-07-11T12:00:00Z"
      },
      {
        "segment": "history",
        "feature": "temp_avg",
        "source_kind": "history",
        "source_ref": "weather.observed.air_temperature",
        "watermark": "2026-07-11T12:00:00Z"
      },
      {
        "segment": "history",
        "feature": "humidity",
        "source_kind": "history",
        "source_ref": "weather.observed.relative_humidity",
        "watermark": "2026-07-11T12:00:00Z"
      },
      {
        "segment": "history",
        "feature": "rain",
        "source_kind": "history",
        "source_ref": "weather.observed.precipitation",
        "watermark": "2026-07-11T12:00:00Z"
      },
      {
        "segment": "history",
        "feature": "quarter_hour",
        "source_kind": "calendar",
        "source_ref": "calendar.utc.quarter_hour",
        "watermark": "2026-07-11T12:00:00Z"
      },
      {
        "segment": "future_covariates",
        "feature": "temp_avg",
        "source_kind": "covariate",
        "source_ref": "weather.nwp.air_temperature",
        "watermark": "2026-07-11T11:50:00Z",
        "issued_at": "2026-07-11T11:40:00Z"
      },
      {
        "segment": "future_covariates",
        "feature": "humidity",
        "source_kind": "covariate",
        "source_ref": "weather.nwp.relative_humidity",
        "watermark": "2026-07-11T11:50:00Z",
        "issued_at": "2026-07-11T11:40:00Z"
      },
      {
        "segment": "future_covariates",
        "feature": "rain",
        "source_kind": "covariate",
        "source_ref": "weather.nwp.precipitation",
        "watermark": "2026-07-11T11:50:00Z",
        "issued_at": "2026-07-11T11:40:00Z"
      },
      {
        "segment": "future_covariates",
        "feature": "quarter_hour",
        "source_kind": "calendar",
        "source_ref": "calendar.utc.quarter_hour",
        "watermark": "2026-07-11T12:00:00Z"
      }
    ]
  },
  "options": {
    "kind": "forecast",
    "horizon_steps": 2
  },
  "input_digest": "sha256:8b227777d4dd1fc61c6f884f48641d02b50a8a461a77f8fae7f48e32fbd8c372"
}
```

上面的摘要仅作示意，并不是这个节选示例的真实摘要。

### 请求字段

| 字段 | 必需 | 校验 |
|-------|----------|------------|
| `schema` | 是 | 必须正好是 `aether.data-processing.request.v1` |
| `request_id` | 是 | 本次调用的关联身份；v1 不提供重放或去重语义 |
| `submitted_at` | 是 | 应用创建该请求的 UTC 时间 |
| `deadline` | 是 | UTC 时间；超过它之后，处理器不得开始工作，也不得返回可被接受的结果 |
| `task` | 是 | 与已加载任务一致的 ID、正的修订号和带类型的任务类型 |
| `binding` | 是 | 已解析的已投运绑定的 ID 和正的修订号 |
| `processor_contract` | 是 | 任务和处理器双方都公布的契约 |
| `artifact` | 否 | 通用的类型、族和可选的所请求版本；不含路径或 URL |
| `frame` | 是 | 一个有效的 `ProcessingFrame` |
| `options` | 是 | 一个带类型的选项对象，其 `kind` 与 `task.kind` 一致 |
| `input_digest` | 是 | 用于关联、审计和离线比较的规范内容身份；不是操作的幂等键 |

`options.kind = forecast` 要求 `horizon_steps` 为正数。`quantiles` 是可选的；存在时，它包含严格介于零和一之间、按升序排列且互不相同的有限数字，其数量不得超过已投运任务的 `max_quantiles`。当前能源负荷任务和光伏任务的修订把该上限设为零，因此它们的请求省略 `quantiles`。处理器必须拒绝未知选项，而不是悄悄忽略会改变行为的字段。

`input_digest` 是对以下内容的 RFC 8785 规范 JSON 表示计算出的 SHA-256：

```json
{
  "task": "<the exact versioned task identity object>",
  "binding": "<the exact versioned binding identity object>",
  "processor_contract": "<contract identifier>",
  "artifact": "<the artifact object or null>",
  "frame": "<the complete frame object>",
  "options": "<the complete typed options object>"
}
```

这个示意中的字符串代表相应的 JSON 值，而不是摘要输入中的字面字符串。任务对象包含 ID、修订号和类型；绑定对象包含 ID 和修订号。有了修订号，对它们各自受治理定义的更改就会在内容上有所区别，而无需把站点配置复制到处理器请求中。处理器端点和身份、关联时间以及 `request_id` 不计入摘要，因此对完全相同的归一化受治理内容的独立调用会保持同一个摘要。当来源可变时，仅仅重复 `as_of` 并不能保证内容相同。版本 1 不提供内置的结果缓存或重放存储。

操作者及其权限被有意省略。Aether 对应用调用进行授权，并对操作者进行审计；它不会向处理器披露身份，除非另有一个独立的、显式的服务认证协议要求这样做。

工件身份不等于工件的时间先后。选择器/结果出处可以携带类型、族、版本和摘要，但版本 1 没有 `trained_through` 或 `available_at` 字段，也不会把其中任何一个与 `frame.as_of` 比较。固定了摘要的工件一经提供即可复现，但之后才训练或发布的模型仍然可能被选用于一个旧帧。在训练截面和可用截面成为规范性契约字段之前，严格的历史模型评估必须在评估截面处冻结工件注册表。

## `ProcessingResult`

### 成功的预测

```json
{
  "schema": "aether.data-processing.result.v1",
  "request_id": "0190aee6-2139-7a87-8448-806f1b843201",
  "task": {
    "id": "energy.site-load-forecast",
    "revision": 1,
    "kind": "forecast"
  },
  "binding": {
    "id": "site-a",
    "revision": 7
  },
  "input_digest": "sha256:8b227777d4dd1fc61c6f884f48641d02b50a8a461a77f8fae7f48e32fbd8c372",
  "status": "produced",
  "issued_at": "2026-07-11T12:00:02Z",
  "expires_at": "2026-07-11T13:00:00Z",
  "input_watermark": "2026-07-11T12:00:00Z",
  "processor": {
    "id": "load-forecasting-edge",
    "version": "0.1.0",
    "contract": "aether.data-processing.forecast.v1"
  },
  "artifact": {
    "kind": "model",
    "family": "site-load",
    "version": "v3",
    "artifact_digest": "sha256:f04c532f2f814a3690f0f40e6f26fa82b0d69b9c510e7c0bb9f9f4de35b5a882"
  },
  "output": {
    "schema": "aether.data-processing.output.forecast.v1",
    "kind": "forecast",
    "target": "load",
    "unit": "kW",
    "sign_convention": "positive_consumption",
    "cadence_seconds": 900,
    "timestamp_semantics": "interval_end",
    "points": [
      {
        "timestamp": "2026-07-11T12:15:00Z",
        "value": 846.2
      },
      {
        "timestamp": "2026-07-11T12:30:00Z",
        "value": 852.7
      }
    ]
  },
  "warnings": []
}
```

### 通用结果字段

| 字段 | 必需 | 校验 |
|-------|----------|------------|
| `schema` | 是 | 必须正好是 `aether.data-processing.result.v1` |
| `request_id` | 是 | 与请求完全一致的关联身份 |
| `task` | 是 | 与请求完全一致的任务 ID、修订号和类型 |
| `binding` | 是 | 与请求完全一致的绑定 ID 和修订号 |
| `input_digest` | 是 | 与请求完全一致的摘要 |
| `status` | 是 | `produced`、`fallback` 或 `unavailable` |
| `issued_at` | 是 | 结果完成的 UTC 时间 |
| `expires_at` | produced/fallback | 晚于 `issued_at`，并受任务策略限制 |
| `input_watermark` | 是 | 与已接受的帧完全一致的水位线 |
| `processor` | 是 | 稳定的处理器身份、版本和契约 |
| `artifact` | 否 | 使用了工件时，给出实际的通用工件类型、族、版本和摘要 |
| `output` | produced/fallback | 带类型的处理器输出；`unavailable` 时禁止出现 |
| `fallback` | fallback | 策略、原因代码和数据依据 |
| `unavailable` | unavailable | 原因代码和重试指引 |
| `warnings` | 是 | 稳定警告代码的数组；没有警告时为空 |

### 预测输出

版本 1 起初只定义带类型的预测输出结构定义。估计、检测和分类任务应添加各自带版本的输出结构定义，而不是在 `output` 下放置任意 JSON。

版本 1 把 `timestamp_semantics` 固定为 `interval_end`：每个点的时间戳标识它所预测的区间的结束时刻。`interval_start`、`instant` 或任何其他解释都需要未来的契约版本，v1 解码器必须拒绝它们。

预测必须满足以下全部条件：

- `target`、`unit` 和 `sign_convention` 与任务声明完全一致；
- 各点的时间戳与所请求的未来预测范围和节奏完全一致；
- 点的数量等于 `options.horizon_steps`；
- 时间戳严格递增，并使用 v1 的 `interval_end` 语义；
- 值和分位数值都是有限的；
- 返回的分位数概率与所请求的集合完全一致；
- 在每个时间戳上，分位数值随概率单调不减；以及
- 当返回概率 `0.5` 时，由任务声明它是必须等于主 `value`，还是可以是一个独立的估计量。

Aether 必须拒绝语法上成功但违反这些不变量的处理器响应。

## 回退语义

回退是由具名的、经批准的策略产生的可用处理器输出。只有在 Aether 校验并盖章之后，它才成为派生数据；回退不是掩盖处理器失败的手段。

```json
{
  "schema": "aether.data-processing.result.v1",
  "request_id": "0190aee6-2139-7a87-8448-806f1b843201",
  "task": {
    "id": "energy.site-load-forecast",
    "revision": 1,
    "kind": "forecast"
  },
  "binding": {
    "id": "site-a",
    "revision": 7
  },
  "input_digest": "sha256:8b227777d4dd1fc61c6f884f48641d02b50a8a461a77f8fae7f48e32fbd8c372",
  "status": "fallback",
  "issued_at": "2026-07-11T12:00:02Z",
  "expires_at": "2026-07-11T12:30:00Z",
  "input_watermark": "2026-07-11T12:00:00Z",
  "processor": {
    "id": "load-forecasting-edge",
    "version": "0.1.0",
    "contract": "aether.data-processing.forecast.v1"
  },
  "fallback": {
    "strategy": "persistence",
    "strategy_version": "1",
    "reason_code": "MODEL_UNAVAILABLE",
    "source_feature": "load",
    "based_on_data_through": "2026-07-11T11:45:00Z"
  },
  "output": {
    "schema": "aether.data-processing.output.forecast.v1",
    "kind": "forecast",
    "target": "load",
    "unit": "kW",
    "sign_convention": "positive_consumption",
    "cadence_seconds": 900,
    "timestamp_semantics": "interval_end",
    "points": [
      {"timestamp": "2026-07-11T12:15:00Z", "value": 835.0},
      {"timestamp": "2026-07-11T12:30:00Z", "value": 835.0}
    ]
  },
  "warnings": ["MODEL_FALLBACK_USED"]
}
```

回退规则：

- 任务必须显式允许该具名策略；
- 响应必须使用 `status: fallback` 并包含原因；
- `expires_at` 应当短于正常模型输出的过期时间；
- 持续性策略或历史平均策略必须使用实际的请求数据；
- 只有当任务显式把零定义为其基线、并且响应仍然把它标为回退时，全零序列才有效；以及
- 由使用方决定某个特定的回退是否可以接受。处理器不能悄悄把回退提升为 `produced`。

对于功率数据，零是一个合理的物理值。因此，在技术性失败之后返回零而不带回退标记尤其危险。

## 不可用语义

当处理器处理了一个有效请求，但无法产生任何满足任务策略的结果时，使用 `status: unavailable`——例如，不存在经批准的模型，或者允许的回退缺少足够的观测。

```json
{
  "schema": "aether.data-processing.result.v1",
  "request_id": "0190aee6-2139-7a87-8448-806f1b843201",
  "task": {
    "id": "energy.site-load-forecast",
    "revision": 1,
    "kind": "forecast"
  },
  "binding": {
    "id": "site-a",
    "revision": 7
  },
  "input_digest": "sha256:8b227777d4dd1fc61c6f884f48641d02b50a8a461a77f8fae7f48e32fbd8c372",
  "status": "unavailable",
  "issued_at": "2026-07-11T12:00:02Z",
  "input_watermark": "2026-07-11T12:00:00Z",
  "processor": {
    "id": "load-forecasting-edge",
    "version": "0.1.0",
    "contract": "aether.data-processing.forecast.v1"
  },
  "unavailable": {
    "reason_code": "INSUFFICIENT_HISTORY",
    "retryable": true,
    "retry_after_seconds": 900
  },
  "warnings": []
}
```

`output`、`expires_at` 以及看似可用的默认值在这种状态下都是禁止的。

## 已接受的 `DerivedData`

`ProcessingResult` 是不可信的处理器输出。在所有关联、结构定义、范围、出处和过期时间检查都通过之后，Aether 把已接受的输出盖章为 `DerivedData`：

```json
{
  "schema": "aether.derived-data.v1",
  "result_id": "0190aee6-22ac-72da-b214-629a31ccb99c",
  "request_id": "0190aee6-2139-7a87-8448-806f1b843201",
  "task": {
    "id": "energy.site-load-forecast",
    "revision": 1,
    "kind": "forecast"
  },
  "binding": {
    "id": "site-a",
    "revision": 7
  },
  "accepted_at": "2026-07-11T12:00:03Z",
  "expires_at": "2026-07-11T13:00:00Z",
  "input_digest": "sha256:8b227777d4dd1fc61c6f884f48641d02b50a8a461a77f8fae7f48e32fbd8c372",
  "processing_status": "produced",
  "processor": {
    "id": "load-forecasting-edge",
    "version": "0.1.0"
  },
  "artifact": {
    "kind": "model",
    "family": "site-load",
    "version": "v3",
    "artifact_digest": "sha256:f04c532f2f814a3690f0f40e6f26fa82b0d69b9c510e7c0bb9f9f4de35b5a882"
  },
  "quality": {
    "input_watermark": "2026-07-11T12:00:00Z",
    "missing_ratio": 0.0,
    "fallback_used": false
  },
  "data": {
    "schema": "aether.data-processing.output.forecast.v1",
    "kind": "forecast",
    "target": "load",
    "unit": "kW",
    "sign_convention": "positive_consumption",
    "cadence_seconds": 900,
    "timestamp_semantics": "interval_end",
    "points": [
      {"timestamp": "2026-07-11T12:15:00Z", "value": 846.2},
      {"timestamp": "2026-07-11T12:30:00Z", "value": 852.7}
    ]
  }
}
```

如果校验失败，应用记录一个 `rejected` 结果，并且不创建 `DerivedData`。因此，`rejected` 是应用层面的结果，而不是处理器可以就自己的响应声明的状态。

## 错误信封与 HTTP 映射

契约失败、传输失败、容量失败和意外的处理器失败使用非 2xx 响应，并附带带类型的错误。它们不同于状态为 `unavailable` 的已完成 `ProcessingResult`。

```json
{
  "schema": "aether.data-processing.error.v1",
  "request_id": "0190aee6-2139-7a87-8448-806f1b843201",
  "code": "FRAME_INVALID",
  "category": "invalid_data",
  "message": "history.load contains a missing sample",
  "retryable": false,
  "details": {
    "path": "/frame/history/features/load/values/41",
    "rule": "task missing_policy is reject"
  }
}
```

| HTTP | 类别 | 示例代码 | 重试 |
|------|----------|---------------|-------|
| 400 | `invalid_request` | `SCHEMA_UNSUPPORTED`、`OPTION_UNKNOWN` | 否 |
| 401/403 | `authorization` | `PROCESSOR_AUTH_REQUIRED`、`PROCESSOR_AUTH_DENIED` | 仅在凭据/策略变更之后 |
| 404 | `not_found` | `MODEL_NOT_FOUND`、`TASK_NOT_SUPPORTED` | 否，除非部署发生变化 |
| 413 | `resource_limit` | `FRAME_TOO_LARGE` | 仅在缩小请求之后 |
| 422 | `invalid_data` | `FRAME_INVALID`、`QUALITY_REJECTED`、`UNIT_UNSUPPORTED` | 仅在数据变化之后 |
| 429 | `capacity` | `PROCESSOR_BUSY` | 是，须遵守 `retry_after_seconds` |
| 500 | `internal` | `PROCESSOR_INTERNAL` | 取决于策略 |
| 503 | `unavailable` | `MODEL_RUNTIME_UNAVAILABLE` | 是，当标记为可重试时 |
| 504 | `timeout` | `DEADLINE_EXCEEDED` | 是，须使用新的截止时间 |

错误消息和详情不得暴露凭据、模型的文件系统路径、SQL 语句、原始堆栈跟踪或未声明的源数据。Aether 适配器把这些错误映射为带类型的端口错误，并保留处理器的稳定代码用于诊断。

## 校验顺序

符合要求的应用/适配器应按以下顺序校验：

1. 大小、媒体类型、JSON 语法和契约主版本；
2. 请求身份、截止时间和规范摘要；
3. 已配置的任务 ID、修订号、类型和处理器路由；
4. 特征集、值类型、单位和符号约定；
5. 时间戳顺序、节奏、窗口边界和数组长度；
6. 对照任务策略的样本质量和聚合质量；
7. 对照处理器描述符的可选工件选择器；以及
8. 结果的关联、出处、带类型的输出结构定义、预测范围和过期时间。

校验失败绝不触发设备写入，也绝不改动 SHM。失败的处理器调用同样不能使历史、采集、告警或确定性的安全行为不可用。

## 非幂等的执行与重试

`data_processing.process` 被声明为 `idempotent: false`。虽然这项查询不改动 Aether 状态，也不控制设备，但调用它可能执行本地或远程的处理器工作，并创建一条新的必需审计记录。版本 1 没有重放存储、请求去重契约、结果完全一致的保证，也没有针对重复使用请求 ID 的特殊 `409` 行为。

输入摘要是确切的内容身份，而不是操作身份。只有当带类型的错误把失败标记为可重试时，调用方才可以重试，并且应当遵守重试元数据，使用新的截止时间，并假定先前的处理器工作可能已经执行过。确定性的实现可以在离线基准测试中使用固定的帧和工件；这一性质并不会把这项公开操作变成精确重放 API。

## 能力元数据

每个接入这项能力的传输都必须使用并暴露相同的应用元数据。版本 1 目前通过 `aether-api` 上带认证的 HTTP 路由暴露该应用；CLI 绑定和 MCP 绑定仍是未来的工作。应用目录中已实现的基线描述符如下：

| 能力 | 类型 | 风险 | 权限 | 确认 | 审计 | 幂等 |
|------------|------|------|------------|--------------|-------|------------|
| `data_processing.tasks.list` | 查询 | 低 | `data_processing.read` | 从不 | 不要求 | 是 |
| `data_processing.processors.health` | 查询 | 低 | `data_processing.read` | 从不 | 不要求 | 是 |
| `data_processing.process` | 查询 | 中 | `data_processing.run` | 按策略 | 必需 | 否 |

`data_processing.process` 仍然是查询，因为它产生派生数据，并不改动设备状态或 Aether 状态。它被保守地定为中等风险，并采用由策略驱动的确认，因为配置的远程处理器可能使遥测数据离开边缘主机。部署可以批准一条仅限本地的路由而无需逐次调用确认；该路由的数据边界仍然可以被发现。任务发现和健康发现不包含观测值，也不要求持久的审计记录。处理确实会读取以任务为范围的运行数据，因此当必需的审计接收器无法记录这次调用时，它会失败关闭。

面向应用的路由是：

- `GET /api/v1/data-processing/tasks`；
- `GET /api/v1/data-processing/processors/health`；以及
- `POST /api/v1/data-processing/process`。

只有显式启用数据处理时才会挂载这些路由。JWT 角色映射把发现权限授予 Viewer、Engineer 和 Admin；执行处理仅限 Engineer 和 Admin。面向处理器的边车路由仍然是独立的 `POST /v1/process` 边界。

任务绑定、路由和经批准的工件只能通过现有的受治理配置路径更改。处理请求不得以副作用的方式激活工件。设备控制同样是独立的，仍然是经由 `ControlApplication` 的高风险命令。

任务发现返回实际已投运的路由策略。一个有代表性的条目（这里对完整的 `features` 数组做了节选）具有如下嵌套形状：

```json
{
  "task": {"id": "energy.site-load-forecast", "revision": 1},
  "binding": {"id": "energy.example-site", "revision": 1},
  "kind": "forecast",
  "processor_contract": "aether.data-processing.forecast.v1",
  "features": [
    {
      "name": "load",
      "role": "history",
      "value_type": "number",
      "unit": "kW",
      "integer": false
    }
  ],
  "forecast": {
    "target": {
      "name": "load",
      "unit": "kW",
      "sign_convention": "positive_consumption"
    },
    "cadence_ms": 900000,
    "history_aggregation": "mean",
    "history_duplicate_policy": "latest",
    "history_feature_policies": [
      {"feature": "load", "aggregation": "mean", "duplicate_policy": "latest"},
      {"feature": "temp_avg", "aggregation": "mean", "duplicate_policy": "latest"},
      {"feature": "humidity", "aggregation": "mean", "duplicate_policy": "latest"},
      {"feature": "rain", "aggregation": "sum", "duplicate_policy": "latest"},
      {"feature": "quarter_hour", "aggregation": "last", "duplicate_policy": "reject"}
    ],
    "history_steps": 672,
    "max_horizon_steps": 288,
    "max_quantiles": 0,
    "max_output_age_ms": 3600000,
    "max_missing_ratio": 0.0,
    "max_input_age_ms": 900000,
    "max_gap_ms": 1800000,
    "require_future_issue_time": true,
    "allowed_fallbacks": ["persistence"],
    "fallback_policies": [
      {
        "strategy": "persistence",
        "version": "1",
        "source_feature": "load",
        "max_output_age_ms": 1800000
      }
    ]
  },
  "artifact": {
    "kind": "model",
    "family": "site-load",
    "version": "v3",
    "digest": "sha256:98967bdedc60b8ab555e596516eb272063c139ccf3a3112fb29a46ab0610f270"
  },
  "processor_id": "load-forecasting-edge",
  "processor_version": "0.1.0",
  "data_boundary": "local",
  "deadline_ms": 5000,
  "audit_finalization_timeout_ms": 1000,
  "max_concurrency": 1,
  "max_frame_samples": 5000,
  "max_request_bytes": 4194304
}
```

`deadline_ms` 是帧组装加处理器工作的硬性预算，而不是完整的 HTTP 响应 SLA。`audit_finalization_timeout_ms` 公布的是另外一项必需的终态审计宽限时间，因此实际观察到的 API 调用最长可以在这两个字段之和的时间内完成。审计失败仍然会使请求失败关闭。

这样，AI 客户端就可以把观察或解释一项预测，与激活模型或下发控制计划区分开来。

## 兼容性规则

- 处理器可以同时支持多个主版本契约，但每个请求只选择其中一个。
- 新的任务类型会得到带类型的选项结构定义和带类型的输出结构定义。不要不断扩展 Forecast 字段，直到它们变成一个通用的数据块。
- 重命名特征、更改单位或符号约定、更改时间戳语义或更改缺失数据规则，都需要新的任务修订。
- 移除兼容适配器需要一致性测试和明确说明的迁移标准。
- 领域包可以要求最低的处理器契约，但只有组合根才能选择实际的适配器或端点。

## 相关页面

- [连接数据处理器](/zh/guides/data-processors) — 声明任务并为处理器配置路由
- [AetherEMS 功率预测](https://github.com/EvanL1/AetherEMS/blob/main/packs/energy/knowledge/power-forecasting.md) — 第一个下游预测契约
- [JSON Schema](https://github.com/EvanL1/AetherEdge/blob/main/contracts/data-processing/README.md) — 严格的、机器可读的 v1 线上格式守卫
- [Load-Forecasting Processor](https://github.com/EvanL1/AetherEMS/tree/main/processors/load-forecasting) — 下游能源领域的实现
- [数据流](/zh/concepts/data-flow) — SHM 和历史的权威
- [HTTP 数据处理器](/zh/services/api/adapters/http-data-processor) — v1 处理器传输的有界可选实现
- [HTTP API](/zh/reference/http-api) — Aether 面向应用的 API 的服务信封约定
