import { analyzeMarketData } from '../../../shared/analysis/engine'
import { normalizeSymbol, getMarketData } from './market-data'
import { clearInFlightAnalysis, getCachedAnalysis, setCachedAnalysis, updateJob } from './store'
import type { AnalysisRequestPayload } from '../../../shared/types'

export interface WorkerPayload {
  analysisId: string
  cacheKey: string
  request: AnalysisRequestPayload
}

export async function runAnalysisWorker(payload: WorkerPayload): Promise<void> {
  try {
    const normalized = normalizeSymbol(payload.request.symbol, payload.request.market)
    await updateJob(payload.analysisId, {
      status: 'running',
      progress: 10,
      progressMessage: '市場データを取得しています...',
      normalizedSymbol: normalized.normalizedSymbol,
      market: normalized.market,
    })

    const cached = await getCachedAnalysis(payload.cacheKey)
    if (cached) {
      await updateJob(payload.analysisId, {
        status: 'completed',
        progress: 100,
        progressMessage: 'キャッシュ済み結果を返しました。',
        cached: true,
        result: cached,
      })
      return
    }

    const marketData = await getMarketData(payload.request.symbol, payload.request.market)
    await updateJob(payload.analysisId, {
      status: 'running',
      progress: 45,
      progressMessage: '分析モデルを計算しています...',
      normalizedSymbol: marketData.normalizedSymbol,
      market: marketData.market,
    })

    const result = analyzeMarketData({
      analysisId: payload.analysisId,
      request: payload.request,
      marketData,
    })

    await updateJob(payload.analysisId, {
      status: 'running',
      progress: 85,
      progressMessage: '結果を保存しています...',
    })
    await setCachedAnalysis(payload.cacheKey, result)
    await updateJob(payload.analysisId, {
      status: 'completed',
      progress: 100,
      progressMessage: '分析が完了しました。',
      result,
    })
  } finally {
    await clearInFlightAnalysis(payload.cacheKey).catch(() => {})
  }
}
