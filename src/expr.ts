import type { Raw } from './types'
import { quoteIdent } from './utils'

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
