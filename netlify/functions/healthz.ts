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
      backgroundFunctionsVerified: false,
      redirectsVerified: false,
      verificationNotes: {
        backgroundFunctions: 'healthz では background function の起動可否を実行確認していません。',
        redirects: 'healthz では redirect の到達性を実行確認していません。',
      },
    },
    storage: {
      mode: storage.mode,
      backgroundProcessing: storage.backgroundProcessing,
      error: storage.error,
    },
    cache: {
      cacheApi: typeof caches !== 'undefined',
    },
  }

  return jsonResponse(payload, storage.ok ? 200 : 503)
}
