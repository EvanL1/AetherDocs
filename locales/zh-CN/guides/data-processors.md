---
title: "连接数据处理器"
description: "在领域包中声明数据处理任务，并连接请求驱动的本地或远程处理器"
updated: 2026-07-11
---

# 连接数据处理器

本页说明 **Aether 数据处理**已实现的集成方式。核心类型、应用编排、v1 编解码器、本地测试适配器、有界的 HTTP 适配器和结构定义都在本仓库中。能源包的示例归 AetherEMS 所有。需显式启用的 `aether-api` 组合读取一份严格的运行时配置；完整的合成模板见 [AetherEMS 运行时示例](https://github.com/EvanL1/AetherEMS/blob/main/packs/energy/data-processing/runtime.example.yaml)。

数据处理器接收一个完整的、受治理的输入帧，并返回派生数据。它不会回到 Aether 中去发现自己的输入。这样，同一个处理器既可以用作进程内适配器，也可以用作本地边车或经批准的远程服务，而不改变数据所有权。

```text
caller
  │
  ▼
DataProcessingApplication
  ├─ task declaration from a domain pack
  ├─ HistoryQuery
  ├─ LiveState (read-only)
  ├─ CovariateSource
  └─ deterministic transforms
            │
            ▼
      ProcessingFrame
            │ request
            ▼
       DataProcessor
            │
            ▼
 ProcessingResult (untrusted)
            │ validate and stamp
            ▼
        DerivedData
```

这种划分是有意为之：

- Aether 拥有点位身份、来源选择、时间对齐、单位/符号契约校验、质量策略、授权和审计。
- `DataProcessor` 拥有与处理器相关的特征排序、缩放器、张量构造、模型执行和输出后处理。
- 领域包声明任务的语义。它不选择具体的端点，也不包含凭据。
- 派生数据不是设备的实时状态。处理器不能写入 SHM、历史存储或设备命令。

## 在领域包中声明任务

把任务声明与定义其输入输出语义的行业知识放在一起。仓库约定的位置是 `packs/<domain>/data-processing/tasks/*.yaml`；能源包在那里提供了完整的、默认禁用的负荷示例和光伏示例。组合根或投运加载器把经过校验的资产转换为已启用的路由。

下面的负荷预测任务仅作示意：

```yaml
schema: aether.data-processing-task.v1
id: energy.site-load-forecast
revision: 1
kind: forecast
processor_contract: aether.data-processing.forecast.v1

target:
  name: load
  semantic_point: site.load.active_power
  unit: kW
  sign_convention: positive_consumption

frame:
  cadence_seconds: 900
  history_steps: 672
  horizon_steps: 288
  timezone: UTC
  live_tail: forbidden

inputs:
  history:
    - name: load
      unit: kW
      source:
        kind: measurement
        instance_ref: site_load
        point_ref: active_power
    - name: temp_avg
      unit: Cel
      source:
        kind: covariate
        dataset_ref: weather.observed
        field: air_temperature
    - name: humidity
      unit: "%"
      source:
        kind: covariate
        dataset_ref: weather.observed
        field: relative_humidity
    - name: rain
      unit: mm
      source:
        kind: covariate
        dataset_ref: weather.observed
        field: precipitation
    - name: quarter_hour
      unit: "1"
      source:
        kind: calendar
        transform: quarter_hour_of_day_zero_based

  future_covariates:
    - name: temp_avg
      unit: Cel
      source:
        kind: covariate
        dataset_ref: weather.nwp
        field: air_temperature
    - name: humidity
      unit: "%"
      source:
        kind: covariate
        dataset_ref: weather.nwp
        field: relative_humidity
    - name: rain
      unit: mm
      source:
        kind: covariate
        dataset_ref: weather.nwp
        field: precipitation
    - name: quarter_hour
      unit: "1"
      source:
        kind: calendar
        transform: quarter_hour_of_day_zero_based

alignment:
  aggregation: mean
  timestamp_semantics: interval_end
  duplicate_policy: latest
  feature_policies:
    - { name: load, aggregation: mean, duplicate_policy: latest }
    - { name: temp_avg, aggregation: mean, duplicate_policy: latest }
    - { name: humidity, aggregation: mean, duplicate_policy: latest }
    - { name: rain, aggregation: sum, duplicate_policy: latest }
    - { name: quarter_hour, aggregation: last, duplicate_policy: reject }
  missing_policy: reject

quality:
  max_input_age_seconds: 900
  max_gap_seconds: 1800
  max_missing_ratio: 0.0
  require_input_watermark: true
  require_covariate_issue_time_not_after_as_of: true

output:
  unit: kW
  sign_convention: positive_consumption
  max_quantiles: 0
  expires_after_seconds: 3600
```

### 任务中应包含的内容

声明应只包含可移植的领域语义：

- 稳定的任务 ID、修订号和带类型的任务类型；
- 语义化的实例引用和点位引用，而不是通道 ID、SHM 槽、SQL 名称或厂商寄存器地址；
- 规范单位和符号约定；
- 历史特征和未来已知的特征；
- 节奏、窗口、对齐和缺失数据规则；
- 预期的派生数据形状和新鲜度限制；以及
- 任务所要求的处理器契约。

站点投运把 `instance_ref` 和 `point_ref` 解析为实际的实例和路由。如果某个必需的引用无法解析，或者它的物理单位、比例、偏移、点位类型或目标符号约定与已投运的任务不完全一致，领域包校验必须失败关闭。当前的 v1 运行时会校验这些事实；它不执行工程单位转换或符号转换。

声明不得包含：

- 处理器 URL、进程名称、API 令牌或 TLS 密钥；
- 具体的历史数据库查询；
- SHM 路径或对布局的假设；
- ONNX/RKNN 输入节点名称；或
- 要根据结果执行的设备动作。

这些细节属于组合、适配器或另一个独立的控制用例。

## 实现 `DataProcessor`

已实现的端口有意保持得很窄。用类 Rust 的伪代码表示：

```rust
#[async_trait]
pub trait DataProcessor: Send + Sync {
    fn descriptor(&self) -> &DataProcessorDescriptor;

    async fn health(&self) -> PortResult<ProcessorHealth>;

    async fn process(
        &self,
        request: DataProcessingRequest,
    ) -> PortResult<ProcessingResult>;
}
```

请求和结果是带类型的契约，见[数据处理契约](/zh/reference/data-processing-contracts)。处理器描述符声明所支持的契约版本、任务类型、本地/远程数据边界，以及有限的帧限制和请求限制。它不得暴露通用的厂商命令集，也不得暴露未经校验的 `run(json)` 后门。

处理器负责：

- 拒绝不受支持的契约版本、任务类型、特征和形状；
- 应用所选模型拥有的特征顺序和归一化；
- 执行其确定性算法或模型运行时；
- 返回实际的模型版本和制品摘要；
- 区分正常结果、显式回退和没有可用结果；以及
- 遵守截止时间和有界的资源限制。

处理器不得：

- 查询 Aether 的 SHM、SQLite、历史服务或领域包目录；
- 只接受一个 `plant_id`，然后自行去发现对应的数据；
- 根据站点名称推断单位或功率方向；
- 把派生值作为普通的实时测量值发布；
- 下发设备命令；或
- 把处理失败变成看似正常的零值结果。

对于基于模型的处理，把模型的内部细节留在处理器一侧。处理器可以拥有特征顺序、缩放器统计量、序列长度、模型制品、ONNX/RKNN 的选择以及反归一化。Aether 发送的是具名、带单位的观测，而不是模型张量。

## 配置本地和远程处理器

只有组合根才能选择具体的处理器。严格的运行时 YAML 包含完整的任务、绑定、历史路由、协变量来源和处理器描述符。下面这个节选片段只展示处理器部分；不要把它当作完整配置使用。`HttpDataProcessorConfig` 接收一个经过校验的端点，并派生出固定的 `/v1/process` 和 `/v1/health` 路由：

```yaml
processor:
  endpoint: http://127.0.0.1:8989/
  id: example-forecast-processor
  version: 0.1.0
  contract: aether.data-processing.forecast.v1
  requires_artifact: true
  boundary: local
  max_frame_cells: 5000
  max_request_bytes: 4194304
  connect_timeout_ms: 500
  request_timeout_ms: 4500
  max_response_bytes: 4194304
  bearer_token_env: AETHER_PROCESSOR_BEARER_TOKEN
```

通用的领域/处理器契约支持静态特征，自定义的进程内组合可以通过 `DataProcessingBinding` 绑定它们。当前 `aether-api` 的运行时 YAML 加载器没有静态值绑定字段，因此通过运行时配置的 v1 路由不得声明静态特征。在投运这样的路由之前，先补上加载器支持和测试；不要以为仅凭线上结构定义就能让它可用。

本地适配器和远程适配器使用同一个请求/结果契约。远程路由增加了一条显式的数据出口边界，必须同时得到任务策略和路由策略的预先批准。机密保留在由环境负责的机密注入中。当前配置没有自定义 CA 文件的设置；HTTPS 使用 HTTP 客户端已配置的信任根。需要私有信任材料的部署必须通过受支持的传输组合来提供，而不是自己发明一个 YAML 键。

默认的 Aether 分发不得依赖这两种处理器中的任何一种。没有配置路由时，该任务不可用，而采集、历史、告警、规则和设备控制的其余部分继续独立运行。

## Aether 如何组装请求

`DataProcessingApplication` 为每个请求负责以下步骤，其中与任务相关的变换由已投运的组装组合提供：

1. 对所公布的处理能力进行授权，并加载任务修订。
2. 通过已投运的实例映射解析语义化的来源引用。
3. 通过 `HistoryQuery` 查询所需的历史范围。
4. 当任务允许实时尾部且该特征使用 `aggregation: last` 时，通过只读的 `LiveState` 端口读取最新值，然后只替换它的最后一个区间单元，而不改变 SHM 的权威。版本 1 对 `mean`、`sum`、`min` 或 `max` 拒绝实时尾部，因为瞬时值无法代表一个聚合桶。负荷任务和光伏任务禁止实时尾部。
5. 通过带类型的 `CovariateSource` 获取未来已知的输入。
6. 在本地生成确定性的日历特征。
7. 校验已投运的单位/符号元数据完全一致，对齐时间戳，聚合原始观测，消解重复数据，并应用声明的缺失数据策略。版本 1 不执行运行时的单位/符号转换。
8. 计算帧质量和规范的输入摘要。
9. 选择配置的处理器，并提交一个完整的 `ProcessingFrame`。
10. 在暴露 `DerivedData` 之前，校验返回的任务 ID、请求 ID、输入摘要、时间戳、单位、状态、模型出处和过期时间。

对于区间末节奏 `c`，历史标签为 `as_of-(history_steps-1)c, ..., as_of`。标签 `t` 聚合 `(t-c, t]` 内的原始观测，任何来源读取都不得越过 `as_of`。未来协变量和预测输出从 `as_of+c` 开始。默认运行时用只读的 SQLite 适配器在 `aether-history.db` 之上实现这一点；一次请求的所有特征读取共享同一个事务。可选的 HTTP 历史适配器只用于已经物化出确切节奏网格、并支持受限的 `last/reject` 策略的上游服务。

元数据检查并不能证明区间的含义。在启用物理路由之前，用站点的基准测试夹具校验每个原始来源的聚合语义和对齐语义。这对 `rain` 是强制要求：只有当每个来源值都是其所在区间的增量降水量，而不是滚动累计值或速率时，`aggregation: sum` 才有效。

当前的 SQLite 历史也不提供时间点回测截面。行中没有摄取时间戳，也没有来源/配置纪元，因此迟到的回填以及同一逻辑序列背后的物理重新映射，都可能改变或拼接一个旧的事件时间窗口。绑定修订号只校验当前路由。离线评估需要在评估截面处捕获的冻结历史库导出，或者一个带纪元的双时态历史适配器。制品注册表也要冻结：v1 的制品身份有版本和摘要，但没有 `trained_through` 或 `available_at`，因此单凭一个较早的 `as_of` 无法排除之后才发布的模型。

把历史库的存储变更当作维护操作。`history_config.storage_*` 各行是已保存的意图，`PUT /hisApi/storage` 不会让活动的写入器重新连接。先禁用处理，执行重新连接或重启历史服务，验证活动的 SQLite 后端以及一条已投运的哨兵序列，然后才针对同一路径重启 `aether-api`。

用文件系统隔离为此提供支撑：让 API 以独立授权的只读方式访问历史库的数据库/WAL/SHM 目录，并与其可写的配置/审计数据库分开。仅靠基础 Compose 的 `/app/data:rw` 挂载和 SQLite 只读标志，并不构成生产环境的权威边界。

处理器得不到 Aether 的数据库凭据，也得不到反向回调 URL。如果它还需要别的观测，说明任务声明不完整，必须修订任务声明，而不是允许未声明的读取。

## 调用应用 API

版本 1 通过需显式启用、受 JWT 保护的 `aether-api` 路由暴露：

- `GET /api/v1/data-processing/tasks`；
- `GET /api/v1/data-processing/processors/health`；以及
- `POST /api/v1/data-processing/process`。

Viewer、Engineer 和 Admin 角色可以使用发现功能；处理需要 Engineer 或 Admin。处理请求体是严格的应用请求，而不是完整的帧或处理器端点。`x-request-id` 是可选的；当路由策略要求时，`x-aether-confirmed: true` 提供显式确认。v1 尚未实现这些能力的 CLI 绑定和 MCP 绑定；未来的传输必须调用同一个应用 API，而不是调用边车。

## 在开发期间直接请求处理器

可选的 HTTP 适配器把 `DataProcessor::process` 映射到带版本的、面向处理器的 `POST /v1/process` 端点。下游的 AetherEMS Load-Forecasting 处理器实现了该端点；它是处理器边界，而不是默认 Aether 服务上面向应用的端点。

```bash
curl --fail-with-body \
  --request POST http://127.0.0.1:8989/v1/process \
  --header 'Content-Type: application/vnd.aether.data-processing+json;version=1' \
  --data @processing-request.json
```

直接调用对处理器一致性测试很有用。生产环境的调用方应通过 `DataProcessingApplication` 进入，这样来源解析、数据质量、策略和结果校验就无法被绕过。

## 重试与内容身份

`data_processing.process` 是只读查询，但被有意声明为 `idempotent: false`。版本 1 没有请求重放存储、去重契约、结果完全一致的保证，也没有 `409 REQUEST_ID_REUSED` 行为。每次被接受的调用都有自己的审计记录，并且可能再次执行处理器。

`input_digest` 标识确切的任务/绑定修订号、帧、制品选择器、契约和选项。它支持关联和离线比较；它不是这项公开操作的幂等键。调用方只能在自己有界的策略下重试带类型的可重试 `429`、`503` 或 `504` 响应，使用新的截止时间，并且要意识到工作可能已经执行过。

## 一致性检查清单

在把任务路由到某个处理器之前，确认该处理器：

- 接受完整的帧，并且不做反向数据读取；
- 校验参考页面中的每一条契约不变量；
- 拒绝 NaN、无穷大、时间戳乱序、单位不匹配和未声明的特征；
- 在算法是确定性的情况下，能在离线基准测试中复现一个固定的帧，但不把这一测试性质当作 API 重放承诺；
- 不把“当前历史库加当前模型选择”称为时间点回测；需要冻结的历史截面和制品截面，或等效的双时态/可用性元数据；
- 把超时、连接断开、过载和格式错误的响应作为带类型的失败处理；
- 标明回退输出，绝不把不可用的数据伪装成预测；
- 返回模型出处和处理器出处，其中不含本地文件系统路径或机密；
- 通过针对正常、缺失、过期和边界数据的任务专用测试夹具；以及
- 证明失去处理器不会阻塞采集或确定性的安全行为。

SHM v5 为实时样本保留源自设备的质量，并把它与新鲜度策略结合起来。当前的 SQLite 历史表结构仍然不保留来源质量，因此历史帧和混合帧不能声称具有完整的端到端质量保真度。如果部署要求历史特征带有原始质量，就必须在投入生产之前投运一个带质量信息的历史来源。

## 相关页面

- [数据处理契约](/zh/reference/data-processing-contracts) — v1 线上契约和校验规则
- [HTTP 数据处理器](/zh/services/api/adapters/http-data-processor) — 有界的本地/远程适配器和组合 API
- [AetherEMS 功率预测](https://github.com/EvanL1/AetherEMS/blob/main/packs/energy/knowledge/power-forecasting.md) — 第一个下游任务和处理器
- [Load-Forecasting Processor](https://github.com/EvanL1/AetherEMS/tree/main/processors/load-forecasting) — 下游能源领域的 `/v1/process` 实现
- [JSON Schema](https://github.com/EvanL1/AetherEdge/blob/main/contracts/data-processing/README.md) — 严格的 v1 传输校验
- [数据流](/zh/concepts/data-flow) — 权威的实时路径和历史路径
- [系统架构](/zh/concepts/architecture) — 核心分层和服务边界
- [应用与智能体的安全操作](/zh/guides/safe-operations) — 为什么派生数据不能绕过控制策略
