import { describe, expect, it } from 'vitest'
import { formatFibers, parseFibers } from './fibers'

describe('fibers', () => {
  it('parses percentages both ways round', () => {
    expect(parseFibers('80% wool, 20% nylon')).toEqual([{ fiber: 'wool', percent: 80 }, { fiber: 'nylon', percent: 20 }])
    expect(parseFibers('Cotton 100%')).toEqual([{ fiber: 'cotton', percent: 100 }])
    expect(parseFibers('linen')).toEqual([{ fiber: 'linen', percent: null }])
  })
  it('round trips', () => {
    expect(formatFibers(parseFibers('60% cotton, 40% polyester'))).toBe('60% cotton, 40% polyester')
  })
})
