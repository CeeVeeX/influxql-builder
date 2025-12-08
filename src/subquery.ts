import { SelectBuilder } from './select'
import { raw } from './utils'

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
