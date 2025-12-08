import type { Expr } from './expr'
import { quoteIdent } from './utils'

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

  copy(): GroupByBuilder {
    const gb = new GroupByBuilder()
    gb.parts = [...this.parts]
    return gb
  }

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
