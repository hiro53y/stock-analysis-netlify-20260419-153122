import { DEFAULT_ANALYSIS_INPUT } from '../../shared/constants'
import type {
  AnalysisCreateResponse,
  AnalysisRequestPayload,
  AnalysisResult,
  AnalysisStatusResponse,
  MarketDataResponse,
} from '../../shared/types'
import { z } from 'zod'

const LAST_RESULT_KEY = 'stock-analysis:last-result'
const modelIdSchema = z.enum(['baseline', 'ar_trend', 'direction_classifier', 'return_regressor'])
const toneSchema = z.enum(['positive', 'negative', 'neutral', 'accent'])
const directionSchema = z.enum(['positive', 'negative', 'neutral'])
const signalSchema = z.enum(['BUY', 'WATCH', 'SELL', 'UNKNOWN'])
const marketSchema = z.enum(['auto', 'JP', 'US'])
const resolvedMarketSchema = z.enum(['JP', 'US'])

const analysisResultStorageSchema = z.object({
  analysisId: z.string(),
  request: z.object({
    symbol: z.string(),
    market: marketSchema,
    buyThreshold: z.number(),
    sellThreshold: z.number(),
  }),
  generatedAt: z.string(),
  symbol: z.string(),
  normalizedSymbol: z.string(),
  companyName: z.string(),
  market: resolvedMarketSchema,
  latestDataDate: z.string(),
  finalSignal: signalSchema,
  finalSignalLabel: z.string(),
  upProbability: z.number(),
  expectedReturn: z.number(),
  agreementScore: z.number(),
  recentBacktestScore: z.number(),
  summaryCards: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
      subText: z.string(),
      tone: toneSchema,
    }),
  ),
  priceSeries: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      close: z.number(),
    }),
  ),
  forecastSeries: z.array(
    z.object({
      date: z.string(),
      label: z.string(),
      actual: z.number().optional(),
      predicted: z.number().optional(),
      forecast: z.boolean(),
    }),
  ),
  modelResults: z.array(
    z.object({
      modelId: modelIdSchema,
      label: z.string(),
      status: z.enum(['ok', 'error']),
      predictedReturn: z.number().nullable(),
      upProbability: z.number().nullable(),
      recentBacktestScore: z.number().nullable(),
      errorMessage: z.string().optional(),
    }),
  ),
  backtestSummary: z.array(
    z.object({
      modelId: modelIdSchema,
      label: z.string(),
      directionalAccuracy: z.number(),
      maeReturn: z.number(),
      recentScore: z.number(),
      foldCount: z.number(),
      errorMessage: z.string().optional(),
    }),
  ),
  backtestFolds: z.object({
    baseline: z.array(
      z.object({
        foldIndex: z.number(),
        trainSize: z.number(),
        testSize: z.number(),
        directionalAccuracy: z.number(),
        maeReturn: z.number(),
        score: z.number(),
      }),
    ).optional(),
    ar_trend: z.array(
      z.object({
        foldIndex: z.number(),
        trainSize: z.number(),
        testSize: z.number(),
        directionalAccuracy: z.number(),
        maeReturn: z.number(),
        score: z.number(),
      }),
    ).optional(),
    direction_classifier: z.array(
      z.object({
        foldIndex: z.number(),
        trainSize: z.number(),
        testSize: z.number(),
        directionalAccuracy: z.number(),
        maeReturn: z.number(),
        score: z.number(),
      }),
    ).optional(),
    return_regressor: z.array(
      z.object({
        foldIndex: z.number(),
        trainSize: z.number(),
        testSize: z.number(),
        directionalAccuracy: z.number(),
        maeReturn: z.number(),
        score: z.number(),
      }),
    ).optional(),
  }),
  featureImportance: z.array(
    z.object({
      feature: z.string(),
      score: z.number(),
      direction: directionSchema,
      valueText: z.string(),
    }),
  ),
  localContributions: z.array(
    z.object({
      feature: z.string(),
      score: z.number(),
      direction: directionSchema,
      valueText: z.string(),
    }),
  ),
  rationale: z.array(z.string()),
  riskFlags: z.array(z.string()),
  progressSteps: z.array(z.string()),
})

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new ApiError(payload.error ?? 'API 呼び出しに失敗しました。', response.status)
  }
  return payload as T
}

export async function startAnalysis(
  payload: AnalysisRequestPayload,
): Promise<AnalysisCreateResponse> {
  return requestJson<AnalysisCreateResponse>('/api/analyses', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function fetchAnalysisStatus(
  analysisId: string,
): Promise<AnalysisStatusResponse> {
  return requestJson<AnalysisStatusResponse>(`/api/analyses/${analysisId}`)
}

export async function fetchMarketPreview(
  symbol: string,
  market: AnalysisRequestPayload['market'],
  signal?: AbortSignal,
): Promise<MarketDataResponse> {
  const query = new URLSearchParams({ market })
  return requestJson<MarketDataResponse>(`/api/market-data/${encodeURIComponent(symbol)}?${query}`, {
    signal,
  })
}

export function persistLastResult(result: AnalysisResult): void {
  try {
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result))
  } catch {
    // Storage が使えないブラウザでは永続化を諦める
  }
}

export function loadLastResult(): AnalysisResult | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY)
    if (!raw) return null

    const parsed = analysisResultStorageSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      localStorage.removeItem(LAST_RESULT_KEY)
      return null
    }

    return parsed.data as AnalysisResult
  } catch {
    return null
  }
}

export function buildInitialForm(): AnalysisRequestPayload {
  return { ...DEFAULT_ANALYSIS_INPUT }
}
