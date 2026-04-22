import type { Config, Context } from '@netlify/functions'
import type { AnalysisStatusResponse } from '../../shared/types'
import { errorResponse, errorResponseFromUnknown, jsonResponse } from './lib/http'
import { getJob } from './lib/store'

function extractAnalysisId(request: Request, context?: Context): string | null {
  const routeParam = context?.params?.analysisId
  if (typeof routeParam === 'string' && routeParam.trim()) {
    return routeParam.trim()
  }

  const url = new URL(request.url)
  const queryAnalysisId = url.searchParams.get('analysisId') ?? url.searchParams.get('id')
  if (queryAnalysisId?.trim()) {
    return queryAnalysisId.trim()
  }

  const pathMatch = url.pathname.match(/\/api\/analyses\/([^/?#]+)/)
  if (!pathMatch) {
    return null
  }

  return decodeURIComponent(pathMatch[1])
}

export default async (request: Request, context?: Context): Promise<Response> => {
  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405)
  }

  const analysisId = extractAnalysisId(request, context)
  if (!analysisId) {
    return errorResponse('analysisId が必要です。', 400)
  }

  try {
    const job = await getJob(analysisId)
    if (!job) {
      return errorResponse('指定された分析ジョブが見つかりません。', 404)
    }

    const payload: AnalysisStatusResponse = {
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      cached: job.cached,
      result: job.result,
      error: job.error,
    }

    return jsonResponse(payload)
  } catch (error) {
    return errorResponseFromUnknown(error, '分析状態の取得に失敗しました。', 500)
  }
}

export const config: Config = {
  path: ['/api/analyses/:analysisId', '/.netlify/functions/analysis-status'],
}
