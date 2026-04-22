import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  getJob: vi.fn(),
  updateJob: vi.fn(),
  runAnalysisWorker: vi.fn(),
  parseAnalysisRequest: vi.fn(),
}))

vi.mock('./lib/store', () => ({
  getJob: mocked.getJob,
  updateJob: mocked.updateJob,
}))

vi.mock('./lib/worker', () => ({
  runAnalysisWorker: mocked.runAnalysisWorker,
}))

vi.mock('../../shared/validation', () => ({
  parseAnalysisRequest: mocked.parseAnalysisRequest,
}))

import analysisWorkerBackground from './analysis-worker-background'

describe('analysis-worker-background', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.parseAnalysisRequest.mockReturnValue({
      symbol: '7203',
      market: 'auto',
      buyThreshold: 0.6,
      sellThreshold: 0.4,
    })
  })

  it('dispatchKey が一致しない直接実行を拒否する', async () => {
    mocked.getJob.mockResolvedValue({
      analysisId: 'analysis-1',
      cacheKey: 'cache-1',
      dispatchKey: 'expected-key',
    })

    const response = await analysisWorkerBackground(
      new Request('http://localhost/.netlify/functions/analysis-worker-background', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          analysisId: 'analysis-1',
          cacheKey: 'cache-1',
          dispatchKey: 'wrong-key',
          request: {
            symbol: '7203',
            market: 'auto',
            buyThreshold: 0.6,
            sellThreshold: 0.4,
          },
        }),
      }),
    )

    await expect(response.json()).resolves.toEqual({
      error: '許可されていない background 実行です。',
      details: undefined,
    })
    expect(response.status).toBe(403)
    expect(mocked.runAnalysisWorker).not.toHaveBeenCalled()
  })
})
