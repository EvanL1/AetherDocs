---
title: "协议适配器参考"
description: "AetherEdge IO 的确切特性门控、运行时协议 ID、传输角色、点位映射、安全边界和已实现的协议切片"
updated: 2026-08-06
---

# 协议适配器参考

本页描述可以静态组合进 `aether-io` 的协议适配器。它是一份源码参考，并不证明某个已安装的二进制文件包含所有适配器。对那个二进制文件而言，已安装的 `runtime-manifest.json` 和实时 IO 协议目录才是权威。

每个通道在显式投运之前都处于禁用状态。远程应用必须通过经过认证的 `aether-api:6005` 进入；它们不得连接环回上的 IO 管理 API、写入共享内存或直接调用现场协议。

## 组合矩阵

| Cargo 特性 | 运行时协议 ID | 传输角色 | 点位类型 | 默认构建 | 证据 | 已实现的切片 |
|---|---|---|---|---:|---|---|
| `modbus` | `modbus_tcp`、`modbus_rtu` | TCP/串口客户端 | T/S/C/A | 是 | loopback | Modbus 轮询和受治理写入 |
| `iec104` | `iec104` | TCP 客户端 | T/S/C/A | 否 | loopback | IEC 60870-5-104 客户端 |
| `iec61850` | `iec61850` | TCP/ISO 客户端 | T/S/C/A | 是 | unit | MMS 客户端；参见适配器特有的控制约束 |
| `opcua` | `opcua` | TCP 客户端 | T/S/C/A | 否 | unit | 仅支持匿名 `SecurityPolicy::None` 会话 |
| `bacnet` | `bacnet_ip` | UDP 客户端 | T/S/C/A | 否 | loopback | 直接的 ReadProperty/WriteProperty |
| `dl645` | `dl645` | 串口或透明 TCP 客户端 | 固定遥测集 | 否 | unit | DL/T 645-2007 电表读取 |
| `cjt188` | `cjt188` | 串口或透明 TCP 客户端 | T/S | 否 | unit | CJ/T 188 数据读取 |
| `iec101` | `iec101` | 串口或透明 TCP 主站 | T/S | 否 | unit | 非平衡式总召唤 |
| `gb32960` | `gb32960` | TCP 服务端 | T/S | 否 | loopback | 按允许列表接收的车辆遥测上报 |
| `jt808` | `jt808` | TCP 服务端 | T/S | 否 | loopback | 经过认证的终端位置上报 |
| `mqtt` | `mqtt` | 消息代理订阅方 | T/S | 否 | unit | 只读 JSON 负载采集 |
| `http` | `http` | HTTP 轮询客户端 | T/S | 否 | loopback | 只读 JSON 轮询 |
| `can` | `can` | Linux SocketCAN 读取器 | T/S | 是 | unit | 原始 CAN 帧解码 |
| `j1939` | `j1939` | Linux SocketCAN 读取器 | T/S | 否 | unit | 编译内置的 SPN 解码器目录；隐含 `can` |
| `gpio` | `di_do` | Linux GPIO | S/C | 是 | unit | `gpiod` 或旧式 sysfs 驱动 |
| `ble` | `ble` | BLE GATT 客户端 | T/S/C/A | 否 | unit | 轮询/通知以及受治理的特征值写入 |
| `zigbee` | `zigbee` | TCP 网关客户端 | T/S | 否 | unit | Aether Raw TCP 帧格式，不是 ZNP 或 EZSP |

默认特性集保持行业中立：

```text
modbus, gpio, iec61850, can
```

CAN、J1939 和 GPIO 只在 Linux 上对外通告。在其他目标平台上启用某个 Cargo 特性不会产生虚假的运行时能力。构建工具根据确切的特性集推导出协议列表，并把它记录在带校验和的运行时清单中。

## 证据等级

`Evidence`（证据）列报告每个适配器已记录的验证目前达到了哪一级。各等级构成一道阶梯，每一级都包含前一级：

| 等级 | 含义 |
|---|---|
| `unit` | 编解码器、解析器、配置和工厂逻辑有自动化单元测试覆盖。没有与真实对端的报文交换。 |
| `loopback` | 与仓库内的本地对端进行自动化报文交换：环回 TCP/UDP/HTTP 测试服务器或协议模拟器。 |
| `real-device` | 已针对至少一台厂商实体设备完成验证，并记录了设备型号和固件。 |
| `field-proven` | 已在持续运行的真实部署中投运，并留有审计历史。 |

目前本仓库中没有任何适配器声称达到 `real-device` 或 `field-proven`。这两个等级属于特定部署的证据，只有在记录了相应证据时才会按适配器逐个升级。等级描述的是矩阵中列出的已实现软件切片，绝不代表符合整个协议标准。

## 新增适配器配置

所有参数对象都拒绝未知字段。时间类取值的单位是毫秒。示例有意保持禁用状态，并为清晰起见省略了点位表。

### BACnet/IP

```yaml
- id: 20
  name: building-controller
  protocol: bacnet_ip
  enabled: false
  parameters:
    host: 192.168.20.10
    port: 47808
    local_port: 0
    timeout_ms: 2000
```

点位映射使用 BACnet 对象/属性地址：

```json
{"object_type":0,"object_instance":7,"property_id":85,"array_index":null,"priority":8}
```

`array_index` 是可选的。`priority` 是可选的，用于受治理的 C/A 写入时必须在 `1..=16` 范围内。适配器接受 Aether 点位所需的标准数值型和布尔型应用值。它没有实现 Who-Is/I-Am 发现、BBMD 管理、外部设备注册、BACnet/SC、COV 订阅，也没有内核内置的 BACnet 对象目录。

每个请求都会等待携带自身调用 ID 的应答，并在配置的超时时间内丢弃其他任何报文，因此如果设备应答的是通道已经放弃的请求，代价只是一次读取，而不是此后的每一次读取。如果 C/A 写入的值无法表示为 32 位 BACnet Real，写入会被拒绝，而不是被收窄成无穷大。

### CJ/T 188

`host` 和 `device` 必须且只能提供其中一个：

```yaml
- id: 21
  name: heat-meter
  protocol: cjt188
  enabled: false
  parameters:
    device: /dev/ttyUSB0
    baud_rate: 2400
    parity: even
    timeout_ms: 2000
    meter_type: 32
    meter_address: "12345678901234"
```

`meter_address` 恰好包含 14 位十进制数字。

透明 TCP 网关使用 `host` 和可选的 `port` 代替 `device`；默认端口是 `8899`。T/S 映射选择一个数据标识和一个带类型的切片：

```json
{"data_id":36895,"byte_offset":0,"data_type":"bcd_le","byte_length":4}
```

支持的 `data_type` 取值为 `bcd_le`、`u8`、`u16_le`、`u32_le`、`i16_le`、`i32_le` 和 `f32_le`。BCD 映射要求 `byte_length` 在 `1..=8` 范围内；定宽类型不接受该字段。阀门和表计配置命令不对外提供。

### IEC 60870-5-101

串口设备和透明 TCP 网关必须且只能提供其中一个：

```yaml
- id: 22
  name: substation-rtu
  protocol: iec101
  enabled: false
  parameters:
    device: /dev/ttyUSB1
    baud_rate: 9600
    parity: even
    timeout_ms: 3000
    link_address: 1
    link_address_size: 1
    common_address: 1
    common_address_size: 2
    cause_size: 2
    ioa_size: 3
```

TCP 网关模式用 `host` 和可选的 `port`（默认 `2404`）替换 `device`。T/S 映射使用信息对象地址和 ASDU 类型：

```json
{"ioa":100,"type_id":13}
```

`type_id: 0` 接受该 IOA 上任何受支持的测量类型。已实现的测量 ASDU 为 `1`、`3`、`5`、`7`、`9`、`11`、`13` 和 `15`，以及它们带 CP56Time2a 时标的形式 `30` 至 `37`。该适配器是执行总召唤的非平衡式主站；它不提供 IEC 101 控制命令，也不提供平衡模式的站行为。

点位质量来自每个 ASDU 自身的描述词。累计量以外的类型携带 QDS，其中无效表示 `Bad`，非当前值、被取代或被闭锁表示 `Uncertain`。累计量（`15` 和 `37`）则以 BCR 顺序记法结尾，其中只有无效、进位和计数量被调整描述读数本身，低五位是不带质量含义的顺序号。

### GB/T 32960

该适配器是由终端发起连接的 TCP 服务端。它默认绑定到环回地址，并且只接受恰好一个 VIN：

```yaml
- id: 23
  name: vehicle-telemetry
  protocol: gb32960
  enabled: false
  parameters:
    bind: 127.0.0.1:32960
    allowed_vins:
      - L1234567890123456
```

映射选择一个解码后的上报字段：

```json
{"field":"soc_percent"}
{"field":"drive_motor_speed_rpm","motor_index":0}
```

可用字段涵盖整车状态、车速、里程、电压/电流、SOC、挡位、绝缘、加速踏板/制动状态、位置、告警等级和驱动电机测量值。`motor_index` 仅对驱动电机字段是必填的。适配器校验 BCC，接受未加密的实时上报和补发上报，对有效的终端帧作出应答，并在发布之前拒绝未列入名单的 VIN 和不受支持的加密方式。对于没有配置字段映射的已识别标准数据块，它会跳过，而不是错误解析混合上报的其余部分。

### JT/T 808

该适配器同样是由终端发起连接的 TCP 服务端。它默认绑定到环回地址，并且只接受恰好一个终端，该终端必须出示预先配置的令牌：

```yaml
- id: 24
  name: positioning-terminals
  protocol: jt808
  enabled: false
  parameters:
    bind: 127.0.0.1:6808
    auth_tokens:
      "013800138000": replace-with-provisioned-token
```

终端 ID 在 2013 版消息头中为 12 位数字，在 2019 版消息头中为 20 位数字。T/S 映射选择一个解码后的位置字段：

```json
{"field":"speed_kmh"}
{"field":"acc_on"}
```

适配器处理注册（`0x0100`）、认证（`0x0102`）、位置上报（`0x0200`）、转义、XOR 校验和以及平台应答。在完成认证之前，它会拒绝位置数据。加密和分包重组有意不予支持，并失败关闭。可用映射涵盖位置基本信息、状态位、里程、油量、行驶记录仪速度、温度、信号/IO 状态、模拟量输入、无线信号和 GNSS 卫星数。

### 拨入式服务端的限制

GB/T 32960 和 JT/T 808 是仅有的两个接受连接而不是主动发起连接的适配器。

每个通道恰好承载一辆车：`allowed_vins` 必须指定一个 VIN，`auth_tokens` 必须指定一个终端。这类通道上的点位只选择一个上报字段，旁边不带任何车辆选择器，因此同一通道上的两辆车会写入相同的点位 ID，后到的上报会用另一辆车的读数悄无声息地覆盖先前的上报。请为每辆车配置独立的通道和独立的监听端口。这两个字段仍然保持为集合，这样日后按点位选择车辆的能力可以放宽这一限制，而不会使今天编写的配置失效。

对于未知对端所能占用的资源，两个适配器还施加同样的固定上限：

- 一个通道最多保持 64 个并发终端连接。超出该上限的对端在接受连接时即被关闭，并记录到通道诊断信息中。
- 尚未报出允许列表内的 VIN 或尚未通过认证的连接，在静默 15 秒后会被关闭，并记录为错误。终端表明身份之后，其空闲上限变为 120 秒，超时会关闭连接但不产生错误。
- 由单个对端引起的 `accept` 失败绝不会让监听器停止。其他任何 `accept` 失败都会结束接受循环并把通道置为 `Error`，由通道监督器按照配置的重连策略重建它。
- 提供了错误令牌的 JT/T 808 终端会收到一次失败应答，随后连接被断开，因此已配置的终端 ID 不能被当作可无限次猜测的预言机。
- 如果某个点位配置的变换无法得出有限值，该点位会被跳过并记录；上报的其余部分照常发布，终端保持连接。

这些上限不可配置。

## 现有的 DL/T 645 行为

仓库中已经包含一个 DL/T 645-2007 适配器。通道需要一个 12 位 BCD 的 `meter_address`，并且 `host` 和 `device` 必须且只能提供其中一个。TCP 默认使用端口 `8899`；串口默认为 2400 波特、8 个数据位、1 个停止位和偶校验。

当前运行时提供一份固定的遥测目录，包括正向和反向有功总电能、各相电压/电流、总有功/无功功率和功率因数。它不接受任意的内联点位映射。这是有意设定的兼容性边界，而不是通用的 DL/T 645 模型目录。

## COMTRADE 文件

COMTRADE 是一种离线的 CFG/DAT 格式，不是实时 IO 通道，也不是共享内存写入器。使用 CLI 校验元数据或规范化采样：

```bash
aether comtrade inspect --cfg disturbance.cfg
aether --json comtrade inspect --cfg disturbance.cfg --dat disturbance.dat
aether comtrade export-csv \
  --cfg disturbance.cfg \
  --dat disturbance.dat \
  --output disturbance.csv
```

省略 `--dat` 时，CLI 使用把 CFG 路径的后缀换成 `.dat` 得到的路径。它支持 ASCII、BINARY、BINARY32 和 FLOAT32 记录，展开数字量位，应用每个模拟量通道的 `a`/`b` 工程量换算，并应用 COMTRADE 时间倍乘系数。

## 刻意排除的内容

- **HL7 不是 IO 适配器**。树外的医疗集成可以把 HL7 v2、FHIR 或其他应用消息转换为 Aether 领域命令和查询，再通过经过认证的 `aether-api` 进入。它不得给 `aether-io` 增加远程监听器，也不得直接写入 SHM。
- **COMTRADE 不作为协议对外通告**。导入一份故障录波文件并不会建立实时通道。
- **特定协议的模型目录留在内核之外**。下游的静态 Rust 组合可以使用已发布的 SDK、端口和 testkit 契约，但不能绕过受治理命令或实时状态权威。

## 投运与验证

组合矩阵中的 `Evidence`（证据）列记录每个适配器当前的验证等级。即便是 `loopback` 等级，也不能替代设备配置文件、厂商点位表、串口/电气验证或互操作性认证。

启用物理通道之前：

1. 检查已安装的运行时清单和实时协议目录；
2. 核对确切的设备版本、传输设置和映射表；
3. 把入站监听器放在专用的现场网络上，并用防火墙加以保护；
4. 以禁用状态创建通道，先验证只读数据；
5. 对照设备核实时间戳、质量、新鲜度和缩放；
6. 只有在权限、范围、步长、确认、审计和物理结果检查全部就绪之后，才投运 C/A 点位。

完整的通道生命周期见[连接设备](/zh/guides/connect-devices)，配置权威与同步见[配置参考](/zh/reference/configuration)。
