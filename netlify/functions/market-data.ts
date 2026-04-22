import { errorResponse, errorResponseFromUnknown, getClientIp, jsonResponse } from './lib/http'
import { enforceRateLimit } from './lib/rate-limit'
import { getMarketData } from './lib/market-data'

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'GET') {
    return errorResponse('Method Not Allowed', 405)
  }

  try {
    await enforceRateLimit('/api/market-data', getClientIp(request))
    const url = new URL(request.url)
    const symbol = url.searchParams.get('symbol')
    const market = (url.searchParams.get('market') ?? 'auto') as 'auto' | 'JP' | 'US'
    if (!symbol) {
      return errorResponse('symbol が必要です。', 400)
    }

    const marketData = await getMarketData(symbol, market)
    return jsonResponse(marketData)
  } catch (error) {
    return errorResponseFromUnknown(error, '市場データの取得に失敗しました。', 400)
  }
}
