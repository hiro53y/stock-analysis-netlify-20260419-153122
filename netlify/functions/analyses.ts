import { CACHE_VERSION } from '../../shared/constants'
import { createUuid, hashKey } from '../../shared/utils'
import { parseAnalysisRequest } from '../../shared/validation'
import type { AnalysisCreateResponse, AnalysisJobRecord } from '../../shared/types'
import { errorResponseFromUnknown, getClientIp, jsonResponse } from './lib/http'
import { normalizeSymbol } from './lib/market-data'
import { enforceRateLimit } from './lib/rate-limit'
import {
  clearInFlightAnalysis,
  getCachedAnalysis,
  getInFlightAnalysis,
  getJob,
  setInFlightAnalysis,
  setJob,
  updateJob,
} from './lib/store'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405)
  }

  try {
    await enforceRateLimit('/api/analyses', getClientIp(request))
    const input = parseAnalysisRequest(await request.json())
    const normalized = normalizeSymbol(input.symbol, input.market)
    const cacheKey = hashKey(
      JSON.stringify({
        ...input,
        normalizedSymbol: normalized.normalizedSymbol,
        market: normalized.market,
        version: CACHE_VERSION,
      }),
    )
    const cached = await getCachedAnalysis(cacheKey)
    const now = new Date().toISOString()

    if (!cached) {
      const activeAnalysisId = await getInFlightAnalysis(cacheKey)
      if (activeAnalysisId) {
        const activeJob = await getJob(activeAnalysisId)
        if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
          const payload: AnalysisCreateResponse = {
            analysisId: activeJob.analysisId,
            status: activeJob.status,
            cached: false,
          }

          return jsonResponse(payload, 202)
        }

        await clearInFlightAnalysis(cacheKey).catch(() => {})
      }
    }

    const analysisId = createUuid()
    const dispatchKey = createUuid()

    const job: AnalysisJobRecord = {
      analysisId,
      cacheKey,
      dispatchKey,
      status: cached ? 'completed' : 'queued',
      progress: cached ? 100 : 0,
      progressMessage: cached ? 'キャッシュ済み結果を返しました。' : '分析ジョブを作成しました。',
      createdAt: now,
      updatedAt: now,
      cached: Boolean(cached),
      request: input,
      symbol: input.symbol,
      normalizedSymbol: normalized.normalizedSymbol,
      market: normalized.market,
      result: cached ?? undefined,
    }

    await setJob(job)
    let finalStatus = job.status

    if (!cached) {
      await setInFlightAnalysis(cacheKey, analysisId)
      try {
        const backgroundUrl = new URL('/.netlify/functions/analysis-worker-background', request.url)
        const response = await fetch(backgroundUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            analysisId,
            cacheKey,
            dispatchKey,
            request: input,
          }),
        })

        if (!response.ok) {
          const detail = await response.text().catch(() => '')
          throw new Error(detail || 'バックグラウンド処理の起動に失敗しました。')
        }
      } catch (backgroundError) {
        await updateJob(analysisId, {
          status: 'error',
          progress: 100,
          progressMessage: 'バックグラウンド処理の起動に失敗しました。',
          error:
            backgroundError instanceof Error
              ? backgroundError.message
              : 'バックグラウンド処理の起動に失敗しました。',
        })
        await clearInFlightAnalysis(cacheKey).catch(() => {})
        finalStatus = 'error'
      }
    }

    const payload: AnalysisCreateResponse = {
      analysisId,
      status: finalStatus,
      cached: job.cached,
    }

    return jsonResponse(payload, 202)
  } catch (error) {
    return errorResponseFromUnknown(error, '分析ジョブの作成に失敗しました。', 400)
  }
}
