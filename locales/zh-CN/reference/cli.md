---
title: "CLI 参考"
description: "全部 aether 命令，涵盖服务、协议通道、COMTRADE 检查、同步、诊断和规则"
updated: 2026-08-02
---

# CLI 参考

`aether`（版本 0.5.0）是 Aether 的统一管理工具，涵盖配置管理（`setup`、`sync`、`status`、`init`、`export`）和服务操作（`channels`、`models`、`rules`、`services`、`logs` 等）。下面每一节都由该二进制文件自身的 `--help` 输出生成。

```
Usage: aether [OPTIONS] <COMMAND>
```

在终端中运行 `aether <command> --help` 可以得到相同的信息。

## 全局标志

每个命令都接受这些标志：

| 标志 | 说明 |
|------|-------------|
| `-v, --verbose` | 启用详细日志 |
| `--no-color` | 禁用彩色输出 |
| `--json` | 以 JSON 输出（不显示横幅和颜色；供脚本和 AI 智能体使用） |
| `--host <HOST>` | 远程操作的目标主机（覆盖默认的 localhost） |
| `-c, --config-path <CONFIG_PATH>` | 配置目录；覆盖环境变量和已安装布局 |
| `--db-path <DB_PATH>` | 数据库目录；覆盖环境变量和已安装布局 |
| `-h, --help` | 打印帮助 |
| `-V, --version` | 打印版本 |

使用 `--json` 时，结果以 `{success, ...}` 信封写入标准输出（见[退出代码和 JSON 模式](#退出代码和-json-模式)），诊断信息写入标准错误。`mcp` 命令是例外：它通过 stdio 使用 MCP JSON-RPC 通信，因此 `--json` 不会改变它的输出。帮助输出没有声明任何环境变量；主机和路径的默认值来自上面的标志。

## aether setup

规划或应用保守的首次运行配置。不带子命令时，`setup` 等同于 `setup plan`，并且不做任何持久化写入。

```
Usage: aether setup [COMMAND]

Commands:
  plan   Recompute and print the read-only setup plan
  apply  Apply an unchanged safe plan after explicit confirmation
```

```bash
# Human-readable, read-only plan
aether setup

# Structured plan for an AI agent or script
aether --json setup

# The only persistent setup operation
aether setup apply --plan-id <PLAN_ID>
```

SHA-256 计划 ID 绑定了目标路径、安全文件的指纹、检测到的额外文件以及 SQLite 状态。apply 在写入之前会重新计算该 ID，并拒绝过期的 ID。站点状态如下：

| 状态 | 含义 | apply 的行为 |
|-------|---------|----------------|
| `fresh` | 不存在任何配置或本地数据库 | 只创建四个安全的空文件和本地 SQLite 状态 |
| `safe_partial` | 存在安全文件/数据库的一个精确子集 | 保留现有文件，只创建缺失的安全状态 |
| `safe_ready` | 安全的空配置已经同步 | 成功，无操作 |
| `existing` | 检测到完整的自定义站点或已投运站点 | 拒绝；零写入 |
| `blocked` | 检测到部分自定义、不可读或无法识别的站点 | 拒绝；零写入，并明确列出阻塞项 |

即使 apply 成功，也会报告 `ready: false`：它从不启动服务、启用设备或规则、执行物理控制，也不安装领域包。接下来运行 `aether services start` 和 `aether doctor`；设备投运是另一项单独的、受审计的操作。

## aether runtime-manifest

在安装 Pack 或启动服务之前，校验由组合提供的运行时元数据。不带 `--path` 时，该命令读取 `<config-path>/runtime-manifest.json`，并且还要求其目标操作系统和架构与当前进程一致。显式给出制品路径时，则校验结构定义、Aether 版本、已知的能力/特性、由特性精确推导出的协议以及校验和，而不把暂存的制品绑定到执行校验的主机。

```bash
aether runtime-manifest
aether --json runtime-manifest --path ./runtime-manifest.json
```

不存在回退到完整分发的路径：即使 `packs: []`，缺失、被篡改或不兼容的清单也是错误。

## aether comtrade

检查一对 IEC/IEEE COMTRADE CFG/DAT 文件，或把其中的采样转换为规范化的 CSV。除了显式指定的 CSV 输出路径之外，这些都是本地的只读文件解析操作；它们不会创建实时 IO 通道，也不会写入 SHM。

```text
Usage: aether comtrade [OPTIONS] <COMMAND>

Commands:
  inspect     校验并汇总一个 COMTRADE CFG 文件和可选的 DAT 文件
  export-csv  把 COMTRADE 采样转换为规范化的 CSV 文件
```

```bash
aether comtrade inspect --cfg disturbance.cfg
aether --json comtrade inspect --cfg disturbance.cfg --dat disturbance.dat
aether comtrade export-csv \
  --cfg disturbance.cfg \
  --dat disturbance.dat \
  --output disturbance.csv
```

省略 `--dat` 时，该命令会查找把 CFG 路径的后缀换成 `.dat` 的文件。支持的 DAT 格式有 ASCII、BINARY、BINARY32 和 FLOAT32。文件边界和解码后的输出行为见[协议适配器参考](/zh/reference/protocol-adapters#comtrade-文件)。

## aether cloud

生成或查看本地的 AetherCloud 网关登记身份。这些命令不会启动 CloudLink，也不报告 MQTT 连接状态。

```text
Usage: aether cloud [OPTIONS] <COMMAND>

Commands:
  enroll  生成或复用本地密钥，并向 AetherCloud 提交一次认领
  status  读取本地网关登记状态，不联系 AetherCloud
  help    打印本消息或指定子命令的帮助
```

交互式登记通过隐藏输入的提示符读取登记令牌：

```bash
aether cloud enroll \
  --cloud-url https://api.aetheriot.ai \
  --tenant-id <TENANT_UUID> \
  --project-id <PROJECT_UUID> \
  --gateway-id <GATEWAY_UUID>
```

非交互式调用方必须使用 `--token-stdin`；不存在通过命令行传入令牌的选项。开发用的 HTTP 还需要 `--allow-insecure-localhost`，并且只限于 `localhost` 或 `127.0.0.1` 这两个确切的主机。

```bash
aether cloud status
aether --json cloud status
```

status 报告不可变的 Cloud scope、公钥指纹、登记状态以及可选的已认领修订。它从不报告私钥、登记令牌、完整公钥，也不会编造 CloudLink 在线状态。状态机、重试行为、存储基线和暂行的 HTTP 契约见 [AetherCloud 网关登记](/zh/reference/gateway-enrollment)。

## aether packs

构建或安装仅含 Pack 的制品。这些是本地文件系统操作；`--host` 会被忽略。

```text
Usage: aether packs [OPTIONS] <COMMAND>

Commands:
  build    构建绑定到某一个内核运行时清单的纯数据 Pack 捆绑包
  install  校验、发布并原子地激活一个 Pack 捆绑包
```

```bash
aether packs build \
  --pack-root ./packs/example \
  --runtime-manifest ./runtime-manifest.json \
  --output ./example.bundle

aether packs install --artifact ./example.bundle
```

`build` 根据所提供的、带校验和的运行时清单校验 `pack.yaml`，并拒绝内核/构建目录、源文件、可执行文件、符号链接以及大小不受限的负载。`install` 要求已安装内核的版本、目标和完整的运行时清单摘要全部匹配，发布到 `<data-path>/packs/<id>/<version>`，并且只有在校验了完整的候选激活 Pack 集合之后才原子地更新 `global.yaml`。它不会启动服务，也不会投运设备。

## aether sync

把全部配置同步到 SQLite 数据库。

```
Usage: aether sync [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `-n, --dry-run` | 只校验，不写入数据库（试运行） |
| `-f, --force` | 校验成功后替换由 sync 管理的行；只要存在任何受治理的动作路由就会被拒绝 |
| `-d, --detailed` | 显示每一项的详细进度 |
| `--check` | 检查数据库一致性（重复项、引用） |

```bash
aether sync --dry-run
```

这里的校验覆盖配置结构和引用。它**不**检查协议映射：这些结构定义属于编译它们的协议适配器，适配器会在通道激活时校验它们。因此，`slave_id` 超出范围或功能码不存在的映射能通过 `sync`，却会在激活时被拒绝。文本报告和 `--json` 报告都会在 `unchecked` 中指明这一点，调用方无需自行推断。

只要还有运行时所有者存活，`sync` 就拒绝运行，这样离线应用配置的操作就不会与持有同一状态的服务发生竞争。所有权由各服务的运行时产物判定——`aether-io` 看它的 SHM 写入器心跳，`aether-automation` 看它的 PointWatch 套接字——而不是看某个众所周知的端口，因此它会跟随 `AETHER_SHM_PATH`，并且无论服务监听哪个端口都能检测到。

## aether status

显示当前配置状态。

```
Usage: aether status [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `-d, --detailed` | 显示详细状态 |

```bash
aether status --detailed
```

## aether init

初始化数据库结构定义（仅迁移，可安全升级）。没有命令专属的标志。

```
Usage: aether init [OPTIONS]
```

```bash
aether init
```

## aether export

把配置从 SQLite 导出为 YAML/CSV。

```
Usage: aether export [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `-O, --output <OUTPUT>` | 输出目录（默认：`config/`） |
| `-d, --detailed` | 显示详细的导出进度 |

```bash
aether export -O /tmp/config-backup
```

## aether channels

管理通信通道和协议。

```
Usage: aether channels [OPTIONS] <COMMAND>
```

子命令：`list`、`status`、`control`、`adjust`、`reload`、`health`、`create`、`update`、`delete`、`enable`、`disable`、`mappings`、`unmapped-points`、`write`、`points`。

### `channels list`

列出所有已配置的通信通道。

```
Usage: aether channels list [OPTIONS]
```

```bash
aether channels list --json
```

### `channels status`

获取指定通道的状态。

```
Usage: aether channels status [OPTIONS] <CHANNEL_ID>
```

```bash
aether channels status 1001
```

### `channels reconcile`

通过规范的受治理 `POST /api/channels/reconcile` 端点，按权威的期望状态对账每个通道运行时。

```
Usage: aether channels reconcile [OPTIONS] --confirmed
```

| 标志 | 说明 |
|------|-------------|
| `--confirmed` | 显式确认这次高风险的运行时对账；需要 `AETHER_ACCESS_TOKEN` |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels reconcile --confirmed
```

回执会报告每个通道经过清理的期望状态观测和运行时投影，以及 `degraded_count`、`reconciliation_required` 和终态 `completion_audit`。请保留它的 UUID `request_id`；这项操作可能重连协议会话，并且是非幂等的，因此绝不要自动重试，即使终态审计不完整也一样。

### `channels health`

检查通信服务的健康状况。

```
Usage: aether channels health [OPTIONS]
```

```bash
aether channels health --json
```

### `channels create`

创建新的通信通道。

```
Usage: aether channels create [OPTIONS] --name <NAME> --protocol <PROTOCOL> --params <PARAMS> --confirmed
```

| 标志 | 说明 |
|------|-------------|
| `--name <NAME>` | 通道名称（必须唯一） |
| `--protocol <PROTOCOL>` | 已安装的 IO 构建所公布的运行时协议 ID |
| `--params <PARAMS>` | JSON 字符串形式的协议参数（例如 `'{"host":"192.168.1.10","port":502}'`） |
| `--description <DESCRIPTION>` | 通道描述 |
| `--enabled <ENABLED>` | 立即启动通道（默认：false）[可选值：`true`、`false`] |
| `--id <ID>` | 指定通道 ID（省略时自动分配） |
| `--confirmed` | 显式确认这次高风险的投运变更；需要 `AETHER_ACCESS_TOKEN` |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels create \
  --name pcs-main --protocol modbus_tcp \
  --params '{"host":"192.168.1.10","port":502}' --confirmed
```

实际接受哪些 ID 取决于已安装的特性组合。请先查阅带校验和的运行时清单和实时协议目录，再到[协议适配器参考](/zh/reference/protocol-adapters)中查找适配器参数和点位映射。

### `channels update`

更新现有通道的配置。

```
Usage: aether channels update [OPTIONS] <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--name <NAME>` | 新的通道名称 |
| `--params <PARAMS>` | 更新后的协议参数，JSON 字符串形式 |
| `--description <DESCRIPTION>` | 更新后的描述 |
| `--expected-revision <EXPECTED_REVISION>` | 必需的期望状态比较并设置保护，取自最近一次通道读取；至少为 1 |
| `--confirmed` | 显式确认这次高风险的投运变更；需要 `AETHER_ACCESS_TOKEN` |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels update 1001 \
  --description "PCS main feed" --expected-revision 7 --confirmed
```

### `channels delete`

删除一个通道及其归测量侧所有的点位、映射和路由。只要还有物理动作路由指向该通道，命令就会失败关闭；请先用受治理的路由命令删除或迁移该路由。

```
Usage: aether channels delete [OPTIONS] <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `-f, --force` | 仅跳过交互式提示；它永远不能代替 `--confirmed` |
| `--expected-revision <EXPECTED_REVISION>` | 必需的期望状态比较并设置保护，取自最近一次通道读取；至少为 1 |
| `--confirmed` | 显式确认这次高风险的投运变更；需要 `AETHER_ACCESS_TOKEN` |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels delete 1001 \
  --force --expected-revision 7 --confirmed
```

### `channels enable`

启用通道。

```
Usage: aether channels enable [OPTIONS] <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--expected-revision <EXPECTED_REVISION>` | 必需的期望状态比较并设置保护，取自最近一次通道读取；至少为 1 |
| `--confirmed` | 显式确认这次高风险的生命周期变更；需要 `AETHER_ACCESS_TOKEN` |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels enable 1001 \
  --expected-revision 7 --confirmed
```

### `channels disable`

禁用通道。

```
Usage: aether channels disable [OPTIONS] <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--expected-revision <EXPECTED_REVISION>` | 必需的期望状态比较并设置保护，取自最近一次通道读取；至少为 1 |
| `--confirmed` | 显式确认这次高风险的生命周期变更；需要 `AETHER_ACCESS_TOKEN` |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether channels disable 1001 \
  --expected-revision 7 --confirmed
```

五个通道投运和生命周期变更都调用受治理的 `io.channel.manage` 应用边界。在期望状态提交之后，成功结果仍可能报告降级的运行时投影。请保留 `request_id`，检查 `resulting_revision` 和 `reconciliation_required`，并且不要自动重试这个非幂等命令。更新、删除、启用和禁用需要最近一次通道读取返回的修订；缺少它时，命令在发出 HTTP 请求之前就会失败。`channels reconcile` 是第六个受治理的通道命令，它单独映射到 `io.channel.reconcile`，同时要求同样的 `io.channel.manage` 权限、显式确认、Bearer 令牌、UUID 请求 ID 和审计策略。

### `channels mappings`

显示通道的点位映射。

```
Usage: aether channels mappings [OPTIONS] <CHANNEL_ID>
```

```bash
aether channels mappings 1001
```

### `channels unmapped-points`

列出通道上没有协议地址映射的点位。

```
Usage: aether channels unmapped-points [OPTIONS] <CHANNEL_ID>
```

```bash
aether channels unmapped-points 1001
```

### `channels points list`

列出点位（按 T/S/C/A 分组）。

```
Usage: aether channels points list [OPTIONS] <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--type <TYPE>` | 按点位类型过滤：`T`、`S`、`C` 或 `A` |

```bash
aether channels points list 1001 --type T
```

### `channels points add`

向通道添加一个点位。位置参数：`<CHANNEL_ID>` `<POINT_TYPE>`（T 遥测、S 信号、C 控制、A 调节）`<POINT_ID>`。

```
Usage: aether channels points add [OPTIONS] --name <NAME> <CHANNEL_ID> <POINT_TYPE> <POINT_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--name <NAME>` | 信号名称 |
| `--unit <UNIT>` | 单位（例如 V、A、kW） |
| `--scale <SCALE>` | 缩放系数 |
| `--description <DESCRIPTION>` | 描述 |
| `--data-type <DATA_TYPE>` | 数据类型（默认：T/A 为 float32，S/C 为 bool） |
| `--protocol-mapping <JSON>` | 协议地址映射；各协议的字段见[连接设备](/zh/guides/connect-devices) |
| `--expected-revision <N>` | 本次变更所期望的通道修订，取自最近一次通道读取 |
| `--confirmed` | 确认这次受治理的点位拓扑变更 |

点位拓扑以通道的修订为围栏，因此 `--expected-revision` 和 `--confirmed` 是必需的，与通道生命周期命令完全一样。用 `aether channels get <id>` 读取当前修订。

```bash
aether channels points add 1001 T 101 --name voltage --unit V --scale 0.1 \
  --protocol-mapping '{"slave_id":1,"function_code":3,"register_address":0}' \
  --expected-revision 3 --confirmed
```

### `channels points update`

更新点位的属性。

```
Usage: aether channels points update [OPTIONS] <CHANNEL_ID> <POINT_TYPE> <POINT_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--name <NAME>` | 信号名称 |
| `--unit <UNIT>` | 单位 |
| `--scale <SCALE>` | 缩放系数 |
| `--description <DESCRIPTION>` | 描述 |
| `--protocol-mapping <JSON>` | 替换该点位的协议地址映射 |
| `--expected-revision <N>` | 本次变更所期望的通道修订 |
| `--confirmed` | 确认这次受治理的点位拓扑变更 |

```bash
aether channels points update 1001 T 101 --scale 0.01 \
  --expected-revision 4 --confirmed
```

### `channels points remove`

从通道移除一个点位。

```
Usage: aether channels points remove [OPTIONS] <CHANNEL_ID> <POINT_TYPE> <POINT_ID>
```

| 标志 | 说明 |
|------|-------------|
| `-f, --force` | 跳过交互式提示 |
| `--expected-revision <N>` | 本次变更所期望的通道修订 |
| `--confirmed` | 确认这次受治理的点位拓扑变更 |

```bash
aether channels points remove 1001 T 101 --force \
  --expected-revision 5 --confirmed
```

### `channels points batch`

根据 JSON 文件批量创建/更新/删除点位。

```
Usage: aether channels points batch [OPTIONS] --file <FILE> <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--file <FILE>` | JSON 文件的路径：`{"create":[],"update":[],"delete":[]}` |

```bash
aether channels points batch 1001 --file points.json
```

### `channels points mapping`

显示单个点位的实例映射。

```
Usage: aether channels points mapping [OPTIONS] <CHANNEL_ID> <POINT_TYPE> <POINT_ID>
```

```bash
aether channels points mapping 1001 T 101
```

## aether models

管理产品模板和设备实例。有两个子命令组：`products` 和 `instances`。

```
Usage: aether models [OPTIONS] <COMMAND>
```

### `models products list`

显示由已通过校验的激活 Pack 和站点配置选定的产品模型。

```
Usage: aether models products list [OPTIONS]
```

```bash
aether models products list --json
```

### `models products available`

列出 `products/` 目录中的产品模型定义。

```
Usage: aether models products available [OPTIONS]
```

```bash
aether models products available
```

### `models products get`

显示某个选定产品模型的详细信息。

```
Usage: aether models products get [OPTIONS] <NAME>
```

```bash
aether models products get battery
```

### `models instances list`

显示所有设备实例。

```
Usage: aether models instances list [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `-p, --product <PRODUCT>` | 按产品类型过滤 |

```bash
aether models instances list --product battery
```

### `models instances create`

根据产品模板创建新的设备实例。位置参数：`<PRODUCT>` `<NAME>`。

```
Usage: aether models instances create [OPTIONS] <PRODUCT> <NAME>
```

| 标志 | 说明 |
|------|-------------|
| `-p, --props <PROPS>` | `key=value` 格式的属性 |

```bash
aether models instances create battery bat-01 --props capacity=100
```

### `models instances get`

显示某个实例的详细信息。

```
Usage: aether models instances get [OPTIONS] <NAME>
```

```bash
aether models instances get bat-01
```

### `models instances update`

更新实例属性。

```
Usage: aether models instances update [OPTIONS] <NAME>
```

| 标志 | 说明 |
|------|-------------|
| `-p, --props <PROPS>` | 要更新的属性，`key=value` 格式 |

```bash
aether models instances update bat-01 --props capacity=120
```

### `models instances delete`

删除设备实例。

只要该实例还拥有物理动作路由，命令就会失败关闭；请先用受治理的路由命令删除或迁移该路由。

```
Usage: aether models instances delete [OPTIONS] <NAME>
```

| 标志 | 说明 |
|------|-------------|
| `-f, --force` | 强制删除，不经确认 |

```bash
aether models instances delete bat-01 --force
```

### `models instances data`

从权威的 SHM 平面获取实时的测量点位和动作点位数据。

```
Usage: aether models instances data [OPTIONS] <INSTANCE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `-t, --point-type <POINT_TYPE>` | 点位类型过滤（M 表示测量，A 表示动作；不指定则两者都返回） |

```bash
aether models instances data 9 --point-type M
```

### `models instances action`

向本地命令平面提交一个经过确认的控制动作。成功的响应并不能证明物理设备已经执行；请回读对应的测量值来验证结果。如果返回的 `audit.status` 为 `incomplete`，请保留 `request_id` 和 `command_id`；该动作已被接受，不得重试。运行此命令前，请把 `AETHER_ACCESS_TOKEN` 设置为当前有效的 Admin 或 Engineer 访问令牌；伪造的操作者/角色请求头和本地端口访问都不会授予设备控制权限。

```
Usage: aether models instances action [OPTIONS] --point-id <POINT_ID> --value <VALUE> <INSTANCE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--point-id <POINT_ID>` | 以字符串编码的数字动作点位 ID，例如 `"1"` |
| `--value <VALUE>` | 要写入的值 |
| `--confirmed` | 显式确认这条高风险设备命令 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether models instances action 9 --point-id 1 --value 50 --confirmed
```

## aether rules

管理并执行业务规则。

```
Usage: aether rules [OPTIONS] <COMMAND>
```

### `rules list`

列出所有已配置的业务规则。

```
Usage: aether rules list [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `--enabled` | 只显示已启用的规则 |

```bash
aether rules list --enabled
```

### `rules get`

显示某条规则的详细信息。

```
Usage: aether rules get [OPTIONS] <RULE_ID>
```

```bash
aether rules get 3
```

### `rules enable`

启用业务规则。

```
Usage: aether rules enable [OPTIONS] <RULE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--confirmed` | 显式确认这次高风险的规则策略变更 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether rules enable 3 --confirmed
```

### `rules disable`

禁用业务规则。

```
Usage: aether rules disable [OPTIONS] <RULE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--confirmed` | 显式确认这次高风险的规则策略变更 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether rules disable 3 --confirmed
```

### `rules execute`

执行一条规则（先求值，条件满足时再执行）。如果返回的 `audit.status` 为 `incomplete`，请保留 `request_id`；执行已经完成，不得重试。

```
Usage: aether rules execute [OPTIONS] <RULE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--confirmed` | 显式确认该规则可以下发真实的设备命令 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether rules execute 3 --confirmed
```

### `rules create`

创建新的业务规则。

```
Usage: aether rules create [OPTIONS] --name <NAME>
```

| 标志 | 说明 |
|------|-------------|
| `--name <NAME>` | 规则名称 |
| `--description <DESCRIPTION>` | 规则描述 |
| `--confirmed` | 显式确认这次高风险的规则策略变更 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether rules create --name night-charge --description "Charge during off-peak hours" --confirmed
```

### `rules update`

更新规则元数据和/或流程逻辑。

```
Usage: aether rules update [OPTIONS] <RULE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--name <NAME>` | 新的规则名称 |
| `--description <DESCRIPTION>` | 新的描述 |
| `--enabled <ENABLED>` | 启用或禁用规则 [可选值：`true`、`false`] |
| `--priority <PRIORITY>` | 规则优先级（数值越小，优先级越高） |
| `--cooldown-ms <COOLDOWN_MS>` | 两次执行之间的冷却时间，单位毫秒 |
| `--flow-json <FLOW_JSON>` | Vue Flow JSON 文件的路径（用 `-` 表示标准输入） |
| `--confirmed` | 显式确认这次高风险的规则策略变更 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether rules update 3 --flow-json flow.json --confirmed
```

### `rules delete`

删除业务规则。

```
Usage: aether rules delete [OPTIONS] <RULE_ID>
```

| 标志 | 说明 |
|------|-------------|
| `-f, --force` | 跳过确认提示 |
| `--confirmed` | 必需的安全确认；`--force` 不能代替它 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether rules delete 3 --force --confirmed
```

## aether routing

管理通道到实例的点位路由。

```
Usage: aether routing [OPTIONS] <COMMAND>
```

### `routing list`

列出路由配置。

```
Usage: aether routing list [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `-i, --instance <INSTANCE>` | 按实例 ID 过滤 |
| `--channel <CHANNEL>` | 按通道 ID 过滤 |

```bash
aether routing list --instance 9
```

列表响应包含 `logical_routing_revision`。把该值通过 `--expected-revision` 传给下一次变更；变更成功后，改用返回的 `resulting_revision`。每一次变更还需要 `AETHER_ACCESS_TOKEN` 和 `--confirmed`。

### `routing measurement`

治理一个逻辑测量点位的单个 T/S 来源：

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing measurement upsert \
  9 101 --channel-id 1001 --channel-type t --channel-point-id 101 \
  --expected-revision 7 --confirmed

AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing measurement disable \
  9 101 --expected-revision 8 --confirmed

AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing measurement enable \
  9 101 --expected-revision 9 --confirmed

AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing measurement delete \
  9 101 --expected-revision 10 --confirmed
```

### `routing action`

治理一个逻辑动作点位的单个 C/A 目标。更改路由不会执行设备命令。

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing action upsert \
  9 1 --channel-id 1001 --channel-type c --channel-point-id 7 \
  --expected-revision 11 --confirmed

AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing action disable \
  9 1 --expected-revision 12 --confirmed

AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing action enable \
  9 1 --expected-revision 13 --confirmed

AETHER_ACCESS_TOKEN='<signed access JWT>' aether routing action delete \
  9 1 --expected-revision 14 --confirmed
```

两个 `upsert` 命令都接受 `--disabled`，用来投运一条路由而不激活它。路由变更有意设计为单路由操作：不存在通用的批量命令，也不存在测量/动作混合的删除命令，因为这些操作无法提供一个无歧义的、以修订为围栏的事务。

## aether services

启动、停止和管理 Aether 服务。所有服务参数都是可选的；省略时作用于全部服务。

```
Usage: aether services [OPTIONS] <COMMAND>
```

### `services start`

启动一个或多个 Aether 服务。

```
Usage: aether services start [OPTIONS] [SERVICES]...
```

```bash
aether services start aether-io aether-automation
```

### `services stop`

停止一个或多个 Aether 服务。

```
Usage: aether services stop [OPTIONS] [SERVICES]...
```

```bash
aether services stop
```

### `services restart`

重启一个或多个 Aether 服务。

```
Usage: aether services restart [OPTIONS] [SERVICES]...
```

```bash
aether services restart aether-io
```

### `services status`

显示 Aether 服务的状态。

```
Usage: aether services status [OPTIONS] [SERVICES]...
```

```bash
aether services status --json
```

### `services logs`

查看 Aether 服务的日志。

```
Usage: aether services logs [OPTIONS] <SERVICE>
```

| 标志 | 说明 |
|------|-------------|
| `-f, --follow` | 持续跟随日志输出 |
| `-n, --tail <TAIL>` | 从末尾开始显示的行数（默认：100） |

```bash
aether services logs aether-io --follow --tail 200
```

### `services build`

为服务构建 Docker 镜像。

```
Usage: aether services build [OPTIONS] [SERVICES]...
```

```bash
aether services build aether-io
```

### `services pull`

拉取最新的 Docker 镜像。

```
Usage: aether services pull [OPTIONS]
```

```bash
aether services pull
```

### `services clean`

清理 Docker 卷和网络。

```
Usage: aether services clean [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `--volumes` | 同时删除卷（只有长格式；`-v` 是全局的详细输出标志） |

```bash
aether services clean --volumes
```

### `services refresh`

用最新镜像强制重新创建容器。

```
Usage: aether services refresh [OPTIONS] [SERVICES]...
```

| 标志 | 说明 |
|------|-------------|
| `-p, --pull` | 重新创建之前先拉取最新镜像 |
| `-s, --smart` | 使用智能模式（只在镜像发生变化时重新创建；有状态的可选服务仍需显式指定） |

```bash
aether services refresh --pull --smart
```

## aether logs

日志级别控制和日志文件查看器。

```
Usage: aether logs [OPTIONS] <COMMAND>
```

### `logs level`

设置服务的日志级别。位置参数：`<SERVICE>`（io、automation、all）和 `<LEVEL>`（trace、debug、info、warn、error），或者完整的过滤规格，例如 `"info,io=debug"`。

```
Usage: aether logs level [OPTIONS] <SERVICE> <LEVEL>
```

```bash
aether logs level all debug
```

### `logs get`

获取服务当前的日志级别（aether-io、aether-automation、all）。

```
Usage: aether logs get [OPTIONS] <SERVICE>
```

```bash
aether logs get aether-io
```

### `logs list`

列出磁盘上的日志文件（默认：今天）。服务过滤条件是可选的。

```
Usage: aether logs list [OPTIONS] [SERVICE]
```

| 标志 | 说明 |
|------|-------------|
| `-d, --date <DATE>` | `YYYYMMDD` 格式的日期（默认：今天） |

```bash
aether logs list aether-io --date 20260709
```

### `logs view`

查看服务日志文件的最近若干行（aether-io、aether-automation、aether-history、aether-uplink、alarm、api）。

```
Usage: aether logs view [OPTIONS] <SERVICE>
```

| 标志 | 说明 |
|------|-------------|
| `-n, --lines <LINES>` | 从末尾算起的行数（默认：50） |
| `--api` | 显示 API 访问日志，而不是主日志 |
| `-g, --grep <GREP>` | 只保留包含该模式的行（不区分大小写） |

```bash
aether logs view aether-io -n 100 --grep ERROR
```

### `logs tail`

实时跟踪服务日志文件。

```
Usage: aether logs tail [OPTIONS] <SERVICE>
```

| 标志 | 说明 |
|------|-------------|
| `--api` | 显示 API 访问日志，而不是主日志 |
| `-g, --grep <GREP>` | 只保留包含该模式的行（不区分大小写） |

```bash
aether logs tail aether-automation --grep ERROR
```

### `logs ui`

打开支持滚动、搜索和跟随的交互式日志查看器。

```
Usage: aether logs ui [OPTIONS] <SERVICE>
```

| 标志 | 说明 |
|------|-------------|
| `--api` | 显示 API 访问日志，而不是主日志 |

```bash
aether logs ui aether-io
```

## aether shm

零延迟的共享内存 CLI（类似 mysql-cli）。子命令是可选的；直接运行 `aether shm` 会打开共享内存文件并进入交互式会话（如果 SHM 文件尚不存在，则会失败）。

```
Usage: aether shm [OPTIONS] [COMMAND]
```

### `shm get`

获取点位值。键格式：`inst:<id>:M|A:<point_id>` 或 `ch:<id>:T|S|C|A:<point_id>`。

```
Usage: aether shm get [OPTIONS] <KEY>
```

```bash
aether shm get inst:9:M:101
# 24.6  [good, 812ms ago]
```

打印出的值会附带它所来自的采样的年龄，以及该采样是否仍然新鲜。停止响应的通道会把最后一个值留在槽位里，因此单凭数字无法把它与实时读数区分开；早于 `SHM_WRITER_STALE_AFTER_MS` 的采样会被标记为 `stale`。

### `shm info`

直接检查已提交的点位平面和通道健康平面，不经过 HTTP，也不需要运行中的观察器守护进程。该命令校验两个物理文件、持久的拓扑见证、发布纪元、写入器代次、心跳年龄，并执行一次汇总的槽位/质量扫描。它从不刷新心跳、修复文件或发布代次。

```
Usage: aether shm info [OPTIONS]

Options:
      --no-scan  Validate headers and commit without scanning every slot
```

```bash
aether shm info
# Aether SHM HEALTHY
# Publication:   928
# Point plane:
#   slots/size:  83417 / 2669408 bytes
#   generation:  184  heartbeat: 312ms  hash: 0x...
# Health plane:
#   channels:    online=408 offline=4

aether --json shm info
```

JSON 输出使用常规的 `{success, data}` CLI 信封，并包含供脚本使用的稳定发现项代码。`healthy` 表示两个平面匹配同一次提交，并且它们的心跳最多是 3 秒之前的；3–30 秒为 `degraded`；心跳缺失、来自未来或更旧，以及任何布局/提交不匹配，都是 `unhealthy`。`SHM_WRITER_STALE_AFTER_MS` 仍然是最终的陈旧阈值；健康阈值是它的十分之一，上限为 3 秒。

### `shm watch`

监视键的变化（实时监控）。

```
Usage: aether shm watch [OPTIONS] <KEY>
```

| 标志 | 说明 |
|------|-------------|
| `-i, --interval-ms <INTERVAL_MS>` | 轮询间隔，单位毫秒（默认：500） |

```bash
aether shm watch ch:1001:T:101 --interval-ms 200
# [13:20:20] 24.6  [good, 140ms ago]
# [13:20:20] 24.6  [stale, 41200ms ago]
```

每一行都带有与 `shm get` 相同的新鲜度标记。设备消失时，输出流并不会停止——槽位保留着最后一个值——所以冻结的读数要靠它的年龄来辨别，而不是靠输出结束。

### `shm top`

实时 TUI 仪表板（类似 htop）。它的标题栏每秒刷新一次同一个只读观察器，显示总体状态、发布纪元、点位心跳和健康心跳的年龄，以及质量/未写入/争用计数。点位表仍然显示在它的下方。

```
Usage: aether shm top [OPTIONS]
```

```bash
aether shm top
```

### `shm serve`

从 CLI 提供可选的浏览器仪表板。它不是第七个运行时服务：该进程只在这条命令运行期间存在，以只读方式打开 SHM，并且只接受环回连接。

```
Usage: aether shm serve [OPTIONS]

Options:
      --bind <BIND>  Loopback address for the local dashboard [default: 127.0.0.1:6070]
      --no-scan      Validate headers and commit without scanning every slot
```

```bash
aether shm serve
# Open http://127.0.0.1:6070
```

这个自包含的页面每秒刷新一次，显示权威状态、发布纪元、两个写入器的心跳、精确的平面大小和代次、点位质量分布、有界的带类型实时点位预览，以及带稳定代码的发现项。它的 JSON 来源是同源的只读端点 `/api/v1/observation`。服务器拒绝 `0.0.0.0`、局域网和公网绑定地址；它没有变更路由、外部资源、CORS 授权或持久状态。当 `--db-path` 能解析到与实时 SHM 布局匹配的 SQLite 清单时，点位预览可用；解析不到时，平面可观测性仍然可用。

## aether doctor

检查系统健康状况并诊断问题。对这条命令而言，`-v, --verbose` 会显示详细信息（响应时间等）。

```
Usage: aether doctor [OPTIONS]
```

```bash
aether doctor --verbose
```

## aether templates

管理通道配置模板。

```
Usage: aether templates [OPTIONS] <COMMAND>
```

### `templates list`

列出所有通道模板。

```
Usage: aether templates list [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `-p, --protocol <PROTOCOL>` | 按协议类型过滤 |

```bash
aether templates list --protocol modbus_tcp
```

### `templates get`

显示某个模板的详细信息。

```
Usage: aether templates get [OPTIONS] <ID>
```

```bash
aether templates get 3
```

### `templates snapshot`

把通道的配置快照保存为可复用的模板。

```
Usage: aether templates snapshot [OPTIONS] --name <NAME> <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `-n, --name <NAME>` | 模板名称 |
| `-d, --description <DESCRIPTION>` | 模板描述 |

```bash
aether templates snapshot 1001 --name pcs-modbus-template
```

### `templates apply`

把模板应用到目标通道。

```
Usage: aether templates apply [OPTIONS] <TEMPLATE_ID> <CHANNEL_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--clear` | 应用前清除现有点位 |
| `--slave-id <SLAVE_ID>` | 覆盖 Modbus 的从站 ID |

```bash
aether templates apply 3 1002 --clear --slave-id 2
```

### `templates delete`

删除通道模板。

```
Usage: aether templates delete [OPTIONS] <ID>
```

| 标志 | 说明 |
|------|-------------|
| `-f, --force` | 强制删除，不经确认 |

```bash
aether templates delete 3 --force
```

## aether alarms

管理告警规则（创建/更新/删除/启用/禁用）；查询告警、事件和统计信息。

```
Usage: aether alarms [OPTIONS] <COMMAND>
```

### `alarms list`

列出当前活动的告警。

```
Usage: aether alarms list [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `--channel <CHANNEL>` | 按通道 ID 过滤 |
| `--level <LEVEL>` | 按警告级别过滤（1=低，2=中，3=高） |
| `--keyword <KEYWORD>` | 关键字搜索（规则名称、通道、点位） |
| `--page <PAGE>` | 页码，从 1 开始（默认：1） |
| `--size <SIZE>` | 每页条数（默认：50） |

```bash
aether alarms list --level 3
```

### `alarms get`

获取某条活动告警的详情。

```
Usage: aether alarms get [OPTIONS] <ID>
```

```bash
aether alarms get 42
```

### `alarms resolve`

手动清除一条活动告警指示。如果底层条件仍然成立，监视器会在之后的某次求值中创建新的告警。

```
Usage: aether alarms resolve [OPTIONS] --confirmed <ID>
```

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether alarms resolve 42 --confirmed
```

### `alarms rules`

列出告警规则。

```
Usage: aether alarms rules [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `--channel <CHANNEL>` | 按通道 ID 过滤 |
| `--enabled` | 只显示已启用的规则 |
| `--level <LEVEL>` | 按警告级别过滤（1=低，2=中，3=高） |
| `--keyword <KEYWORD>` | 关键字搜索 |
| `--page <PAGE>` | 页码，从 1 开始（默认：1） |
| `--size <SIZE>` | 每页条数（默认：50） |

```bash
aether alarms rules --enabled
```

### `alarms rule-get`

获取某条告警规则的详情。

```
Usage: aether alarms rule-get [OPTIONS] <ID>
```

```bash
aether alarms rule-get 7
```

### `alarms events`

列出历史告警事件。

```
Usage: aether alarms events [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `--rule <RULE>` | 按规则 ID 过滤 |
| `--event-type <EVENT_TYPE>` | 按事件类型过滤：`trigger` 或 `recovery` |
| `--level <LEVEL>` | 按警告级别过滤（1=低，2=中，3=高） |
| `--keyword <KEYWORD>` | 关键字搜索 |
| `--page <PAGE>` | 页码，从 1 开始（默认：1） |
| `--size <SIZE>` | 每页条数（默认：50） |

```bash
aether alarms events --level 3 --event-type trigger
```

### `alarms stats`

显示告警计数和规则统计信息。

```
Usage: aether alarms stats [OPTIONS]
```

```bash
aether alarms stats --json
```

### `alarms monitor`

显示告警监视循环的状态。

```
Usage: aether alarms monitor [OPTIONS]
```

```bash
aether alarms monitor
```

### `alarms rule-create`

根据 JSON 文件创建告警规则。

告警规则的创建、更新、删除、启用、禁用以及手动解除告警，都是受治理的高风险策略命令。请把 `AETHER_ACCESS_TOKEN` 设置为当前有效的 Admin 或 Engineer 访问 JWT，并传入 `--confirmed`；查询命令在本地接口上仍然不需要令牌。

```
Usage: aether alarms rule-create [OPTIONS] --file <FILE> --confirmed
```

| 标志 | 说明 |
|------|-------------|
| `--file <FILE>` | 符合 alarm 的 `CreateRuleRequest` 的 JSON 文件路径 |
| `--confirmed` | 显式确认这次告警策略变更 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether alarms rule-create --file alarm-rule.json --confirmed
```

### `alarms rule-update`

根据 JSON 文件更新告警规则（只有出现的字段会改变）。

```
Usage: aether alarms rule-update [OPTIONS] --file <FILE> --confirmed <ID>
```

| 标志 | 说明 |
|------|-------------|
| `--file <FILE>` | 符合 alarm 的 `UpdateRuleRequest` 的 JSON 文件路径 |
| `--confirmed` | 显式确认这次告警策略变更 |

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether alarms rule-update 7 --file alarm-rule-patch.json --confirmed
```

### `alarms rule-delete`

删除告警规则。

```
Usage: aether alarms rule-delete [OPTIONS] --confirmed <ID>
```

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether alarms rule-delete 7 --confirmed
```

### `alarms rule-enable`

启用告警规则。

```
Usage: aether alarms rule-enable [OPTIONS] --confirmed <ID>
```

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether alarms rule-enable 7 --confirmed
```

### `alarms rule-disable`

禁用告警规则。

```
Usage: aether alarms rule-disable [OPTIONS] --confirmed <ID>
```

```bash
AETHER_ACCESS_TOKEN='<signed access JWT>' \
  aether alarms rule-disable 7 --confirmed
```

## aether net

管理 MQTT 连接、上行链路配置和 TLS 证书。有两个子命令组：`mqtt` 和 `cert`。

```
Usage: aether net [OPTIONS] <COMMAND>
```

### `net mqtt status`

显示 MQTT 连接状态。

```
Usage: aether net mqtt status [OPTIONS]
```

```bash
aether net mqtt status --json
```

### `net mqtt config`

显示当前的上行链路配置。

```
Usage: aether net mqtt config [OPTIONS]
```

```bash
aether net mqtt config
```

### `net mqtt config-set`

用 JSON 文件替换上行链路配置（完整的 `NetConfig` 对象）。

```
Usage: aether net mqtt config-set [OPTIONS] --file <FILE>
```

| 标志 | 说明 |
|------|-------------|
| `--file <FILE>` | 包含完整 `NetConfig` 对象的 JSON 文件路径 |

```bash
aether net mqtt config-set --file netconfig.json
```

### `net mqtt reconnect`

重新连接 MQTT 客户端。

```
Usage: aether net mqtt reconnect [OPTIONS]
```

```bash
aether net mqtt reconnect
```

### `net mqtt disconnect`

断开 MQTT 客户端的连接。

```
Usage: aether net mqtt disconnect [OPTIONS]
```

```bash
aether net mqtt disconnect
```

### `net cert info`

显示已安装的 TLS 证书信息。

```
Usage: aether net cert info [OPTIONS]
```

```bash
aether net cert info
```

### `net cert delete`

按类型删除 TLS 证书。

```
Usage: aether net cert delete [OPTIONS] <CERT_TYPE>
```

`<CERT_TYPE>` 的可选值：`ca_cert`、`client_cert`、`client_key`。

```bash
aether net cert delete client_cert
```

### `net cert upload`

上传 TLS 证书文件（最大 1 MB）。接受的扩展名：`.pem` `.crt` `.key` `.cer` `.p12` `.pfx`。

```
Usage: aether net cert upload [OPTIONS] --type <CERT_TYPE> <FILE>
```

| 标志 | 说明 |
|------|-------------|
| `--type <CERT_TYPE>` | 证书角色 [可选值：`ca_cert`、`client_cert`、`client_key`] |

```bash
aether net cert upload ca.pem --type ca_cert
```

## aether history

查询历史传感器数据（最新值、时间范围查询）。

```
Usage: aether history [OPTIONS] <COMMAND>
```

### `history latest`

获取某个点位最新的历史值。位置参数：`<SERIES_KEY>`（例如 `inst:9:M` 或 `io:1001:T`）和 `<POINT_ID>`。

```
Usage: aether history latest [OPTIONS] <SERIES_KEY> <POINT_ID>
```

```bash
aether history latest inst:9:M 101
```

### `history query`

查询某个点位的历史数据。

```
Usage: aether history query [OPTIONS] <SERIES_KEY> <POINT_ID>
```

| 标志 | 说明 |
|------|-------------|
| `--from <FROM>` | 开始时间（ISO 8601，例如 `2026-05-12T00:00:00Z`，或 `-1h` 这样的相对时间） |
| `--to <TO>` | 结束时间（ISO 8601，默认为当前时间） |
| `--page <PAGE>` | 页码，从 1 开始（默认：1） |
| `--size <SIZE>` | 每页条数，即每页的最大行数（默认：100） |

```bash
aether history query inst:9:M 101 --from 2026-05-01T00:00:00Z
```

### `history channels`

列出 history 已知的通道。

```
Usage: aether history channels [OPTIONS]
```

```bash
aether history channels
```

### `history metrics`

显示历史存储指标（行数、数据范围等）。

```
Usage: aether history metrics [OPTIONS]
```

```bash
aether history metrics --json
```

### `history health`

检查 history 服务的健康状况。

```
Usage: aether history health [OPTIONS]
```

```bash
aether history health
```

### `history batch`

在一次请求中批量查询多个点位的历史数据（最多 20 个序列）。

```
Usage: aether history batch [OPTIONS] --from <FROM>
```

| 标志 | 说明 |
|------|-------------|
| `--series <KEY,POINT_ID>` | 要查询的序列，格式为 `series_key,point_id`（可重复，最多 20 个） |
| `--from <FROM>` | 开始时间（ISO 8601，例如 `2026-05-01T00:00:00Z`） |
| `--to <TO>` | 结束时间（ISO 8601，默认为当前时间） |
| `--limit <LIMIT>` | 每个序列返回的最大数据点数（默认 1000，最大 5000） |

```bash
aether history batch --series inst:9:M,101 --series inst:9:M,102 \
  --from 2026-05-01T00:00:00Z --limit 500
```

## aether top

用于实时监控的交互式 TUI 仪表板。没有命令专属的标志。

```
Usage: aether top [OPTIONS]
```

```bash
aether top
```

## aether mcp

运行一个 MCP 服务器，把 `aether` 的能力作为工具公开。服务器通过 stdio 使用 MCP JSON-RPC 通信；全局 `--json` 标志不会改变它的输出。

```
Usage: aether mcp [OPTIONS]
```

| 标志 | 说明 |
|------|-------------|
| `--allow-write` | 在始终注册的 23 个只读工具之外，再加入 22 个受治理的写入工具。它只是注册门禁；每次调用仍然需要 `confirmed: true` |

```bash
aether mcp --allow-write
```

这 22 个写入工具是：通道 CRUD/生命周期（`channels_create`、`channels_update`、`channels_delete`、`channels_enable`、`channels_disable`、`channels_reconcile`）；`models_instances_action`、`rules_execute`；规则 CRUD 和生命周期（`rules_create`、`rules_update`、`rules_delete`、`rules_enable`、`rules_disable`）；告警规则 CRUD 和生命周期（`alarms_rule_create`、`alarms_rule_update`、`alarms_rule_delete`、`alarms_rule_enable`、`alarms_rule_disable`）；手动解除告警（`alarms_resolve`）；以及动作路由治理（`routing_action_upsert`、`routing_action_delete`、`routing_action_set_enabled`）。因此，启用写入后的目录总共有 45 个工具。

MCP 桥接读取 `AETHER_ACCESS_TOKEN`，把它作为 `Authorization: Bearer` 凭据发送，并为每个受治理的 HTTP 请求生成一个 `X-Request-ID`。请保留返回的 `request_id`/`command_id` 值；在超时之后，或者收到不完整的审计或发布响应之后，不要自动重试写入，应先检查状态和审计记录。通道变更的成功结果可能包含降级的运行时投影；请使用其中的 `request_id`、`resulting_revision` 和 `reconciliation_required`，而不是重试。

连接 MCP 客户端的方法见[连接 AI 助手](/zh/guides/ai-assistants)。

## 退出代码和 JSON 模式

`aether` 0.4.0 的实测行为：

- **退出代码 0** — 操作成功。
- **退出代码 1** — 操作失败（例如目标服务不可达）。在普通模式下，错误以 `Error: <message>` 的形式打印。
- **退出代码 2** — 命令行用法错误（未知的子命令或标志）；clap 会把错误和用法提示打印到标准错误。

使用 `--json` 时，结果以单个信封写入标准输出，诊断信息写入标准错误：

```json
{ "success": true, "data": { "...": "..." } }
```

失败时，信封改为携带错误消息，进程以代码 1 退出：

```json
{ "success": false, "error": "error sending request for url (...): tcp connect error: Connection refused" }
```

`--json` 还会抑制横幅和彩色输出，因此它是脚本和 AI 智能体的推荐模式。如上所述，`mcp` 命令会忽略它。

## 相关页面

- [入门](/zh/guides/getting-started) — 构建、初始化并启动 Aether
- [连接 AI 助手](/zh/guides/ai-assistants) — 通过 AI 智能体驱动 CLI 和 MCP 服务器
- [系统架构](/zh/concepts/architecture) — 这些命令所管理的服务
