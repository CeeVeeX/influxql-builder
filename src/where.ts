import type { Params } from './params'
import type { Operator, ParamValue, Raw } from './types'
import { quoteIdent, quoteLiteral } from './utils'

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

  copy(): WhereBuilder {
    const wb = new WhereBuilder(this.params)
    wb.parts = [...this.parts]
    return wb
  }

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

  /**
   * key = value
   * 如果 value 未定义则跳过该条件
   */
  andEq(key: string, val?: ParamValue) {
    if (val === undefined)
      return this
    return this.and(`${quoteIdent(key)} = ${quoteLiteral(val, this.params)}`)
  }

  /**
   * key != value
   * 如果 value 未定义则跳过该条件
   */
  andNeq(key: string, val?: ParamValue) {
    if (val === undefined)
      return this
    return this.and(`${quoteIdent(key)} != ${quoteLiteral(val, this.params)}`)
  }

  /**
   * key =~ /regex/
   * 如果 regex 未定义则跳过该条件
   */
  andRegex(key: string, regex?: RegExp) {
    if (!regex)
      return this
    return this.and(`${quoteIdent(key)} =~ ${quoteLiteral(regex.source, this.params)}`)
  }

  /**
   * key !~ /regex/
   * 如果 regex 未定义则跳过该条件
   */
  andNotRegex(key: string, regex?: RegExp) {
    if (!regex)
      return this
    return this.and(`${quoteIdent(key)} !~ ${quoteLiteral(regex.source, this.params)}`)
  }

  /**
   * key > value
   * 如果 value 未定义则跳过该条件
   */
  andGt(key: string, val?: ParamValue) {
    if (val === undefined)
      return this
    return this.and(`${quoteIdent(key)} > ${quoteLiteral(val, this.params)}`)
  }

  /**
   * key >= value
   * 如果 value 未定义则跳过该条件
   */
  andGte(key: string, val?: ParamValue) {
    if (val === undefined)
      return this
    return this.and(`${quoteIdent(key)} >= ${quoteLiteral(val, this.params)}`)
  }

  /**
   * key < value
   * 如果 value 未定义则跳过该条件
   */
  andLt(key: string, val?: ParamValue) {
    if (val === undefined)
      return this
    return this.and(`${quoteIdent(key)} < ${quoteLiteral(val, this.params)}`)
  }

  /**
   * key <= value
   * 如果 value 未定义则跳过该条件
   */
  andLte(key: string, val?: ParamValue) {
    if (val === undefined)
      return this
    return this.and(`${quoteIdent(key)} <= ${quoteLiteral(val, this.params)}`)
  }

  /** 原始条件语句（无需引号/参数处理） */
  raw(s: string) { return this.and(s) }

  byOperator(operator: Operator) {
    const operatorMap = {
      '=': this.andEq,
      '!=': this.andNeq,
      '>': this.andGt,
      '>=': this.andGte,
      '<': this.andLt,
      '<=': this.andLte,
      '=~': this.andRegex,
      '!~': this.andNotRegex,
    }

    return operatorMap[operator].bind(this)
  }

  byOperatorNot(operator: Operator) {
    const operatorMap = {
      '=': this.andNeq,
      '!=': this.andEq,
      '>': this.andLte,
      '>=': this.andLt,
      '<': this.andGte,
      '<=': this.andGt,
      '=~': this.andNotRegex,
      '!~': this.andRegex,
    }

    return operatorMap[operator].bind(this)
  }

  /** 是否没有任何条件 */
  isEmpty() { return this.parts.length === 0 }

  /** 生成 WHERE 条件字符串 */
  toString() { return this.parts.join(' AND ') }
}
