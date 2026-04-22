import type { AnalysisStatusResponse } from '../../shared/types'
import { errorResponse, errorResponseFromUnknown, jsonResponse } from './lib/http'
import { getJob } from './lib/store'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405)
  }

  const url = new URL(request.url)
  const analysisId = url.searchParams.get('id')
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
