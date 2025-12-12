import type { Expr } from './expr'
import type { Params } from './params'
import type { Operator, Raw } from './types'

/**
 * 工具函数：构造一个 Raw，表示“原样拼接到 SQL 中”。
 */
export function raw(s: string): Raw {
  return { raw: s }
}

/**
 * 字段/标识符引用：
 * 如果字段中含有非字母数字字符，则自动加双引号, 除了 * 号：
 *   abc → abc
 *   user-name → "user-name"
 *   "x" → "\"x\""
 */
export function quoteIdent(id: string): string {
  if (/\W/.test(id) && id !== '*')
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
export function quoteLiteral(v: any, params?: Params): string {
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

/**
 * 将字符串字段名转换为引用字段，或保持 Expr。
 */
export function toExpr(x: string | Expr): string | Expr {
  return typeof x === 'string' ? quoteIdent(x) : x
}

export const toString = (v: any) => Object.prototype.toString.call(v)

export const isDef = <T = any>(val?: T): val is T => typeof val !== 'undefined'
// eslint-disable-next-line ts/no-unsafe-function-type
export const isFunction = <T extends Function> (val: any): val is T => typeof val === 'function'
export const isNumber = (val: any): val is number => typeof val === 'number'
export const isString = (val: unknown): val is string => typeof val === 'string'
export const isObject = (val: any): val is object => toString(val) === '[object Object]'
export const isUndefined = (val: any): val is undefined => toString(val) === '[object Undefined]'
export const isNull = (val: any): val is null => toString(val) === '[object Null]'
export const isRegExp = (val: any): val is RegExp => toString(val) === '[object RegExp]'
export function isOperator(val: any): val is Operator {
  return ['=', '!=', '>', '>=', '<', '<=', '=~', '!~'].includes(val)
}
