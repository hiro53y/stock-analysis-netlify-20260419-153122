import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  probeStorage: vi.fn(),
}))

vi.mock('./lib/store', () => ({
  probeStorage: mocked.probeStorage,
}))

import healthz from './healthz'

describe('healthz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('storage probe が失敗したときは 503 を返す', async () => {
    mocked.probeStorage.mockResolvedValue({
      ok: false,
      mode: 'blobs-required',
      error: 'Netlify Blobs に接続できません。',
    })

    const response = await healthz()
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      storage: {
        mode: 'blobs-required',
        error: 'Netlify Blobs に接続できません。',
      },
    })
    expect(response.status).toBe(503)
  })
})
