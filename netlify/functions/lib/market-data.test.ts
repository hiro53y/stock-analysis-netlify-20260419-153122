import { describe, expect, it } from 'vitest'
import { normalizeSymbol } from './market-data'

describe('normalizeSymbol', () => {
  it('auto で .T 付き4桁コードを JP 銘柄として扱う', () => {
    expect(normalizeSymbol('7203.T', 'auto')).toEqual({
      normalizedSymbol: '7203.T',
      market: 'JP',
    })
  })

  it('JP 明示時は .T を補完する', () => {
    expect(normalizeSymbol('7203', 'JP')).toEqual({
      normalizedSymbol: '7203.T',
      market: 'JP',
    })
  })

  it('US 銘柄では .T を除去して扱う', () => {
    expect(normalizeSymbol('AAPL.T', 'US')).toEqual({
      normalizedSymbol: 'AAPL',
      market: 'US',
    })
  })
})
