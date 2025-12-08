// ============================================================================
// 功能总览（高层描述）
// ----------------------------------------------------------------------------
// 这是一个用于构建 InfluxQL（InfluxDB 1.x）和 InfluxDB 3 SQL 查询的
// 「链式 / Knex 风格」查询构造器，主要功能包括：
//
// ✔️ 全套 InfluxQL 函数（mean/sum/diff/rate/percentile/...）
// ✔️ 安全的参数化查询（自动生成 $1, $2...）
// ✔️ 类型友好的 select 泛型增强（逐渐累积字段类型）
// ✔️ 完整的 SELECT、WHERE、ORDER、GROUP BY DSL
// ✔️ 支持子查询与嵌套 select
// ✔️ InfluxDB 3 SQL JOIN（INNER/LEFT/RIGHT/FULL）
// ✔️ 输出 SQL 字符串 + 参数字典
// ✔️ “knex() 风格”顶层 API：influx()
//
// 目标：让用户以“写代码”的方式表达查询，而不是写硬编码字符串。
// ============================================================================

/* -------------------------------------------------------------------------- */
/*                           基础类型与工具函数（基础层）                      */
/* -------------------------------------------------------------------------- */

/**
 * Raw 类型：用于标记“原生 SQL 片段”，即不进行转义或加工。
 * 例如用于插入函数、表达式、子查询、interval、now() 等。
 */
export interface Raw {
  raw: string
}

/**
 * 工具函数：构造一个 Raw，表示“原样拼接到 SQL 中”。
 */
export function raw(s: string): Raw {
  return { raw: s }
}

/**
 * 参数化查询允许的值：
 * - number, string, boolean, Date, null, Raw
 * Raw 用于绕过参数化（直接写 SQL）
 */
export type ParamValue = number | string | boolean | Date | null | Raw

/**
 * 参数收集器：
 * 用于替换查询中的值，将其转换为位置参数：
 *   $1, $2, $3 ...
 *
 * - `.next(value)`：返回 "$n"，记录实际参数
 * - `.getValues()`：返回参数对象 { $1: v1, $2: v2, ... }
 *
 * 这样可以避免 SQL 注入，同时让语句可复用、可预编译。
 */
export class Params {
  private index = 1
  private values: Record<string, any> = {}

  /** 添加一个参数并返回占位符，例如 "$3" */
  next(value: any): string {
    const key = `$${this.index++}`
    this.values[key] = value
    return key
  }

  /** 获取所有参数 */
  getValues() {
    return this.values
  }

  /** 重置，用于新的查询 */
  reset() {
    this.index = 1
    this.values = {}
  }
}

/**
 * 字段/标识符引用：
 * 如果字段中含有非字母数字字符，则自动加双引号：
 *   abc → abc
 *   user-name → "user-name"
 *   "x" → "\"x\""
 */
function quoteIdent(id: string): string {
  if (/\W/.test(id))
    return `\"${id.replace(/"/g, '\\"')}\"`
  return id
}

/**
 * 将 JS 值转换为 SQL 字面量（literal）。
 * 如果传入 params，则使用位置参数模式（$1/$2/...）
 * 否则直接 inline。
 *
 * 主要用于：
 * - WHERE value = ?
 * - 时间区间
 * - 大多数 SQL 字面量
 */
function quoteLiteral(v: any, params?: Params): string {
  if (params)
    return params.next(v) // 参数化模式，用 $n 替换

  // 非参数化模式：直接 inline
  if (v === null)
    return 'NULL'
  if (typeof v === 'number')
    return String(v)
  if (typeof v === 'boolean')
    return v ? 'TRUE' : 'FALSE'
  if (v instanceof Date)
    return `'${v.toISOString()}'`
  if (typeof v === 'string')
    return `'${v.replace(/'/g, '\'\'')}'` // 单引号转义
  if ((v as Raw)?.raw)
    return (v as Raw).raw

  return `'${String(v)}'`
}

/* -------------------------------------------------------------------------- */
/*                             表达式基础类型（表达式层）                      */
/* -------------------------------------------------------------------------- */

/**
 * Expr：所有“可出现在 SELECT/WHERE 中的表达式”的基类。
 * 例如字段、函数、子表达式等。
 */
export class Expr {
  toString(): string { return '' }
}

/**
 * 字段表达式包装器，例如
 *   new FieldExpr("COUNT(value)")
 */
export class FieldExpr extends Expr {
  constructor(private expr: string) { super() }
  toString() { return this.expr }
}

/**
 * 用户调用：
 *   field("usage")  → FieldExpr("usage")
 * 自动进行字段引用，例如：
 *   field("cpu value") → FieldExpr("\"cpu value\"")
 */
export const field = (name: string) => new FieldExpr(quoteIdent(name))

/**
 * 通用函数构造器：
 * fn("SUM", field("value")) → SUM("value")
 */
export function fn(fname: string, ...args: Array<string | Expr | Raw>) {
  const argStr
    = args.map(a =>
      typeof a === 'string'
        ? a
        : (a instanceof Expr ? a.toString() : a.raw),
    ).join(', ')

  return new FieldExpr(`${fname}(${argStr})`)
}

/* -------------------------------------------------------------------------- */
/*                    InfluxQL/InfluxDB SQL 函数集合（高级表达式层）           */
/* -------------------------------------------------------------------------- */

/**
 * 为常用 InfluxQL 函数提供快捷构造器：
 * - F.mean("value")
 * - F.sum(field("x"))
 * - F.percentile("value", 95)
 *
 * 所有函数会自动进行 toExpr/字段引用处理。
 */
export const F = {
  mean: (x: any) => fn('MEAN', toExpr(x)),
  sum: (x: any) => fn('SUM', toExpr(x)),
  min: (x: any) => fn('MIN', toExpr(x)),
  max: (x: any) => fn('MAX', toExpr(x)),
  median: (x: any) => fn('MEDIAN', toExpr(x)),
  mode: (x: any) => fn('MODE', toExpr(x)),
  count: (x: any = '*') => fn('COUNT', x === '*' ? '*' : toExpr(x)),
  distinct: (x: any) => fn('DISTINCT', toExpr(x)),
  derivative: (x: any, interval: string) => fn('DERIVATIVE', toExpr(x), raw(interval)),
  nonNegativeDerivative: (x: any, interval: string) => fn('NON_NEGATIVE_DERIVATIVE', toExpr(x), raw(interval)),
  difference: (x: any) => fn('DIFFERENCE', toExpr(x)),
  rate: (x: any) => fn('RATE', toExpr(x)),
  irate: (x: any) => fn('IRATE', toExpr(x)),
  top: (x: any, n = 1) => fn('TOP', toExpr(x), raw(String(n))),
  bottom: (x: any, n = 1) => fn('BOTTOM', toExpr(x), raw(String(n))),
  percentile: (x: any, p: number) => fn('PERCENTILE', toExpr(x), raw(String(p))),
}

/**
 * 将字符串字段名转换为引用字段，或保持 Expr。
 */
function toExpr(x: string | Expr): string | Expr {
  return typeof x === 'string' ? quoteIdent(x) : x
}

/* -------------------------------------------------------------------------- */
/*                        WHERE 构造器（条件表达式 DSL）                       */
/* -------------------------------------------------------------------------- */

export type Cond = string | Raw
const condToStr = (c: Cond) => (c as Raw)?.raw ?? String(c)

/**
 * WHERE 语句构建器：
 *
 * 支持：
 * - andEq, andGt, andRegex 等多种条件
 * - 原始 SQL 条件
 * - 自动参数化
 *
 * 用户调用示例：
 *   where(w => w.andEq("host", "server1").andGt("value", 0))
 */
export class WhereBuilder {
  constructor(private params?: Params) {}
  parts: string[] = []

  /**
   * 区间条件：
   * between(key, [a, b]) → key >= 'a' AND key <= 'b'
   */
  between(key: string, [from, to]: [Date | string, Date | string]) {
    return this.and(
      `${quoteIdent(key)} >= ${quoteLiteral(from, this.params)} AND ${quoteIdent(key)} <= ${quoteLiteral(to, this.params)}`,
    )
  }

  /**
   * 不符合区间条件：
   * notBetween(key, [a, b]) → key < 'a' OR key > 'b'
   */
  notBetween(key: string, range: [ Date | string, Date | string]) {
    const [from, to] = range
    return this.or(
      `${quoteIdent(key)} < ${quoteLiteral(from, this.params)} OR ${quoteIdent(key)} > ${quoteLiteral(to, this.params)}`,
    )
  }

  /** 追加 AND 条件：WHERE (...) AND (...) */
  and(cond: string | Raw) {
    this.parts.push(`(${condToStr(cond)})`)
    return this
  }

  /**
   * 追加 OR 条件（将“前一条 AND 条件”包装为 OR 表达）
   *
   * 实现为：
   *   A AND B
   *   .or(C)
   * → (A AND (B OR C))
   */
  or(cond: string | Raw) {
    const last = this.parts.pop()
    if (last)
      this.parts.push(`(${last} OR (${condToStr(cond)}))`)
    else
      this.parts.push(`(${condToStr(cond)})`)
    return this
  }

  /** key = value */
  andEq(key: string, val: ParamValue) {
    return this.and(`${quoteIdent(key)} = ${quoteLiteral(val, this.params)}`)
  }

  /** key != value */
  andNeq(key: string, val: ParamValue) {
    return this.and(`${quoteIdent(key)} != ${quoteLiteral(val, this.params)}`)
  }

  /** key =~ /regex/ */
  andRegex(key: string, regex: RegExp) {
    return this.and(`${quoteIdent(key)} =~ ${quoteLiteral(regex.source, this.params)}`)
  }

  /** key !~ /regex/ */
  andNotRegex(key: string, regex: RegExp) {
    return this.and(`${quoteIdent(key)} !~ ${quoteLiteral(regex.source, this.params)}`)
  }

  /** key > value */
  andGt(key: string, val: ParamValue) {
    return this.and(`${quoteIdent(key)} > ${quoteLiteral(val, this.params)}`)
  }

  /** key >= value */
  andGte(key: string, val: ParamValue) {
    return this.and(`${quoteIdent(key)} >= ${quoteLiteral(val, this.params)}`)
  }

  /** key < value */
  andLt(key: string, val: ParamValue) {
    return this.and(`${quoteIdent(key)} < ${quoteLiteral(val, this.params)}`)
  }

  /** key <= value */
  andLte(key: string, val: ParamValue) {
    return this.and(`${quoteIdent(key)} <= ${quoteLiteral(val, this.params)}`)
  }

  /** 原始条件语句（无需引号/参数处理） */
  raw(s: string) { return this.and(s) }

  /** 是否没有任何条件 */
  isEmpty() { return this.parts.length === 0 }

  /** 生成 WHERE 条件字符串 */
  toString() { return this.parts.join(' AND ') }
}

/* -------------------------------------------------------------------------- */
/*                           GROUP BY 构造器（分组 DSL）                       */
/* -------------------------------------------------------------------------- */

/**
 * GROUP BY 构造器：
 * 支持：
 * - 普通字段分组： groupBy(g => g.by("host", "region"))
 * - 时间分组： groupBy(g => g.time("1m"))
 * - 填充值 fill()：用于 InfluxQL 的空桶处理
 *
 * 输出示例：
 * GROUP BY "host", time(1m) FILL(0)
 */
export class GroupByBuilder {
  private parts: string[] = []

  /**
   * 添加一个或多个 group by 字段：
   * - 字符串会自动使用 quoteIdent 进行字段引用
   * - Expr 会直接进入表达式
   */
  by(...cols: Array<string | Expr>) {
    cols.forEach(c =>
      this.parts.push(
        typeof c === 'string'
          ? quoteIdent(c)
          : c.toString(),
      ),
    )
    return this
  }

  /**
   * InfluxQL 语法：time(interval)
   * interval 示例："1m", "5s", "1h"
   */
  time(interval: string) {
    this.parts.push(`time(${interval})`)
    return this
  }

  /**
   * 填充值：
   * - fill(0)
   * - fill("null")
   * - fill(123)
   * 在 InfluxQL 1.x 中非常常见。
   */
  fill(value: string | number | 'null') {
    this.parts.push(`FILL(${value === 'null' ? 'NULL' : value})`)
    return this
  }

  /** 判断是否为空 */
  isEmpty() { return this.parts.length === 0 }

  /** 转为 SQL 字符串 */
  toString() { return this.parts.join(', ') }
}

/* -------------------------------------------------------------------------- */
/*                        ORDER BY 构造器（排序 DSL）                          */
/* -------------------------------------------------------------------------- */

export type OrderDir = 'ASC' | 'DESC'

/**
 * ORDER BY：
 * - 支持多字段：orderBy(o => o.by("time", "DESC").by("host"))
 * - 字段可为字符串或 Expr
 */
export class OrderByBuilder {
  parts: string[] = []

  /**
   * 添加排序字段：
   * 默认 ASC
   */
  by(col: string | Expr, dir: OrderDir = 'ASC') {
    this.parts.push(
      `${typeof col === 'string' ? quoteIdent(col) : col.toString()} ${dir}`,
    )
    return this
  }

  isEmpty() { return this.parts.length === 0 }
  toString() { return this.parts.join(', ') }
}

/* -------------------------------------------------------------------------- */
/*                        JOIN 支持（InfluxDB 3 SQL JOIN）                     */
/* -------------------------------------------------------------------------- */

/**
 * InfluxDB 3 SQL 是“类 PostgreSQL SQL”，支持 JOIN。
 * 本 DSL 用 SQL 风格构建 JOIN：
 *
 * SELECT ...
 * FROM tableA
 * INNER JOIN tableB ON tableA.col = tableB.col
 */
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

/**
 * JOIN 条目结构：
 * - type: JOIN 类型（INNER/LEFT/...）
 * - table: 表名 | Raw | 子查询 SelectBuilder
 * - on: ON 条件（用户自写）
 */
export interface JoinItem {
  type: JoinType
  table: string | Raw | SelectBuilder
  on: string
}

/* -------------------------------------------------------------------------- */
/*                         SELECT 构造器（核心 DSL 主体）                      */
/* -------------------------------------------------------------------------- */

/**
 * SelectBuilder 是整个 DSL 的核心。
 *
 * 支持：
 *   influx().select().from().where().groupBy().orderBy()...
 *   可嵌套、可 JOIN、可参数化，最终输出 SQL。
 *
 * 泛型 T 用于“累积 select 字段的类型”，辅助代码智能提示（TS 特性）。
 */
export class SelectBuilder<T = any> {
  private fields: Array<string | Expr> = []
  private fromTable: string | SelectBuilder | Raw | null = null
  private joins: JoinItem[] = []
  private whereBuilder: WhereBuilder
  private groupByBuilder = new GroupByBuilder()
  private orderByBuilder = new OrderByBuilder()
  private _limit?: number
  private _offset?: number
  private _slimit?: number
  private _soffset?: number

  constructor(private params?: Params) {
    // WHERE 构造器共享 params 实现参数化
    this.whereBuilder = new WhereBuilder(params)
  }

  /**
   * select(*fields)
   * - 字段名：select("usage", "host")
   * - 表达式：select(field("usage"), F.mean("value"))
   * 返回构造器自身，但类型带上字段（TS 泛型增强）
   */
  select<K extends string | Expr>(...cols: K[]) {
    this.fields.push(...cols)
    return this as any as SelectBuilder<T & K>
  }

  /** FROM xxx（可为表名、原始 SQL、或子查询） */
  from(tbl: string | SelectBuilder | Raw) {
    this.fromTable = tbl
    return this
  }

  /* ------------------------ JOIN 构造器封装 ------------------------ */

  /** 通用 join */
  join(type: JoinType, tbl: string | SelectBuilder | Raw, on: string) {
    this.joins.push({ type, table: tbl, on })
    return this
  }

  /** INNER JOIN */
  innerJoin(tbl: string | SelectBuilder | Raw, on: string) {
    return this.join('INNER', tbl, on)
  }

  /** LEFT JOIN */
  leftJoin(tbl: string | SelectBuilder | Raw, on: string) {
    return this.join('LEFT', tbl, on)
  }

  /** RIGHT JOIN */
  rightJoin(tbl: string | SelectBuilder | Raw, on: string) {
    return this.join('RIGHT', tbl, on)
  }

  /** FULL JOIN */
  fullJoin(tbl: string | SelectBuilder | Raw, on: string) {
    return this.join('FULL', tbl, on)
  }

  /* ------------------------ WHERE / GROUP / ORDER ------------------------ */

  /** where(w => ...) */
  where(cb: (w: WhereBuilder) => any) {
    cb(this.whereBuilder)
    return this
  }

  /** groupBy(g => ...) */
  groupBy(cb: (g: GroupByBuilder) => any) {
    cb(this.groupByBuilder)
    return this
  }

  /** orderBy(o => ...) */
  orderBy(cb: (o: OrderByBuilder) => any) {
    cb(this.orderByBuilder)
    return this
  }

  /* ------------------------ 限制语句（Limit 系列） ------------------------ */

  /**
   * LIMIT n：限制输出行数
   * InfluxQL + InfluxDB SQL 均支持
   */
  limit(n: number) {
    this._limit = n
    return this
  }

  /**
   * OFFSET n：偏移多少行（用于分页）
   */
  offset(n: number) {
    this._offset = n
    return this
  }

  /**
   * SLIMIT：限制 series 维度
   * InfluxQL 特有语法
   */
  slimit(n: number) {
    this._slimit = n
    return this
  }

  /**
   * SOFFSET：偏移 series 输出
   * InfluxQL 特有语法
   */
  soffset(n: number) {
    this._soffset = n
    return this
  }

  /* ------------------------ 子查询支持 ------------------------ */

  /**
   * 将当前 SelectBuilder 转换为子查询并加别名
   * 返回 Raw，可用于 from() 或 join()
   *
   * 例如：
   * s.as("x") → raw(" (SELECT ...) AS x ")
   */
  as(alias: string): Raw {
    return raw(`(${this.toString()}) AS ${quoteIdent(alias)}`)
  }

  /* ------------------------ 核心：生成 SQL 字符串 ------------------------ */

  /**
   * 将整个 SelectBuilder 构造的查询转换为可执行 SQL 字符串。
   */
  toString(): string {
    /* -------- SELECT 字段部分 -------- */
    const f = this.fields.length
      ? this.fields
          .map(f => typeof f === 'string' ? quoteIdent(f) : f.toString())
          .join(', ')
      : '*' // 未传字段则 SELECT *

    /* -------- FROM 部分 -------- */
    const from = this.fromTable
      ? typeof this.fromTable === 'string'
        ? quoteIdent(this.fromTable)
        : this.fromTable instanceof SelectBuilder
          ? `(${this.fromTable.toString()})`
          : (this.fromTable as Raw).raw
      : ''

    /* -------- JOIN 部分 -------- */
    const joinStr = this.joins
      .map((j) => {
        const tableStr
          = typeof j.table === 'string'
            ? quoteIdent(j.table)
            : j.table instanceof SelectBuilder
              ? `(${j.table.toString()})`
              : (j.table as Raw).raw

        return ` ${j.type} JOIN ${tableStr} ON ${j.on}`
      })
      .join('')

    /* -------- WHERE / GROUP BY / ORDER BY -------- */
    const where = this.whereBuilder.isEmpty() ? '' : ` WHERE ${this.whereBuilder.toString()}`
    const group = this.groupByBuilder.isEmpty() ? '' : ` GROUP BY ${this.groupByBuilder.toString()}`
    const order = this.orderByBuilder.isEmpty() ? '' : ` ORDER BY ${this.orderByBuilder.toString()}`

    /* -------- LIMIT / OFFSET / SLIMIT / SOFFSET -------- */
    const limit = this._limit != null ? ` LIMIT ${this._limit}` : ''
    const offset = this._offset != null ? ` OFFSET ${this._offset}` : ''
    const slimit = this._slimit != null ? ` SLIMIT ${this._slimit}` : ''
    const soffset = this._soffset != null ? ` SOFFSET ${this._soffset}` : ''

    /* -------- 组合最终 SQL -------- */
    return `SELECT ${f}${from ? ` FROM ${from}` : ''}${joinStr}${where}${group}${order}${limit}${slimit}${offset}${soffset}`
  }

  /**
   * 返回：
   * {
   *   sql: "SELECT ....",
   *   params: { $1: xxx, $2: yyy }
   * }
   */
  toSQL() {
    return {
      sql: this.toString(),
      params: this.params?.getValues() ?? {},
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                SHOW 构造器                                  */
/* -------------------------------------------------------------------------- */

/**
 * SHOW 查询构造器：
 * 支持 InfluxQL SHOW 系列语法：
 * - MEASUREMENTS / SERIES / TAG KEYS / TAG VALUES / FIELDS / RETENTION POLICIES / DATABASES
 *
 * 可选：
 * - IN <table>
 * - WHERE 条件
 *
 * 示例：
 *   show().set("MEASUREMENTS").in("cpu").where(w => w.andEq("region", "sh"))
 */
export class ShowBuilder {
  private kind: string = 'MEASUREMENTS' // 默认 SHOW 类型
  private inTable?: string
  private whereBuilder: WhereBuilder

  constructor(private params?: Params) {
    this.whereBuilder = new WhereBuilder(params)
  }

  /** 设置 SHOW 类型 */
  set(kind: 'MEASUREMENTS' | 'SERIES' | 'TAG KEYS' | 'TAG VALUES' | 'FIELDS' | 'RETENTION POLICIES' | 'DATABASES') {
    this.kind = kind
    return this
  }

  /** 指定 IN <table> */
  in(table: string) {
    this.inTable = table
    return this
  }

  /** WHERE 条件 */
  where(cb: (w: WhereBuilder) => any) {
    cb(this.whereBuilder)
    return this
  }

  /** 转为 SQL 字符串 */
  toString() {
    return `SHOW ${this.kind}${
      this.inTable ? ` IN ${quoteIdent(this.inTable)}` : ''
    }${this.whereBuilder.isEmpty() ? '' : ` WHERE ${this.whereBuilder.toString()}`}`
  }

  /** 输出 SQL + 参数对象 */
  toSQL() {
    return { sql: this.toString(), params: this.params?.getValues() ?? {} }
  }
}

/* -------------------------------------------------------------------------- */
/*                                子查询辅助函数                               */
/* -------------------------------------------------------------------------- */

/**
 * 构造子查询：
 * subquery(s => s.select("x").from("tbl"))
 * → raw("(SELECT x FROM tbl)")
 *
 * 返回 Raw 类型，可直接用在 from/join 中。
 */
export function subquery(cb: (s: SelectBuilder) => SelectBuilder) {
  const s = cb(new SelectBuilder())
  return raw(`(${s.toString()})`)
}

/* -------------------------------------------------------------------------- */
/*                                 时间 / 工具方法                               */
/* -------------------------------------------------------------------------- */

export const Time = {
  /** now() - INTERVAL '1m' 形式 */
  nowMinus: (interval: string) => raw(`now() - INTERVAL '${interval}'`),
}

/* -------------------------------------------------------------------------- */
/*                               顶层工厂（knex 风格）                         */
/* -------------------------------------------------------------------------- */

/**
 * 顶层入口工厂，类似 Knex：
 * const db = influx()
 * db.select().from("tbl").where(...)
 * db.show()...
 */
export function influx() {
  const params = new Params()
  return {
    select: <T = any>() => new SelectBuilder<T>(params),
    show: () => new ShowBuilder(params),
    raw,
    params,
  }
}

/* -------------------------------------------------------------------------- */
/*                               默认导出对象                                   */
/* -------------------------------------------------------------------------- */

export default {
  influx,
  SelectBuilder,
  ShowBuilder,
  GroupByBuilder,
  OrderByBuilder,
  WhereBuilder,
  F,
  field,
  raw,
  subquery,
  Time,
  Params,
}
