---
title: "Aether HTTP 数据处理器"
description: "DataProcessor 端口的可选、有界的 HTTP 实现。"
updated: 2026-07-27
---

# Aether HTTP 数据处理器

`DataProcessor` 端口的可选、有界的 HTTP 实现。它把完整的请求帧发送到 `/v1/process`；不暴露任何回调 Aether、SHM、历史或配置的途径。

只有位于 localhost 或环回地址上的本地处理器才接受明文 HTTP。远程路由要求使用 HTTPS。请求与响应的大小以及连接超时和请求超时都是必填配置。

## 组合

```rust
use std::time::Duration;

use aether_http_data_processor::{
    BearerSecret, HttpDataProcessor, HttpDataProcessorConfig,
};
use aether_ports::{DataBoundary, DataProcessorDescriptor};

# fn build(
#     descriptor: DataProcessorDescriptor,
#     deployment_token: String,
# ) -> Result<HttpDataProcessor, aether_ports::PortError> {
let config = HttpDataProcessorConfig::new(
    "https://processor.example.net",
    descriptor,
    Duration::from_secs(2),
    Duration::from_secs(10),
    4 * 1024 * 1024,
)?
.with_bearer_secret(BearerSecret::new(deployment_token)?);
let processor = HttpDataProcessor::new(config)?;
# assert_eq!(processor.descriptor().data_boundary(), DataBoundary::Remote);
# Ok(processor)
# }
```

只有组合根可以选择源站和可选的密钥。适配器由此派生出固定的带版本路由：

- `POST /v1/process`
- `GET /v1/health`

请求和成功的处理响应使用 `application/vnd.aether.data-processing+json;version=1`。健康检查接受一个包含 `status`、`processor`、`version` 和 `contract` 的小型 JSON 响应，并根据配置的描述符校验这些身份字段。

## 硬性边界

- 请求 JSON 由 `aether-data-processing` 编码，并在发起任何网络调用之前按描述符的 `max_frame_samples` 和 `max_request_bytes` 进行检查。
- 响应在流式读取过程中受到大小限制。`Content-Length` 只是提前拦截的手段，不是上限的判定依据。
- 重定向和环境代理发现均被禁用。
- 远程路由要求使用 HTTPS。本地 HTTP 要求显式的 `Local` 描述符，以及环回或 `localhost` 源站。
- URL 中的凭据、查询字符串、片段、源站以外的路径、为零的上限和为零的超时，都会使配置以 `Permanent` 失败。
- Bearer 令牌没有从环境加载的 API，在 HTTP 头中被标记为敏感，并且在适配器的所有 `Debug` 输出中都被脱敏。
- 远程响应体、URL 和传输层内部信息绝不会被复制到端口错误中。

每个 4xx 或 5xx 响应都必须使用同一个带版本的媒体类型和封闭的 `aether.data-processing.error.v1` 信封。响应体在解码之前先受到大小限制。未知字段、显式的 null、格式错误的 JSON、HTTP 状态与类别不匹配、请求 ID 无效或不匹配，以及重试元数据不一致，都会以 `InvalidData` 失败关闭。

经过校验的失败会映射到稳定的 `PortErrorKind` 值：截止时间错误映射为 `Timeout`，经过校验的 HTTP 冲突响应映射为 `Conflict`，可重试的容量不足/不可用映射为 `Unavailable`，无效帧映射为 `InvalidData`，请求/资源被拒绝映射为 `Rejected`，不可重试的授权、查找、内部或不可用失败映射为 `Permanent`。只有经过校验的稳定代码、类别、可重试性、重试延迟和请求 ID 会进入端口诊断信息；处理器的自由格式消息和详情绝不会被复制。带有 `status: unavailable` 的响应仍然是有效的 `ProcessingResult`，而不是传输错误。

`Conflict` 映射并不产生请求重放语义。公开的 `data_processing.process` 操作是非幂等的，没有内置的去重，也不保证请求 ID 可以复用。

## 验证

```bash
cargo test -p aether-http-data-processor
cargo clippy -p aether-http-data-processor --all-targets -- -D warnings
cargo fmt --package aether-http-data-processor -- --check
```
