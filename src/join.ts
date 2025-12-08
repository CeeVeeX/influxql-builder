import type { SelectBuilder } from './select'
import type { Raw } from './types'

/**
 * InfluxDB 3 SQL 是“类 PostgreSQL SQL”，支持 JOIN。
 * 本 DSL 用 SQL 风格构建 JOIN：
 *
 * SELECT ...
 * FROM tableA
 * INNER JOIN tableB ON tableA.col = tableB.col
 */
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

/**
 * JOIN 条目结构：
 * - type: JOIN 类型（INNER/LEFT/...）
 * - table: 表名 | Raw | 子查询 SelectBuilder
 * - on: ON 条件（用户自写）
 */
export interface JoinItem {
  type: JoinType
  table: string | Raw | SelectBuilder
  on: string
}
