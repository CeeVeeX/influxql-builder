import { describe, expect, it } from 'vitest'
import { ShowBuilder } from '../src/index'

describe('show', () => {
  it('builds simple show', () => {
    const q = new ShowBuilder()
      .set('MEASUREMENTS')
      .in('cpu')
      .where(w => w.andEq('region', 'sh'))
      .toString()

    expect(q)
      .toBe(
      /* sql */`SHOW MEASUREMENTS IN cpu WHERE (region = 'sh')`,
      )
  })

  it('builds show with multiple conditions', () => {
    const q = new ShowBuilder()
      .set('MEASUREMENTS')
      .in('cpu')
      .where(w => w.andEq('region', 'sh').andEq('host', 'server01'))
      .toString()

    expect(q)
      .toBe(
      /* sql */`SHOW MEASUREMENTS IN cpu WHERE (region = 'sh') AND (host = 'server01')`,
      )
  })
})
