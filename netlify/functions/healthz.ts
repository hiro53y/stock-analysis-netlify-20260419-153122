import { jsonResponse } from './lib/http'
import { probeStorage } from './lib/store'

export default async (): Promise<Response> => {
  const storage = await probeStorage()
  const payload = {
    ok: storage.ok,
    env: {
      node: typeof process !== 'undefined' ? process.version : 'unknown',
      netlify: Boolean(process.env.NETLIFY || process.env.NETLIFY_LOCAL),
    },
    netlify: {
      backgroundFunctionsConfigured: true,
      redirectsConfigured: true,
    },
    storage: {
      mode: storage.mode,
      error: storage.error,
    },
    cache: {
      cacheApi: typeof caches !== 'undefined',
    },
  }

  return jsonResponse(payload, storage.ok ? 200 : 503)
}
