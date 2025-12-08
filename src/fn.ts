import { fn } from './expr'
import { raw, toExpr } from './utils'

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
