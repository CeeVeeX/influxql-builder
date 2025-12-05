# InfluxQL / InfluxDB 3 SQL 查询构造器（Knex 风格）

## 概览

这是一个用于构建 **InfluxQL**（InfluxDB 1.x）以及 **InfluxDB 3 SQL** 查询的 **链式/Knex 风格查询构造器**。  
目标是用代码表达 SQL 查询，而不是手写字符串，支持 **类型安全、参数化、函数表达式、JOIN、子查询** 等。

**核心特点：**

- 全套 InfluxQL 函数：`MEAN`、`SUM`、`MIN`、`MAX`、`MEDIAN`、`MODE`、`COUNT`、`DERIVATIVE` 等  
- 参数化查询（自动生成 `$1, $2, ...`）  
- 类型化 `select` 泛型提示  
- Knex 风格顶层 API (`influx()`)  
- 支持 `JOIN`（INNER/LEFT/RIGHT/FULL）  
- 输出 SQL 字符串 + 参数字典  
- 支持子查询、嵌套查询  
- 支持 `WHERE`、`GROUP BY`、`ORDER BY`、`LIMIT`、`OFFSET`、`SLIMIT`、`SOFFSET`  
- 内置时间工具：`Time.nowMinus`、`Time.between`

---

## 安装

```bash
# npm
npm install influxql-builder

# yarn
yarn add influxql-builder
```

---

## 快速使用

```ts
import { F, influx, field } from 'influxql-builder'

const db = influx()

// 基本 SELECT
const query = db.select()
  .select(field('usage'), F.mean('value'))
  .from('cpu')
  .where(w => w.andEq('host', 'server1').andGt('value', 0))
  .groupBy(g => g.time('1m').by('host'))
  .orderBy(o => o.by('time', 'DESC'))
  .limit(100)
  .toSQL()

console.log(query.sql)    // 输出 SQL
console.log(query.params) // 输出参数对象 { $1: 'server1', $2: 0 }
```

---

## API

### 顶层工厂 `influx()`

```ts
const db = influx()
db.select()   // 返回 SelectBuilder
db.show()     // 返回 ShowBuilder
db.raw('NOW()') // 返回 Raw
db.params    // Params 实例
```

---

### SELECT 构造器 `SelectBuilder`

* `select(...fields)`：选择字段，可为字符串或 `Expr`
* `from(table)`：表名或子查询
* `where(cb)`：条件构造器
* `groupBy(cb)`：分组构造器
* `orderBy(cb)`：排序构造器
* `limit(n)` / `offset(n)` / `slimit(n)` / `soffset(n)`：限制条数与分页
* `join(type, table, on)` / `innerJoin` / `leftJoin` / `rightJoin` / `fullJoin`
* `as(alias)`：子查询别名，返回 Raw

```ts
const sub = db.select().select('id').from('user').where(w => w.andGt('age', 18))
const main = db.select()
  .select('*')
  .from(sub.as('adult_users'))
```

---

### WHERE 构造器 `WhereBuilder`

* `.between(key, [a, b])`：区间条件
* `.notBetween(key, [a, b])`：不符合区间条件
* `.andEq(key, value)`：key = value
* `.andNeq(key, value)`：key != value
* `.andGt / andGte / andLt / andLte`：比较运算
* `.andRegex / andNotRegex`：正则匹配
* `.and(cond)` / `.or(cond)` / `.raw(cond)`：原生条件
* `.isEmpty()` / `.toString()`：判断空或生成 SQL 字符串

---

### GROUP BY 构造器 `GroupByBuilder`

* `.by(...fields)`：按字段分组
* `.time(interval)`：时间间隔分组
* `.fill(value)`：填充值（0、NULL 或自定义数值）

---

### ORDER BY 构造器 `OrderByBuilder`

* `.by(field | Expr, dir?)`：排序字段，可指定 `'ASC'` 或 `'DESC'`

---

### SHOW 构造器 `ShowBuilder`

```ts
db.show()
  .set('MEASUREMENTS')
  .in('cpu')
  .where(w => w.andEq('region', 'sh'))
  .toSQL()
```

支持 SHOW 系列：

* `MEASUREMENTS` / `SERIES` / `TAG KEYS` / `TAG VALUES` / `FIELDS` / `RETENTION POLICIES` / `DATABASES`

---

### InfluxQL 函数 `F`

```ts
F.mean('value')
F.sum(field('usage'))
F.derivative('value', '1m')
F.percentile('latency', 95)
```

自动转换字段为 Expr，方便链式调用。

---

### 子查询辅助

```ts
const sub = subquery(s => s.select('id').from('user').where(w => w.andGt('age', 18)))
db.select().from(sub).toSQL()
```

---

### 时间工具 `Time`

```ts
Time.nowMinus('1h')           // now() - INTERVAL '1h'
```

---

### 参数化查询

```ts
const db = influx()
const sqlObj = db.select()
  .select('value')
  .from('cpu')
  .where(w => w.andEq('host', 'server1').andGt('value', 0))
  .toSQL()

console.log(sqlObj.sql)    // SELECT "value" FROM "cpu" WHERE "host" = $1 AND "value" > $2
console.log(sqlObj.params) // { $1: 'server1', $2: 0 }
```

---

## 示例：完整查询

```ts
const db = influx()

const sql = db.select()
  .select(F.mean('value'), field('host'))
  .from('cpu')
  .leftJoin('memory', 'cpu.host = memory.host')
  .where(w => w.andGt('value', 10).andRegex('host', /^server/))
  .groupBy(g => g.time('5m').by('host'))
  .orderBy(o => o.by('time', 'DESC'))
  .limit(50)
  .toSQL()

console.log(sql.sql)
console.log(sql.params)
```

---

## 默认导出

```ts
import influxBuilder from 'your-influxql-builder'

const db = influxBuilder.influx()
const query = db.select().from('cpu')
```

---

## 注意事项

1. 所有字段会自动引用（非字母数字字段加双引号）
2. 参数化查询可防止 SQL 注入
3. JOIN 仅适用于 InfluxDB 3 SQL，不适用于 InfluxQL 1.x
4. `subquery()` 和 `as()` 用于子查询或 JOIN 别名
5. `Time.nowMinus` 与 `Time.between` 简化时间区间构造

---

## License

MIT
