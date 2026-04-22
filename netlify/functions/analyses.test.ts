import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  clearInFlightAnalysis: vi.fn(),
  parseAnalysisRequest: vi.fn(),
  normalizeSymbol: vi.fn(),
  enforceRateLimit: vi.fn(),
  getCachedAnalysis: vi.fn(),
  getInFlightAnalysis: vi.fn(),
  getJob: vi.fn(),
  setInFlightAnalysis: vi.fn(),
  setJob: vi.fn(),
  updateJob: vi.fn(),
}))

vi.mock('../../shared/validation', () => ({
  parseAnalysisRequest: mocked.parseAnalysisRequest,
}))

vi.mock('../../shared/utils', () => ({
  createUuid: () => 'analysis-1',
  hashKey: () => 'cache-1',
}))

vi.mock('./lib/market-data', () => ({
  normalizeSymbol: mocked.normalizeSymbol,
}))

vi.mock('./lib/rate-limit', () => ({
  enforceRateLimit: mocked.enforceRateLimit,
}))

vi.mock('./lib/store', () => ({
  clearInFlightAnalysis: mocked.clearInFlightAnalysis,
  getCachedAnalysis: mocked.getCachedAnalysis,
  getInFlightAnalysis: mocked.getInFlightAnalysis,
  getJob: mocked.getJob,
  setInFlightAnalysis: mocked.setInFlightAnalysis,
  setJob: mocked.setJob,
  updateJob: mocked.updateJob,
}))

import analyses from './analyses'

describe('analyses function', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.parseAnalysisRequest.mockReturnValue({
      symbol: '7203',
      market: 'auto',
      buyThreshold: 0.6,
      sellThreshold: 0.4,
    })
    mocked.normalizeSymbol.mockReturnValue({
      normalizedSymbol: '7203.T',
      market: 'JP',
    })
    mocked.enforceRateLimit.mockResolvedValue(undefined)
    mocked.getCachedAnalysis.mockResolvedValue(null)
    mocked.getInFlightAnalysis.mockResolvedValue(null)
    mocked.getJob.mockResolvedValue(null)
    mocked.setInFlightAnalysis.mockResolvedValue(undefined)
    mocked.clearInFlightAnalysis.mockResolvedValue(undefined)
    mocked.setJob.mockResolvedValue(undefined)
    mocked.updateJob.mockResolvedValue(undefined)
  })

  it('background function 起動失敗時にジョブを error 化して 202 を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => 'worker unavailable',
      }),
    )

    const response = await analyses(
      new Request('http://localhost/api/analyses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          symbol: '7203',
          market: 'auto',
          buyThreshold: 0.6,
          sellThreshold: 0.4,
        }),
      }),
    )

    await expect(response.json()).resolves.toEqual({
      analysisId: 'analysis-1',
      status: 'error',
      cached: false,
    })
    expect(response.status).toBe(202)
    expect(mocked.updateJob).toHaveBeenCalledWith(
      'analysis-1',
      expect.objectContaining({
        status: 'error',
        progress: 100,
      }),
    )
  })

  it('同一 cacheKey の実行中ジョブがあれば既存 analysisId を返す', async () => {
    mocked.getInFlightAnalysis.mockResolvedValue('analysis-running')
    mocked.getJob.mockResolvedValue({
      analysisId: 'analysis-running',
      status: 'running',
    })

    const response = await analyses(
      new Request('http://localhost/api/analyses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          symbol: '7203',
          market: 'auto',
          buyThreshold: 0.6,
          sellThreshold: 0.4,
        }),
      }),
    )

    await expect(response.json()).resolves.toEqual({
      analysisId: 'analysis-running',
      status: 'running',
      cached: false,
    })
    expect(mocked.setJob).not.toHaveBeenCalled()
  })
})
