import { field } from './expr'
import { F } from './fn'
import { GroupByBuilder } from './group'
import { OrderByBuilder } from './order'
import { Params } from './params'
import { SelectBuilder } from './select'
import { ShowBuilder } from './show'
import { subquery } from './subquery'
import { Time } from './time'
import { raw } from './utils'
import { WhereBuilder } from './where'

export * from './expr'
export * from './fn'
export * from './group'
export * from './order'
export * from './params'
export * from './select'
export * from './show'
export * from './subquery'
export * from './time'
export * from './types'
export * from './utils'
export * from './where'

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
