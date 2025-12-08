/**
 * 参数收集器：
 * 用于替换查询中的值，将其转换为位置参数：
 *   $1, $2, $3 ...
 *
 * - `.next(value)`：返回 "$n"，记录实际参数
 * - `.getValues()`：返回参数对象 { $1: v1, $2: v2, ... }
 *
 * 这样可以避免 SQL 注入，同时让语句可复用、可预编译。
 */
export class Params {
  private index = 1
  private values: Record<string, any> = {}

  /** 添加一个参数并返回占位符，例如 "$3" */
  next(value: any): string {
    const key = `$${this.index++}`
    this.values[key] = value
    return key
  }

  /** 获取所有参数 */
  getValues() {
    return this.values
  }

  /** 重置，用于新的查询 */
  reset() {
    this.index = 1
    this.values = {}
  }
}
