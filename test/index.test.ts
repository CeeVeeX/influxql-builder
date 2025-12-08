import { describe, expect, it } from 'vitest'
import { F, SelectBuilder } from '../src/index'

describe('select', () => {
  it('builds simple select', () => {
    const q = new SelectBuilder()
      .select(F.count('output'))
      .from('product_record')
      .where(w =>
        w.andEq('qualified', '1')
          .andEq('step', 'final')
          .between('time', ['2025-12-03T16:00:00.000Z', '2025-12-04T15:59:00.000Z']),
      )
      .toString()
    expect(q)
      .toBe(
      /* sql */`SELECT COUNT(output) FROM product_record WHERE (qualified = '1') AND (step = 'final') AND (time >= '2025-12-03T16:00:00.000Z' AND time <= '2025-12-04T15:59:00.000Z')`,
      )
  })
})
