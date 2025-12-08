import type { Expr } from './expr'
import { quoteIdent } from './utils'

export type OrderDir = 'ASC' | 'DESC'

/**
 * ORDER BY：
 * - 支持多字段：orderBy(o => o.by("time", "DESC").by("host"))
 * - 字段可为字符串或 Expr
 */
export class OrderByBuilder {
  parts: string[] = []

  copy(): OrderByBuilder {
    const ob = new OrderByBuilder()
    ob.parts = [...this.parts]
    return ob
  }

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
