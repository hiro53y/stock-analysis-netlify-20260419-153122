import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@netlify/blobs', () => ({
  getStore: () => {
    throw new Error('blobs unavailable')
  },
}))

import {
  canUseBackgroundProcessing,
  getCachedAnalysis,
  getGenericStoreValue,
  resolveFallbackRoot,
  resolveRuntimeRoot,
  setCachedAnalysis,
  setGenericStoreValue,
} from './store'

const fallbackRoot = path.resolve(process.cwd(), 'runtime', 'local-store')

describe('store fallback', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-19T00:00:00.000Z'))
    delete process.env.LAMBDA_TASK_ROOT
    delete process.env.NETLIFY
    delete process.env.NETLIFY_LOCAL
    await rm(path.join(fallbackRoot, 'test-store'), { force: true, recursive: true }).catch(() => {})
    await rm(path.join(fallbackRoot, 'analysis-cache'), { force: true, recursive: true }).catch(() => {})
  })

  afterEach(async () => {
    vi.useRealTimers()
    delete process.env.LAMBDA_TASK_ROOT
    delete process.env.NETLIFY
    delete process.env.NETLIFY_LOCAL
    await rm(path.join(fallbackRoot, 'test-store'), { force: true, recursive: true }).catch(() => {})
    await rm(path.join(fallbackRoot, 'analysis-cache'), { force: true, recursive: true }).catch(() => {})
  })

  it('Netlify 本番相当では writable な /tmp/runtime を使う', () => {
    process.env.LAMBDA_TASK_ROOT = '/var/task'

    expect(resolveRuntimeRoot()).toBe('/tmp/runtime')
    expect(resolveFallbackRoot()).toBe('/tmp/runtime/local-store')
  })

  it('Blobs が使えない場合でも filesystem fallback で値を維持する', async () => {
    await setGenericStoreValue('test-store', 'job:1', { status: 'queued' })

    await expect(getGenericStoreValue<{ status: string }>('test-store', 'job:1')).resolves.toEqual({
      status: 'queued',
    })
  })

  it('Hosted Netlify でも Blobs が使えない場合は filesystem fallback と同期実行へ切り替える', async () => {
    process.env.NETLIFY = 'true'

    await expect(canUseBackgroundProcessing()).resolves.toBe(false)

    await setGenericStoreValue('test-store', 'job:hosted', { status: 'running' })

    await expect(getGenericStoreValue<{ status: string }>('test-store', 'job:hosted')).resolves.toEqual({
      status: 'running',
    })
    expect(resolveFallbackRoot()).toBe(fallbackRoot)
  })

  it('分析結果キャッシュは TTL 超過後に無効化される', async () => {
    await setCachedAnalysis('cache:1', {
      analysisId: 'analysis-1',
      request: {
        symbol: '7203',
        market: 'auto',
        buyThreshold: 0.6,
        sellThreshold: 0.4,
      },
      generatedAt: '2026-04-19T00:00:00.000Z',
      symbol: '7203',
      normalizedSymbol: '7203.T',
      companyName: 'トヨタ自動車',
      market: 'JP',
      latestDataDate: '2026-04-18T00:00:00.000Z',
      finalSignal: 'BUY',
      finalSignalLabel: '買い',
      upProbability: 0.7,
      expectedReturn: 0.04,
      agreementScore: 0.61,
      recentBacktestScore: 0.6,
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
    })

    vi.setSystemTime(new Date('2026-04-19T01:00:01.000Z'))

    await expect(getCachedAnalysis('cache:1')).resolves.toBeNull()
  })
})
