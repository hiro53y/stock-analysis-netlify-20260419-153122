import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAnalysisStatus, loadLastResult, persistLastResult } from './api'

describe('api helpers', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('API エラー時に status 付き ApiError を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: '見つかりません。' }),
      }),
    )

    await expect(fetchAnalysisStatus('missing-job')).rejects.toMatchObject({
      message: '見つかりません。',
      status: 404,
    })
  })

  it('Storage が使えない環境でも結果保存で落ちない', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() =>
      persistLastResult({
        analysisId: 'analysis-1',
        request: {
          symbol: '7203',
          market: 'auto',
          buyThreshold: 0.6,
          sellThreshold: 0.4,
        },
        generatedAt: '2026-04-18T00:00:00.000Z',
        symbol: '7203',
        normalizedSymbol: '7203.T',
        companyName: 'トヨタ自動車',
        market: 'JP',
        latestDataDate: '2026-04-17T00:00:00.000Z',
        finalSignal: 'BUY',
        finalSignalLabel: '買い',
        upProbability: 0.7,
        expectedReturn: 0.04,
        agreementScore: 0.6,
        recentBacktestScore: 0.59,
        summaryCards: [],
        priceSeries: [],
        forecastSeries: [],
        modelResults: [],
        backtestSummary: [],
        backtestFolds: {},
        featureImportance: [],
        localContributions: [],
        rationale: [],
        riskFlags: [],
        progressSteps: [],
      }),
    ).not.toThrow()
  })

  it('Storage が読めない環境では null を返す', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    expect(loadLastResult()).toBeNull()
  })

  it('壊れた保存済み結果は破棄して null を返す', () => {
    localStorage.setItem('stock-analysis:last-result', JSON.stringify({
      generatedAt: 123,
      companyName: 'broken payload',
    }))

    expect(loadLastResult()).toBeNull()
    expect(localStorage.getItem('stock-analysis:last-result')).toBeNull()
  })
})
