import type { Params } from './params'
import { quoteIdent } from './utils'
import { WhereBuilder } from './where'

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
