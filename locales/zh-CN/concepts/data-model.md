---
title: "数据模型"
description: "产品、实例和 T/S/C/A 点位，以及为什么实例是不带状态字段的纯物模型"
updated: 2026-07-10
---

# 数据模型

Aether 用三层来为物理现场建模：产品（设备类型模板）、实例（单台设备）和点位（单个可测量或可操作的量）。核心的设计不变量是：实例是**纯物模型**，它只保存逻辑结构和当前值，除此之外别无其他。连接状态、告警和路由存放在各自独立的数据集中，它们引用实例，但从不被复制到实例上。

## 三层

**产品**：描述一种设备*类型*拥有哪些点位的模板。定义在 `Product`（`libs/aether-config/src/automation.rs`）中：一个唯一的 `product_name`，一个用于类型层级（Station → ESS → Battery/PCS 等）的可选 `parent_name`，外加三个点位列表：

- `measurements` — 测量点位定义（id、名称、单位、描述）
- `actions` — 动作点位定义（id、名称、单位、描述）
- `properties` — 属性模板（静态配置值，例如额定功率）

内核的产品库默认为空。经过校验的已激活 Pack 提供 JSON 模型资产（能源模型维护在 [AetherEMS](https://github.com/EvanL1/AetherEMS/tree/main/packs/energy/models) 中），其中同样的三个列表以 `M`、`A` 和 `P` 出现，层级以 `name` / `pName` 出现。站点可以添加一个显式的自定义目录。产品候选在校验阶段和运行时都要通过同样的路径限制、常规文件、大小、JSON 和重名检查。

**实例**：一台物理设备。定义在 `Instance` / `InstanceCore`（`libs/aether-config/src/automation.rs`）中：

- `instance_id`（数值，唯一）和 `instance_name`
- `product_name` — 这台设备实例化的是哪个模板
- `parent_id` — 在站点拓扑中的位置（根实例为 None）
- `properties` — 为产品属性模板填入的具体值
- 可选的 `created_at` — 创建时间戳（关于记录本身的簿记事实，不是聚合的运行时状态）

这就是完整的字段列表。其中没有 `status`、`health`、`online`、`degraded` 或 `alarm_state` 字段，见[纯粹性规则](#纯粹性规则)。

**点位**：单个可测量或可操作的量，由一个在其产品及其点位列表内唯一的数值 id 标识。采集侧的点位是设备上报的内容（荷电状态、断路器位置）；命令侧的点位是系统可以设置的内容（启动命令、功率设定值）。

## 点位类型

通道侧的协议和存储 DTO 使用 `libs/aether-core/src/types.rs` 中 `PointType` 定义的四类划分。该枚举的文档把它称为标准的 IEC“四遥”分类；每个变体都带有一个对应中国标准代号（YC/YX/YK/YT）的 serde 别名。

| 类型 | 名称 | 信号种类 | 方向 | 写入所有者 |
|------|------|-------------|-----------|-------------|
| `T` | 遥测 | 模拟量测量（YC） | 设备 → 系统 | io |
| `S` | 信号 | 数字量状态（YX） | 设备 → 系统 | io |
| `C` | 控制 | 数字量命令（YK） | 系统 → 设备 | automation |
| `A` | 调节 | 模拟量设定值（YT） | 系统 → 设备 | automation |

`PointType` 提供了代码库中到处使用的类别谓词：`is_measurement()` 对 T 和 S 为真，`is_action()` 对 C 和 A 为真，`is_analog()` 对 T 和 A 为真，`is_digital()` 对 S 和 C 为真。

写入所有权在端口边界和组合边界上通过构造方式强制实现。只有 IO 获得 `LiveStateWriter`，并通过 `ShmAcquisitionStateWriter` 发布 T/S 采集批次。自动化服务通过 `ShmDeviceCommandSink` 提交带类型的 C/A 命令；它无法获得采集写入器，而该接收器在触碰 SHM 之前就会拒绝非命令类的点位类型。

在序列化的实例 DTO 上，四种通道类型归并为两种角色，由 `libs/common/src/service_config.rs` 中的 `PointRole` 定义：

- `M`（测量）— 数据从设备流向模型
- `A`（动作）— 数据从模型流向设备

实时值通过带类型的 SHM 坐标寻址。通道到模型和模型到通道的映射是 SQLite 中的持久配置，并被加载到进程内的路由索引中。自定义镜像可以选择自己的外部键形式，但这些键不属于核心数据模型。

## 纯粹性规则

实例只保存**逻辑结构和当前值，除此之外别无其他**。`Instance` 结构体包含身份、层级、属性和点位映射。它上面不存在任何形式的聚合状态：没有 `status`，没有 `health`，没有 `online`，没有 `alarm_state`。

这是有意的设计决策，而不是疏漏。每个候选的状态字段实际上都是*另一个*子系统的属性，那个子系统有自己的写入方和自己的生命周期：

- “在线”是**通信通道**的属性，而不是设备的属性。实例的点位通过路由表绑定到通道点位，没有什么强制它们都落在同一个通道上。实例级的在线标志只会是对各通道事实的有损聚合，而这些事实由 io 发布在通道健康 SHM 段中。
- “存在活动告警”是**告警事件流**的属性，告警服务在自己的表中拥有它。告警通过坐标引用点位；这种引用只指向一个方向。
- “上一次控制写入失败”是**单次调用**的属性，它体现在该次调用的返回值中（见[对界面和智能体的影响](#对界面和智能体的影响)）。

把其中任何一项复制到实例上，都会为一个权威写入方在别处的事实制造第二份副本。第二份副本会过期，会在部分失败时与原件冲突，还会迫使每个写入方了解每个使用方。保持实例纯粹，意味着每个事实恰好只有一个写入方，使用方在读取时联接自己需要的数据集。

## 四个正交的数据集

系统的运行时状态分布在四个数据集中。每个数据集有一个写入方；没有哪个是由另一个派生或复制而来的。

| 数据集 | 位置 | 含义 | 写入方 |
|---------|-------|---------|--------|
| 实例当前值 | 实时状态 SHM 中带类型的点位槽，通过路由索引解析 | 物模型的值（从未采集过的点位可能是 NaN） | io（`M` 源值）；automation（`A`，在执行动作时） |
| 通道连接状态 | 通道健康 SHM 段 | 各通道的在线/离线状态和心跳 | io |
| 告警事件 | 告警服务的 SQLite 表 `alert` 和 `alert_event`（`services/alarm/src/db.rs`） | 事件流：触发/恢复记录，通过 `service_type` + `channel_id` + `data_type` + `point_id` 寻址点位（对于实例点位，`service_type` 为 `"inst"`，id 列保存实例 id） | alarm |
| 路由配置 | 加载到各进程索引中的 SQLite 映射 | 通道点位与实例点位之间静态的点对点接线 | 配置同步/API 事务 |

路由索引是其余数据集之间的联接键：C2M 把通道点位（`{channel_id}:{T|S}:{point_id}`）映射到实例测量（`{instance_id}:M:{point_id}`），M2C 把实例动作（`{instance_id}:A:{point_id}`）映射回通道命令点位。告警规则使用同样的坐标来寻址值。实例从不反向引用告警、连接状态或路由，箭头只指向一个方向。

## 用 NaN 作为哨兵

在共享内存平面中，“这里从未写入过数据”被编码在值本身之中。每个 SHM `PointSlot`（`crates/aether-dataplane/src/core/slot.rs`）在创建时，其值字段和原始值字段都被设置为 IEEE-754 静默 NaN（硬编码的位模式 `SLOT_UNWRITTEN_BITS = 0x7FF8_0000_0000_0000`）。第一次真实写入会用一个有限的双精度数替换这个哨兵。这消除了历史上的歧义：过去以零初始化的槽与真实的 0.0 读数无法区分。

SHM v5 把采集质量存储在同一个 32 字节的 `PointSlot` 中。布局依次是值、时间戳、原始值、seqlock 序列和质量码；没有脏标志。`ShmAcquisitionStateWriter` 把规范的领域 `PointQuality` 映射到该字段，读取适配器会拒绝未知的质量码，而不是凭空编造 `good`。NaN 哨兵回答的仍是另一个独立的问题，即是否曾经写入过任何样本，因此使用方必须显式检查 NaN：

- SHM 读取器对返回值调用 `PointSlot::is_unwritten()` 或 `f64::is_nan()` 进行探测。
- 规则引擎（`libs/aether-rules/src/executor.rs`）在 `RuleReadOutcome` 中跟踪哪些变量不可用，并跳过评估，而不是用 0.0 代替；否则像 `current < threshold` 这样的条件会在数据缺失时悄悄触发。

对每个使用方，规则都是一样的：缺少有效的有限值是一等的结果，而存在的样本保留其来源质量，供使用方做新鲜度和策略判断。

## 对界面和智能体的影响

**把控制按钮置灰是客户端要做的联接**。要判断实例 7 上的某个控制当前能否到达其设备，需要通过 M2C 路由索引把该实例的动作点位解析为通道 id，然后从通道健康 SHM 段读取该通道。后端有意不把这个联接结果预先放到实例上。automation 在下发之前、写入的时刻执行同样的联接。

**控制写入失败体现在调用方的返回值中，绝不体现为实例状态**。当目标通道离线时，automation 以 `AutomationError::ChannelUnreachable`（`services/automation/src/error.rs`）拒绝写入；下发路径降级（SHM 已写入但发往 io 的通知失败）时，则以 `AutomationError::DispatchDegraded` 失败。两者都通过 `AetherErrorTrait::http_status`（`libs/errors/src/lib.rs`）到达 HTTP，它们的类别（分别为 `ResourceBusy` 和 `Network`）都映射到 **HTTP 503**；调用方通过错误代码（`AUTOMATION_CHANNEL_UNREACHABLE` 与 `AUTOMATION_DISPATCH_DEGRADED`）区分它们，并且两者都可重试。在规则引擎中，无法解析的动作会通过执行器的 `action_skipped` 路径产生一个 `success: false` 且值为 NaN 的 `ActionResult`，并归因于导致跳过的变量。

在每种情况下，失败都是给*那个调用方、那次调用*的信息：它会被报告、记录，也可能被重试，但不会有任何内容被写回实例。`inst:{id}:A` 的下一个读取方看到的是最近一次被接受的命令，而不是失败标志。

## 相关页面

- [系统架构](/zh/concepts/architecture) — 各服务及其通信方式
- [共享内存](/zh/concepts/shared-memory) — 深入了解 SHM 平面：槽、seqlock、写入所有权
- [数据流](/zh/concepts/data-flow) — 端到端的上行和下行路径
- [产品模型](https://github.com/EvanL1/AetherEdge/blob/main/docs/domain/product-models.md) — 产品库及其领域含义
- [安全操作](/zh/guides/safe-operations) — 为什么控制写入要经过闸门，以及失败如何传播
