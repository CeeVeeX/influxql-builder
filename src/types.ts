/**
 * Raw 类型：用于标记“原生 SQL 片段”，即不进行转义或加工。
 * 例如用于插入函数、表达式、子查询、interval、now() 等。
 */
export interface Raw {
  raw: string
}

/**
 * 参数化查询允许的值：
 * - number, string, boolean, Date, null, Raw
 * Raw 用于绕过参数化（直接写 SQL）
 */
export type ParamValue = number | string | boolean | Date | null | Raw

export type Operator = '=' | '!=' | '>' | '>=' | '<' | '<=' | '=~' | '!~'
