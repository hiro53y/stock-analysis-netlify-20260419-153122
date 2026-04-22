import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_SECONDS } from '../../../shared/constants'
import { HttpError } from './http'
import { getGenericStoreValue, setGenericStoreValue } from './store'

interface RateLimitBucket {
  count: number
  createdAt: string
}

export async function enforceRateLimit(path: string, clientId: string): Promise<void> {
  const bucketWindow = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000))
  const key = `${path}:${clientId}:${bucketWindow}`
  const current = await getGenericStoreValue<RateLimitBucket>('rate-limit', key)

  if (current && current.count >= RATE_LIMIT_MAX_REQUESTS) {
    throw new HttpError('アクセスが集中しています。少し待ってから再度お試しください。', 429)
  }

  await setGenericStoreValue<RateLimitBucket>('rate-limit', key, {
    count: (current?.count ?? 0) + 1,
    createdAt: current?.createdAt ?? new Date().toISOString(),
  })
}
