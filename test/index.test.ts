import { describe, expect, it } from 'vitest'
import { SelectBuilder } from '../src/index'

describe('select', () => {
  it('builds simple select', () => {
    const base = new SelectBuilder()
      .count('output')
      .from('product_record')

    const q = base.clone()
      .where(w =>
        w.andEq('qualified', '1')
          .andEq('step', 'final')
          .between('time', ['2025-12-03T16:00:00.000Z', '2025-12-04T15:59:00.000Z']),
      )
      .toString()

    const q2 = base.clone()
      .where({
        qualified: '1',
        step: 'final',
      })
      .between('time', ['2025-12-03T16:00:00.000Z', '2025-12-04T15:59:00.000Z'])
      .toString()

    const q3 = base.clone()
      .where('qualified', '=', '1')
      .where('step', '=', 'final')
      .between('time', ['2025-12-03T16:00:00.000Z', '2025-12-04T15:59:00.000Z'])
      .toString()

    const expectedQuery = /* sql */`SELECT COUNT(output) FROM product_record WHERE (qualified = '1') AND (step = 'final') AND (time >= '2025-12-03T16:00:00.000Z' AND time <= '2025-12-04T15:59:00.000Z')`
    expect(q).toBe(expectedQuery)
    expect(q2).toBe(expectedQuery)
    expect(q3).toBe(expectedQuery)
  })
})
