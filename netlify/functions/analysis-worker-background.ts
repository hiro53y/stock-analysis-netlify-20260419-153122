import { HttpError, errorResponse, errorResponseFromUnknown } from './lib/http'
import { getJob, updateJob } from './lib/store'
import { runAnalysisWorker } from './lib/worker'
import { parseAnalysisRequest } from '../../shared/validation'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return errorResponse('Method Not Allowed', 405)
  }

  let analysisId: string | undefined

  try {
    const raw = (await request.json()) as {
      analysisId?: unknown
      cacheKey?: unknown
      dispatchKey?: unknown
      request?: unknown
    }

    if (
      typeof raw.analysisId !== 'string' ||
      typeof raw.cacheKey !== 'string' ||
      typeof raw.dispatchKey !== 'string'
    ) {
      throw new HttpError('background payload が不正です。', 400)
    }

    const payload = {
      analysisId: raw.analysisId,
      cacheKey: raw.cacheKey,
      dispatchKey: raw.dispatchKey,
      request: parseAnalysisRequest(raw.request),
    }
    analysisId = payload.analysisId

    const job = await getJob(payload.analysisId)
    if (!job || job.cacheKey !== payload.cacheKey || job.dispatchKey !== payload.dispatchKey) {
      throw new HttpError('許可されていない background 実行です。', 403)
    }

    await runAnalysisWorker(payload)
    return new Response(null, { status: 202 })
  } catch (error) {
    if (analysisId && !(error instanceof HttpError && error.status === 403)) {
      await updateJob(analysisId, {
        status: 'error',
        progress: 100,
        progressMessage: '分析中にエラーが発生しました。',
        error: error instanceof Error ? error.message : '分析処理に失敗しました。',
      })
    }
    if (error instanceof HttpError) {
      return errorResponseFromUnknown(error, error.message, error.status)
    }
    return new Response(null, { status: 202 })
  }
}
