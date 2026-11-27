---
title: "连接设备"
description: "投运协议通道、检查确切的运行时可用性，并把物理点位映射到设备实例"
updated: 2026-08-02
---

# 连接设备

设备以**通道**的形式接入 Aether，通道由通信服务拥有。一个通道就是一条设备连接：一种协议、该协议所需的传输参数，以及描述设备暴露内容的点位表。远程客户端仍然通过经过认证的 `aether-api:6005` 进入，不直接连接 IO 进程端口。通道点位随后映射到设备**实例**，也就是规则和应用所面向的逻辑物模型（见[数据模型](/zh/concepts/data-model)）。

## 通道

通道可以在 `config/io/io.yaml` 中编写，再由 `aether sync` 加载到 SQLite；服务从不直接读取 YAML。随附的模板有意写成 `channels: []`。下面这些用于说明的 TCP 和串口连接会保持禁用，直到操作员将其投运：

```yaml
channels:
  - id: 1
    name: "PLC#1"
    protocol: "modbus_tcp"
    enabled: false
    parameters:
      host: "192.168.1.10"
      port: 502
      connect_timeout_ms: 3000
      read_timeout_ms: 3000

  - id: 3
    name: "SENSOR#1"
    protocol: "modbus_rtu"
    enabled: false
    parameters:
      device: "/dev/ttyS4"
      baud_rate: 9600
```

`parameters` 块因协议而异：Modbus TCP 需要主机和端口，Modbus RTU 需要串口设备和波特率，MQTT 需要消息代理 URL 和订阅主题，依此类推。注册表只接受运行时清单所通告的确切规范 `protocol_type`。例如，`modbus_tcp` 有效，而 `modbus`、`modbus-tcp` 和 `ModbusTCP` 无效。

通道也可以在运行时创建，无需改动 YAML：

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels create \
  --name "PLC#2" --protocol modbus_tcp \
  --params '{"host": "192.168.1.11", "port": 502}' \
  --confirmed
```

这条受治理命令经由应用网关执行，记录审计证据，并默认以禁用状态创建通道。`aether channels list`、`update`、`delete`、`enable` 和 `disable` 覆盖生命周期的其余部分；改变状态的命令需要确认，并在适用时需要修订围栏。

每个通道都带有一张按四种点位类型划分的点位表：遥测（T，模拟量测量）、信号（S，数字量状态）、控制（C，数字量命令）和调节（A，模拟量设定值）。点位通过 `aether channels points list|add|update|delete` 管理，也可以在通道 YAML 旁边编写成 CSV 表，由 `aether sync` 读入。

## 协议可用性

IO 只通告同一个二进制文件能够通过其生产组合根构造出来的协议。大多数协议位于编译期 Cargo 特性（`services/io/Cargo.toml`）之后，因此某个具体的二进制文件通常只包含其中一个子集。默认特性列表选择 Modbus、GPIO、IEC 61850 和 CAN。生产注册表只在 Linux 上组合 CAN 和 GPIO：Linux 默认构建通告全部四种，而非 Linux 默认构建不通告 CAN 或 GPIO。

| 协议 | 默认选中 | 平台说明 |
|----------|--------------------:|----------------|
| Modbus TCP/RTU (`modbus`) | 是 | |
| IEC 60870-5-104 (`iec104`) | 否 | |
| IEC 61850 MMS (`iec61850`) | 是 | |
| OPC UA (`opcua`) | 否 | 可选特性；目前仅限匿名 `SecurityPolicy::None` 会话。 |
| MQTT (`mqtt`) | 否 | 事件驱动的只读 JSON 负载采集 |
| HTTP (`http`) | 否 | 只读 HTTP JSON 轮询；调度由统一的通道任务负责 |
| DL/T 645-2007 (`dl645`) | 否 | 通过串口或 TCP 接入的智能电表 |
| BACnet/IP (`bacnet`) | 否 | UDP ReadProperty/WriteProperty 客户端；直连设备地址，不含 BACnet/SC 或 BBMD 管理 |
| CJ/T 188 (`cjt188`) | 否 | 通过串口或透明 TCP 网关只读接入的户用水表/燃气表/热量表 |
| IEC 60870-5-101 (`iec101`) | 否 | 通过串口或透明 TCP 网关进行的非平衡式主站总召唤 |
| GB/T 32960 (`gb32960`) | 否 | 事件驱动的车辆终端服务端；默认绑定环回，并按 VIN 允许列表放行 |
| JT/T 808 (`jt808`) | 否 | 事件驱动的定位终端服务端，使用预先配置的认证令牌 |
| CAN (`can`) / J1939 (`j1939`) | CAN 是，J1939 否 | 仅限 Linux；`j1939` 隐含 `can` |
| GPIO (`gpio`) | 是 | 仅限 Linux |
| BLE GATT (`ble`) | 否 | 通知/轮询采集，以及受治理的 GATT 写入 |
| Zigbee (`zigbee`) | 否 | 仅支持 Aether Raw TCP 网关帧格式 |

CAN、J1939 和 GPIO 在 IO 协议工厂注册表（`services/io/src/protocols/factory.rs`）中受 Linux 门控，因此在 macOS 上选中它们的 Cargo 特性并不会通告运行时。与硬件无关的协议测试针对 `tools/simulator` 运行；生产 IO 二进制文件不包含任何内存内的仿真协议。

经验法则：**如果通道创建失败，先检查特性门控**。如果某个协议的适配器没有被组合进来，通道激活时会报告该协议在当前 IO 运行时构建中不可用。

完整的特性到运行时 ID 对照矩阵、各适配器的参数示例、已实现的协议切片以及刻意排除的内容，见[协议适配器参考](/zh/reference/protocol-adapters)。

发现、严格参数、点位映射校验、轮询默认值和运行时构造都由一个静态组合、进程范围内不可变的工厂注册表负责。`ChannelManager` 不持有 SQLite 连接池，也不做协议分支判断或映射预处理；它只添加通用的运行时策略、日志、命令防护、生命周期/任务所有权以及 SHM 接线。签名的运行时清单会被检查是否与该注册表完全一致。因此，一个仅仅能编译却无法构造通道的特性属于测试失败，而不是被通告的能力。此前的 `matter` 特性已被移除，因为它的私有 UDP 帧并不是可互操作的 Matter 实现；见运行时清单。

## 点位映射契约

每次激活都会消费一份自有的、完整的 `RuntimeChannelConfig` 快照。选中的工厂把适配器自有的映射结构定义一次性编译为适配器自有的带类型地址；不存在共享的封闭协议地址联合类型。协议运行时不持有 SQLite 连接池，之后也不会重新加载拓扑。

| 协议 | 接受的点位映射 |
|----------|-------------------------|
| Modbus TCP/RTU | `{"slave_id":1,"function_code":3,"register_address":0}`。这三个字段是必填的；每个都接受数字或其十进制字符串。`data_type` 默认为 `uint16`，不区分大小写（`bool`、`uint16`、`int16`、`uint32`、`int32`、`uint64`、`int64`、`float32`、`float64`、`string`）；`byte_order` 默认为 `ABCD`（也可以是 `DCBA`、`BADC`、`CDAB`，或别名 `BE`、`LE`、`WORD_SWAP`、`BYTE_SWAP`）；`bit_position`（0–15）从寄存器中提取一位。未知字段会被拒绝。 |
| MQTT / HTTP | T 使用 `{"json_path":"$.value","data_type":"float"}`（`float` 或 `int`）；S 使用 `{"json_path":"$.online","data_type":"bool"}`。C/A 和字符串映射会被拒绝。 |
| BLE | `{"service_uuid":"180f","characteristic_uuid":"2a19","data_format":"uint16","notify":true}`。通知仅用于 T/S；C/A 使用受治理写入。 |
| Zigbee | T/S 需要 `{"ieee_address":...,"endpoint":1,"cluster_id":1026,"attribute_id":0}`。C/A 会被拒绝，因为原始网关传输目前还没有可关联的命令确认。 |
| J1939 | T 使用 `{"spn":190}`。S 还需要一个显式的原始离散值，例如 `{"spn":110,"active_raw_value":130}`。 |
| BACnet/IP | `{"object_type":0,"object_instance":7,"property_id":85}`；可选的 `array_index` 和受治理写入的 `priority`（1–16）。 |
| CJ/T 188 | T/S 使用 `{"data_id":36895,"byte_offset":0,"data_type":"bcd_le","byte_length":4}`。BCD 必须提供 `byte_length`（1–8）；定宽类型为 `u8`、`u16_le`、`u32_le`、`i16_le`、`i32_le` 和 `f32_le`。C/A 会被拒绝。 |
| IEC 101 | T/S 使用 `{"ioa":100,"type_id":13}`。`type_id` 为 `0` 时接受该 IOA 上任何受支持的测量 ASDU；C/A 会被拒绝。 |
| GB/T 32960 | T/S 选择一个解码后的字段，例如 `{"field":"soc_percent"}` 或 `{"field":"drive_motor_speed_rpm","motor_index":0}`。C/A 会被拒绝。 |
| JT/T 808 | T/S 选择一个位置上报字段，例如 `{"field":"speed_kmh"}` 或 `{"field":"acc_on"}`。C/A 会被拒绝。 |

缩放、偏移和取反来自点位行，而不是在这些映射对象中重复给出。未知的映射字段会失败关闭。MQTT/HTTP 只接受能够进入实时状态的有限值，J1939 只接受编译内置的解码器目录中的 SPN，Zigbee 只接受已实现的 Aether Raw TCP 帧格式，并没有用于尚未实现的 ZNP 或 EZSP 传输的 `gateway_type` 选择器。SHM 采集边界只接受有限的数值型或布尔型 T/S 采样以及规范的点位质量；文本、缺失值和非有限值绝不会进入实时状态。

GB/T 32960 和 JT/T 808 是由终端发起连接的协议，因此它们的通道绑定监听器，而不是主动拨向设备。它们默认绑定到环回地址；操作员必须有意识地选择一个现场网络监听地址。GB/T 32960 需要 `allowed_vins`，JT/T 808 则需要一个 `auth_tokens` 映射。适配器在输出数据之前就会拒绝未列入名单或未通过认证的终端。

这类通道每个恰好承载一辆车。点位只指定一个上报字段，别无其他，因此同一通道上的两辆车会写入相同的点位，后到的上报会覆盖先前的上报。请为每个通道配置一个 VIN 或一个终端 ID，并各自使用独立的监听端口。

COMTRADE 是一种 CFG/DAT 文件格式，不是实时通道。可以离线检查或规范化它，而无需授予文件读取器 SHM 写入权限：

```bash
aether comtrade inspect --cfg disturbance.cfg
aether comtrade export-csv --cfg disturbance.cfg --output disturbance.csv
```

导入器支持 ASCII、BINARY、BINARY32 和 FLOAT32 DAT 记录，并应用每个模拟量通道的 `a`/`b` 工程量换算。HL7 不是 IO 适配器：医疗应用消息必须由下游集成转换，并通过经过认证的 `aether-api` 进入 AetherEdge，以保持本仓库的远程应用边界。

## 把点位映射到实例

通道点位带着协议的味道（通道 2 上的寄存器 62001）；规则和仪表板需要的是带着模型味道的值（电池组荷电状态）。两者之间的桥梁是实例加路由：

1. **定义实例**。实例在 `config/automation/instances.yaml` 中把一台设备绑定到由已激活的领域包 提供的产品模板。默认分发有意从空白开始，不拥有任何行业专用的产品。产品定义实例有哪些测量点位和动作点位；实例属性则填入经过校验的静态值。需要现成的能源领域模型时，请使用 AetherEMS 这样的下游解决方案。

2. **把通道点位映射到实例点位**。路由把通道点位接到实例点位上：遥测和信号点位馈入实例测量点位（M，`route:c2m` 表），实例动作点位（A）驱动通道的控制和调节点位（`route:m2c`）。条目可以通过经过认证的 CLI 创建。先用 `aether routing list` 读取当前的 `logical_routing_revision`，再提交一条带修订围栏的路由：

   ```bash
   AETHER_ACCESS_TOKEN='<signed access JWT>' \
     aether routing measurement upsert 1 9 \
       --channel-id 1 --channel-type T --channel-point-id 101 \
       --expected-revision 7 --confirmed
   ```

   这会通过 `aether-api` 提交一条受治理的路由命令。成功的响应会返回下一次变更所需的修订。

3. 如果实例或路由是在 YAML 中编写的，**运行 `aether sync`**。同步会校验配置并把它写入 SQLite，各服务从那里加载；`--dry-run` 只校验、不写入。

4. **验证**。两项检查，桥的两侧各一项：

   ```bash
   aether channels unmapped-points 1     # channel side
   aether routing list --channel 1       # instance side
   ```

   第一项（io 上的 `GET /api/channels/{id}/unmapped-points`）列出通道上已声明但协议映射仍为空的点位，也就是 io 无法轮询的点位，因为它们还没有接到协议地址上。第二项显示涉及该通道的每一条路由条目，因此被遗漏的实例绑定会以缺失行的形式凸显出来。

## 验证连接

先检查通道状态：

```bash
aether channels status 1
```

它调用 `GET /api/channels/{id}/status`，返回 `connected`、`running`、`last_update` 和累计统计（读/写次数、平均响应时间）。注意，`connected` 同时检查传输状态和数据新鲜度：一个保持着 TCP 连接、但 90 秒内没有收到任何数据的通道会报告 `false`。

然后观察一个实时值。在通道侧，`GET /api/channels/{channel_id}/{T|S|C|A}/{point_id}` 返回当前值及其时间戳和原始协议值。如需直接查看，打开共享内存 REPL：

```bash
aether shm
```

如果通道点位在更新而实例点位没有，说明路由条目缺失或有误。SHM 是权威的实时视图，因此这项检查不需要运行任何外部数据库。

离线时的表现：`aether channels status` 报告 `connected: false`，通道健康 SHM 条目变为离线，点位值停止更新，时间戳随之过期。*从未*被采集过的点位在共享内存中是 NaN 哨兵，而不是零；不可用为什么是一等值，见[数据模型](/zh/concepts/data-model)。要做一次全系统检查（服务已启动、SQLite 可读、共享内存已附加），运行 `aether doctor`。

## 相关页面

- [数据模型](/zh/concepts/data-model) — 产品、实例和四种点位类型
- [系统架构](/zh/concepts/architecture) — io 和 automation 所处的位置，以及数据如何在它们之间流动
- [编写规则](/zh/guides/writing-rules) — 把映射好的点位用到控制逻辑中
