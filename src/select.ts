import type { Expr } from './expr'
import type { JoinItem, JoinType } from './join'
import type { Params } from './params'
import type { Operator, ParamValue, Raw } from './types'
import { F } from './fn'
import { GroupByBuilder } from './group'
import { OrderByBuilder } from './order'
import { isDef, isFunction, isObject, isOperator, isRegExp, isString, quoteIdent, raw } from './utils'
import { WhereBuilder } from './where'

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
   * 完全复制当前 SelectBuilder 实例（深度拷贝）。
   */
  copy(): SelectBuilder<T> {
    const sb = new SelectBuilder<T>(this.params)
    sb.fields = [...this.fields]
    sb.fromTable = this.fromTable
    sb.joins = [...this.joins]
    sb.whereBuilder = this.whereBuilder.copy()
    sb.groupByBuilder = this.groupByBuilder.copy()
    sb.orderByBuilder = this.orderByBuilder.copy()
    sb._limit = this._limit
    sb._offset = this._offset
    sb._slimit = this._slimit
    sb._soffset = this._soffset
    return sb
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

  count(field: string | Expr) {
    this.fields.push(F.count(field))
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

  /* ------------------------ WHERE 条件封装 ------------------------ */

  /**
   * 区间条件：
   * between(key, [a, b]) → key >= 'a' AND key <= 'b'
   */
  between(key: string, [from, to]: [Date | string, Date | string]) {
    this.whereBuilder.between(key, [from, to])
    return this
  }

  /**
   * 不符合区间条件：
   * notBetween(key, [a, b]) → key < 'a' OR key > 'b'
   */
  notBetween(key: string, range: [ Date | string, Date | string]) {
    this.whereBuilder.notBetween(key, range)
    return this
  }

  /* ------------------------ WHERE / GROUP / ORDER ------------------------ */

  /**
   * where 条件：
   * where(w => ...)
   * 或 where({ key: value, ... })
   * 或 where(key, value)
   * 或 where(key, operator, value)
   */
  where(cb: (w: WhereBuilder) => any): this
  where(obj: Record<string, any>): this
  where(key: string, value: ParamValue | RegExp): this
  where(key: string, operator: Operator, value: ParamValue | RegExp): this
  where(cb: ((w: WhereBuilder) => any) | Record<string, any> | string, operator?: Operator | ParamValue | RegExp, value?: ParamValue | RegExp): this {
    if (isObject(cb)) {
      Object.entries(cb).forEach(([k, v]) => this.whereBuilder.andEq(k, v))
      return this
    }

    if (isFunction(cb)) {
      cb(this.whereBuilder)
      return this
    }

    if (isString(cb)) {
      if (isDef(value)) {
        if (!isOperator(operator)) {
          throw new TypeError(`Invalid operator: ${String(operator)}`)
        }

        if ((operator === '=~' || operator === '!~') && !(value instanceof RegExp)) {
          throw new TypeError(`The value for operator '${operator}' must be a RegExp.`)
        }

        this.whereBuilder.byOperator(operator)(cb, value as any)
      }
      else if (isRegExp(operator)) {
        this.whereBuilder.andRegex(cb, operator)
      }
      else {
        this.whereBuilder.andEq(cb, operator as any)
      }

      return this
    }

    return this
  }

  /**
   * operator 与 value 取反的 where 条件：
   * whereNot(w => ...)
   * 或 whereNot({ key: value, ... })
   * 或 whereNot(key, value)
   * 或 whereNot(key, operator, value)
   */
  whereNot(cb: (w: WhereBuilder) => any): this
  whereNot(obj: Record<string, any>): this
  whereNot(key: string, value: ParamValue | RegExp): this
  whereNot(key: string, operator: Operator, value: ParamValue | RegExp): this
  whereNot(cb: ((w: WhereBuilder) => any) | Record<string, any> | string, operator?: Operator | ParamValue | RegExp, value?: ParamValue | RegExp): this {
    if (isObject(cb)) {
      Object.entries(cb).forEach(([k, v]) => this.whereBuilder.andNeq(k, v))
      return this
    }

    if (isFunction(cb)) {
      cb(this.whereBuilder)
      return this
    }

    if (isString(cb)) {
      if (isDef(value)) {
        if (!isOperator(operator)) {
          throw new TypeError(`Invalid operator: ${String(operator)}`)
        }

        if ((operator === '=~' || operator === '!~') && !(value instanceof RegExp)) {
          throw new TypeError(`The value for operator '${operator}' must be a RegExp.`)
        }

        this.whereBuilder.byOperatorNot(operator)(cb, value as any)
      }
      else if (isRegExp(operator)) {
        this.whereBuilder.andNotRegex(cb, operator)
      }
      else {
        this.whereBuilder.andNeq(cb, operator as any)
      }

      return this
    }

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
