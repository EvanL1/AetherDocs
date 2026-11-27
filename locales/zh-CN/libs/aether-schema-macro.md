---
title: "aether-schema-macro"
description: "根据 Rust 结构体定义自动生成 SQL DDL。"
updated: 2026-07-11
---

# aether-schema-macro

根据 Rust 结构体定义自动生成 SQL DDL。

## 概述

这个过程宏 crate 根据 Rust 结构体定义自动生成 CREATE TABLE 语句，免去了手工维护 SQL 表结构常量的工作。

## 功能

- ✅ **自动类型映射**：Rust 类型 → SQLite 类型
- ✅ **完整的约束支持**：PRIMARY KEY、UNIQUE、NOT NULL、DEFAULT
- ✅ **外键**：带 CASCADE 动作的 REFERENCES
- ✅ **可选字段**：`Option<T>` → 可为空的列
- ✅ **跳过字段**：排除仅在运行时使用的字段
- ✅ **扁平化支持**：跳过嵌套结构体字段

## 快速开始

```rust
use aether_schema_macro::Schema;

#[derive(Schema)]
#[table(name = "channels")]
pub struct ChannelRecord {
    #[column(primary_key)]
    pub channel_id: u16,

    #[column(unique, not_null)]
    pub name: String,

    #[column(default = "modbus_tcp")]
    pub protocol: String,

    #[column(default = "true")]
    pub enabled: bool,
}

// Generated constants:
println!("{}", ChannelRecord::CREATE_TABLE_SQL);
println!("Table: {}", ChannelRecord::TABLE_NAME);
println!("Columns: {:?}", ChannelRecord::COLUMNS);
```

生成的 SQL：
```sql
CREATE TABLE IF NOT EXISTS channels (
    channel_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    protocol TEXT NOT NULL DEFAULT 'modbus_tcp',
    enabled BOOLEAN NOT NULL DEFAULT TRUE
)
```

## 属性

### 表级

| 属性 | 默认值 | 说明 |
|-----------|---------|-------------|
| `#[table(name = "...")]` | 结构体名称 | 覆盖表名 |
| `#[table(if_not_exists = false)]` | `true` | 禁用 IF NOT EXISTS |
| `#[table(suffix = "...")]` | - | 自定义 SQL 后缀 |

### 列级

| 属性 | 说明 |
|-----------|-------------|
| `#[column(primary_key)]` | PRIMARY KEY 约束 |
| `#[column(autoincrement)]` | AUTOINCREMENT（仅限 INTEGER PRIMARY KEY） |
| `#[column(unique)]` | UNIQUE 约束 |
| `#[column(not_null)]` | NOT NULL 约束 |
| `#[column(default = "...")]` | DEFAULT 值 |
| `#[column(references = "table(column)")]` | 外键 |
| `#[column(on_delete = "CASCADE")]` | 外键的 DELETE 动作 |
| `#[column(on_update = "CASCADE")]` | 外键的 UPDATE 动作 |
| `#[column(skip)]` | 跳过该字段 |
| `#[column(flatten)]` | 跳过被扁平化的字段 |

## 类型映射

| Rust 类型 | SQLite 类型 |
|-----------|-------------|
| `u8, u16, u32, i8, i16, i32, i64, usize, isize` | INTEGER |
| `f32, f64` | REAL |
| `String, &str` | TEXT |
| `bool` | BOOLEAN |
| `DateTime, NaiveDateTime` | TIMESTAMP |
| `Date, NaiveDate` | DATE |
| `serde_json::Value, HashMap, BTreeMap` | TEXT（JSON） |
| `Vec<u8>` | BLOB |
| `Option<T>` | 可为空的列 |

## 示例

### 外键

```rust
#[derive(Schema)]
#[table(name = "measurement_routing")]
pub struct MeasurementRouting {
    #[column(primary_key, autoincrement)]
    pub routing_id: i64,

    #[column(
        not_null,
        references = "instances(instance_id)",
        on_delete = "CASCADE"
    )]
    pub instance_id: u16,

    #[column(
        not_null,
        references = "channels(channel_id)",
        on_delete = "CASCADE"
    )]
    pub channel_id: u16,
}
```

### 可选字段

```rust
#[derive(Schema)]
pub struct Device {
    #[column(primary_key)]
    pub device_id: u16,

    pub name: String,           // NOT NULL (required)
    pub description: Option<String>,  // Nullable (optional)
}
```

### 跳过字段

```rust
#[derive(Schema)]
pub struct Config {
    #[column(primary_key)]
    pub id: u16,

    pub name: String,

    #[column(skip)]
    pub runtime_cache: HashMap<String, String>,  // Not in database
}
```

### 配合扁平化使用

运行时结构体使用 `#[serde(flatten)]` 时，需要手工声明数据库字段：

```rust
// Shared core structure
struct ChannelCore {
    id: u16,
    name: String,
    enabled: bool,
}

// Database schema (manually expanded)
#[derive(Schema)]
#[table(name = "channels")]
struct ChannelRecord {
    #[column(primary_key)]
    pub id: u16,

    #[column(not_null)]
    pub name: String,

    #[column(default = "true")]
    pub enabled: bool,

    pub protocol: String,
}

// Runtime config (with flatten)
struct ChannelConfig {
    #[serde(flatten)]
    core: ChannelCore,
    protocol: String,
}
```

## 默认值规则

- **SQL 函数**：不加引号（`CURRENT_TIMESTAMP`、`CURRENT_DATE`）
- **布尔值**：`"true"` → `TRUE`，`"false"` → `FALSE`
- **数字**：不加引号（`"42"` → `42`，`"3.14"` → `3.14`）
- **字符串**：加单引号并转义（`"hello"` → `'hello'`，`"it's"` → `'it''s'`）

## 生成的常量

```rust
#[derive(Schema)]
pub struct MyTable { /* ... */ }

// Available constants:
MyTable::CREATE_TABLE_SQL  // &'static str - Full DDL
MyTable::TABLE_NAME        // &'static str - Table name
MyTable::COLUMNS           // &'static [&'static str] - Column names
```

## 限制

1. **扁平化字段**：`#[column(flatten)]` 把字段标记为跳过。要包含嵌套字段，需要在父结构体中手工声明它们。
2. **过程宏的约束**：编译期无法访问其他 crate 中的类型定义。
3. **以 SQLite 为主**：类型映射针对 SQLite 优化（可以扩展到其他数据库）。

## 测试

```bash
# Run unit tests
cargo test -p aether-schema-macro --lib

# Run integration tests
cargo test -p aether-schema-macro --test integration

# Run all tests
cargo test -p aether-schema-macro
```

## 许可证

属于 AetherEMS 项目的一部分。
