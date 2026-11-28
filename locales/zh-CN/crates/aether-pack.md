---
title: "aether-pack"
description: "为 Aether 边缘内核加载版本化、与行业无关的领域包清单"
updated: 2026-07-26
---

# aether-pack

为 Aether 边缘内核加载版本化、与行业无关的领域包清单。此 crate 校验领域包自身的发布身份、分发身份、兼容的 Aether 版本范围、所需的能力 ID 和协议 ID、明确标注为未投运的示例，以及被限制在包根目录内的资产目录。

加载是只读的。它不会安装领域包、启用通道或规则，也不会投运现场硬件。不受支持或未知的清单字段、缺失的必需项，以及绝对路径、穿越 `..` 的路径或解析到包根目录之外的路径，都会以带类型的错误失败。

```rust
use aether_pack::{PackRuntime, load_pack_manifest};

# fn inspect() -> Result<(), aether_pack::PackError> {
let runtime = PackRuntime::new("0.5.0")
    .with_capabilities(["device.read_point"])
    .with_protocols(["modbus_tcp"]);
let manifest = load_pack_manifest("packs/example", &runtime)?;
println!("{} {}", manifest.id(), manifest.version());
# Ok(())
# }
```

## 当前领域包配置

自动化服务和 `aether mcp` 使用同一个共享入口：`<AETHER_CONFIG_PATH>/global.yaml`。安全的默认配置不激活任何领域包：

```yaml
packs: []
```

操作员通过同时声明预期身份和根目录来激活一个已安装的 Pack。根目录可以是绝对路径，也可以相对于配置目录，但不能包含 `..`：

```yaml
packs:
  - id: energy
    root: /opt/aether/packs/energy
```

配置的身份必须与 `pack.yaml` 一致。每个被选中的清单都要先通过 Aether 兼容性、能力、协议、投运和资产限制校验，其模型或知识才会可见。

`ProductLibrary` 只从已校验的 Pack 模型目录和显式选定的站点覆盖目录加载产品 JSON。它会拒绝符号链接、非常规文件或超大文件、路径逃逸、格式错误的 JSON 以及重复的产品身份，并返回带类型的 `ProductLibraryError` 值。内核中不内嵌任何产品目录。

Pack 自有的 `mappings`、`rules`、`evaluations` 和 `data_processing` 任务是正式的带索引资产类别。每个目录都包含使用 `aether.pack.asset-index.v1` 的 `index.yaml`；清单中的能力 ID、索引 ID 和实际的常规文件必须完全一致。未知字段/文件、重复的 ID 或路径、符号链接、路径逃逸、媒体类型/结构定义不匹配以及超大文件都会失败关闭。Pack v1 把每个类别固定到对应的 v1 载荷结构定义；更改载荷契约需要更改 Pack 契约版本。只有显式激活的 Pack 才会贡献带命名空间的 `<pack>/<category>/<asset>` 身份。

机器可读的契约是 [`Pack manifest v1`](https://github.com/EvanL1/AetherEdge/blob/main/contracts/pack/pack-manifest.v1.schema.json) 和 [`Pack asset index v1`](https://github.com/EvanL1/AetherEdge/blob/main/contracts/pack/pack-asset-index.v1.schema.json) 结构定义。

采用 MIT 或 Apache-2.0 双许可证，可任选其一。
