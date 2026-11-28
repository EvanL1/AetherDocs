---
title: "编写规则"
description: "通过 HTTP API 或下游产品控制台编写规则"
updated: 2026-07-22
---

# 编写规则

规则是 Aether 的控制逻辑：读取测量点位（M）、评估条件并写入动作点位（A）的流程。它们在 automation（端口 6002）内部执行，通过应用 API 编写，可以直接调用，也可以借助下游产品控制台。本指南介绍编写规则的具体做法；引擎如何调度和执行规则见[规则引擎](/zh/concepts/rule-engine)，一个完整的控制策略示例见[控制策略](https://github.com/EvanL1/AetherEdge/blob/main/docs/domain/control-strategies.md)。

## 规则的组成

SQLite `rules` 表中的一行规则包含：

- **`id`** — 自动分配的整数；从不由你选择。
- **`name`** 和 **`description`** — 供人阅读。
- **`enabled`** — 新规则一开始是禁用的；调度器会完全跳过禁用的规则。
- **`priority`** — 多条规则同时到期时决定评估顺序；优先级如何与互斥条件配合，在写入同一执行机构的规则之间进行仲裁，见[控制策略](https://github.com/EvanL1/AetherEdge/blob/main/docs/domain/control-strategies.md)。
- **`cooldown_ms`** — 一次成功且至少执行了一个动作的执行之后的最小间隔，在它结束之前抑制再次执行。
- **`trigger_config`** — 规则何时运行。有两种变体，由 `"type"` 区分：
  - `{"type": "interval", "interval_ms": 1000}` — 在调度器节拍上周期性评估。没有 `trigger_config` 的规则默认使用 1000 ms 的间隔（如果设置了 `cooldown_ms`，则以它作为周期）。
  - `{"type": "on_change", "point_refs": [{"instance": 1, "point_type": "measurement", "point": 0}], "time_deadband_ms": 200, "value_deadband": null}` — 订阅的点位发生变化时进行事件驱动的评估，由时间死区（两次触发之间的最小间隔）和可选的值死区（绝对变化量或百分比变化阈值）过滤。
- **流程** — 逻辑本身：起始节点经由条件分支扇出到写入点位的节点，最后到达结束节点。每个节点都带有一个 `type`，这里只接受三个值：`start`、`end`、`custom`，除此之外别无其他。执行实际工作的节点始终是 `"type": "custom"`，工作的种类由 `data.type` 指定：

  | `data.type` | 作用 |
  |-------------|------|
  | `function-switch` | 评估条件分支并选择一条输出连线 |
  | `action-changeValue` | 向点位写入值 |
  | `action-calculation` | 把一个 `evalexpr` 公式的计算结果存入变量 |
  | `action-periodDelta` | 跟踪累计值在一个周期内的变化 |

  每个节点的负载都位于 `data.config` 之下。点位通过 `{"name": "X1", "instance": 1, "pointType": "measurement", "point_id": 0}` 指定，其中 `pointType` 为 `measurement` 或 `action`。

流程会存储两份：`flow_json` 是完整的可视化编辑器文档，`nodes_json` 是引擎执行的紧凑拓扑，这两列始终由同一个函数从编辑器文档一起派生。原因见[规则引擎](/zh/concepts/rule-engine)。

## 通过下游应用

独立的 [AetherEMS](https://github.com/EvanL1/AetherEMS) Console 是一个可选的能源领域参考应用，带有 Vue Flow 规则编辑器。它编辑完整的可视化文档（带画布位置和标签的节点、边以及视口），并通过同一套经过认证的规则命令 API 提交该文档。AetherEdge 不捆绑 Console，也不授予它直接访问 SQLite/SHM 的权限。服务器会一起派生两种存储表示，因此 `flow_json` 和执行拓扑不会出现偏差（该不变量见[规则引擎](/zh/concepts/rule-engine)）。

## 通过 HTTP API

automation 提供规则 API（`services/automation/src/api/rule_routes.rs`）；应用通过经过认证的网关在 `/api/v1/automation` 之下访问它。位于 `http://<edge-host>:6005/docs` 的网关 Swagger 选择器提供 Automation OpenAPI 文档；环回上的源仍然是 `http://127.0.0.1:6002/openapi.json`，供主机本地的契约工具使用。下面的每一项变更都只接受持 Bearer 凭据的 Admin/Engineer 操作者，需要 `confirmed: true` 以及网关的 `x-aether-confirmed: true` 请求头，并在修改 SQLite 或重新加载调度器之前写入强制审计记录。

| 方法 | 路径 | 用途 |
|--------|------|---------|
| GET | `/api/rules` | 分页列表（摘要字段：id、name、enabled、description） |
| POST | `/api/rules` | 创建只有元数据的占位记录 |
| GET | `/api/rules/{id}` | 完整规则，包括两个流程列 |
| PUT | `/api/rules/{id}` | 部分更新；流程和触发器通过它写入 |
| DELETE | `/api/rules/{id}` | 删除规则 |
| POST | `/api/rules/{id}/enable` | 设为启用 |
| POST | `/api/rules/{id}/disable` | 设为禁用 |
| POST | `/api/rules/{id}/execute` | 立即执行（真实执行，见下文） |
| GET | `/api/rules/{id}/variables` | 规则读取的变量，用于监控 |
| GET | `/api/scheduler/status` | 调度器运行标志、规则数量、节拍间隔 |
| POST | `/api/scheduler/reload` | 强制从 SQLite 重新读取所有规则 |

创建规则实际上**分两步**：`POST /api/rules` 只接受名称和描述，并插入一条占位记录：空的 `{}` 拓扑、没有编辑器文档、处于禁用状态。流程内容只能通过 `PUT /api/rules/{id}` 写入：

```bash
# 1. Create the stub; the response carries the assigned id
curl -X POST http://localhost:6005/api/v1/automation/api/rules \
  -H "Authorization: Bearer $AETHER_ACCESS_TOKEN" \
  -H 'x-aether-confirmed: true' \
  -H 'Content-Type: application/json' \
  -d '{"name": "Battery SOC Protection", "description": "Protect battery when SOC is too low", "confirmed": true}'
# → {"success": true, "data": {"id": 3, "name": "Battery SOC Protection", "status": "created"}}

# 2. Write the flow and trigger
curl -X PUT http://localhost:6005/api/v1/automation/api/rules/3 \
  -H "Authorization: Bearer $AETHER_ACCESS_TOKEN" \
  -H 'x-aether-confirmed: true' \
  -H 'Content-Type: application/json' \
  -d @rule.json

# 3. Enable it
curl -X POST http://localhost:6005/api/v1/automation/api/rules/3/enable \
  -H "Authorization: Bearer $AETHER_ACCESS_TOKEN" \
  -H 'x-aether-confirmed: true' \
  -H 'Content-Type: application/json' \
  -d '{"confirmed": true}'
```

其中 `rule.json` 提供编辑器文档和触发器：

```json
{
  "flow_json": {
    "nodes": [
      {"id": "start", "type": "start", "position": {"x": 0, "y": 0},
       "data": {"config": {"wires": {"default": ["end"]}}}},
      {"id": "end", "type": "end", "position": {"x": 100, "y": 0}}
    ],
    "edges": []
  },
  "trigger_config": {"type": "interval", "interval_ms": 1000},
  "confirmed": true
}
```

这个流程是最小的有效文档：它什么也不做。真正有动作的流程会读取一个点位、根据它进行分支，再写入另一个点位。下面这个流程在功率超过 400 kW 时让断路器跳闸：

```json
{
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "data": { "config": { "wires": { "default": ["check_power"] } } }
    },
    {
      "id": "check_power",
      "type": "custom",
      "data": {
        "type": "function-switch",
        "config": {
          "variables": [
            { "name": "X1", "instance": 1, "pointType": "measurement", "point_id": 0 }
          ],
          "rule": [
            {
              "name": "out001",
              "type": "default",
              "rule": [
                { "type": "variable", "variables": "X1", "operator": ">", "value": 400 }
              ]
            }
          ],
          "wires": { "out001": ["open_breaker"] }
        }
      }
    },
    {
      "id": "open_breaker",
      "type": "custom",
      "data": {
        "type": "action-changeValue",
        "config": {
          "variables": [
            { "name": "Y1", "instance": 2, "pointType": "action", "point_id": 10 }
          ],
          "rule": [ { "Variables": "Y1", "value": 0 } ],
          "wires": { "default": ["end"] }
        }
      }
    },
    { "id": "end", "type": "end" }
  ],
  "edges": []
}
```

Switch 分支为自己的输出连线命名（上例中的 `out001`）并列出条件；`wires` 再把这个名称映射到它所连接的节点。`action-changeValue` 的赋值通过 `Variables` 指定目标，首字母大写是线上格式的一部分。这个示例由一项测试对照解析器进行约束，因此不会偏离服务实际接受的格式。

格式错误的流程会让 PUT 整体失败，不会存储任何内容；格式错误的 `trigger_config` 也会在同一边界被拒绝。如果节点的 `type` 或 `data.type` 不属于上面列出的值，这就是一个格式错误的流程：解析会失败并指出出问题的节点，而不是把它丢弃、留下一条能正常存储却什么也不做的规则。

`aether` CLI 封装了相同的端点。设置 `AETHER_ACCESS_TOKEN`，并向 `rules create`、`update`、`enable`、`disable` 和 `delete` 传入 `--confirmed`；`delete --force` 只是跳过交互式提示。`rules list` 仍然是只读的。

## 测试规则

**没有试运行**。`POST /api/rules/{id}/execute`，以及同样的 `rules_execute` MCP 工具和 `aether rules execute <id> --confirmed`，都会通过经过认证、确认和审计的应用命令进行一次真实的执行：流程针对实时值进行评估，任何被触发的动作都会提交到本地命令平面。命令被接受并不能证明物理设备已经执行该命令或达到了目标值。

要进行不依赖硬件的测试，把协议模拟器作为设备边界运行，而不是给生产 IO 进程添加仿真适配器：

1. 用一个确定性的 Modbus 场景启动 `tools/simulator`，然后创建一个默认禁用的 Modbus 通道，其中包含规则将要写入的控制和调节点位。只为这次隔离测试投运它，并把一个临时实例的动作点位路由到它（见[连接设备](/zh/guides/connect-devices)）。
2. 把规则的动作指向这个临时实例并执行：

   ```bash
   AETHER_ACCESS_TOKEN='<signed access JWT>' \
     aether rules execute 3 --confirmed
   ```

3. 检查结果。命令响应会报告 `actions_attempted` 和 `actions_succeeded`，其中成功表示本地命令平面已接受。回读相应的测量值以验证物理行为。详细的执行路径和动作结果仍然持久化在本地 SQLite 的 `rule_history` 中，供 API 和 WebSocket 读取方使用。

4. 分支选择和写入的值都确认无误之后，把规则的动作重新指向生产实例并启用它。

## 重新加载

通常你根本不用考虑重新加载：全部五个规则 CRUD 端点（创建、更新、删除、启用、禁用）都会在写入数据库后触发调度器重新加载，因此通过 API 或编辑器所做的更改会立即生效，无需重启服务。

显式的 `POST /api/scheduler/reload` 是为带外写入准备的：批量导入，或者 `aether sync` 绕过调度器把规则文件推入 SQLite。在这样的写入之后，调用一次该端点，调度器就会重新读取每一条已启用的规则，并原子地重建其 on-change 订阅。`GET /api/scheduler/status` 用来确认结果：`running`、规则总数和已启用规则数，以及节拍间隔。

## 相关页面

- [规则引擎](/zh/concepts/rule-engine) — 双列存储、调度、执行、热重载
- [把控制策略表达为规则](https://github.com/EvanL1/AetherEdge/blob/main/docs/domain/control-strategies.md) — 把 SOC 管理和削峰表达为流程
- [连接设备](/zh/guides/connect-devices) — 通道、协议模拟器、点位映射
