import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getStore } from '@netlify/blobs'
import { ANALYSIS_CACHE_TTL_SECONDS } from '../../../shared/constants'
import type { AnalysisJobRecord, AnalysisResult } from '../../../shared/types'

type MemoryStores = Map<string, Map<string, unknown>>
type StorageMode =
  | 'blobs-required'
  | 'blobs-with-filesystem-fallback'
  | 'filesystem-fallback'

interface CachedAnalysisEnvelope {
  storedAt: string
  result: AnalysisResult
}

const FALLBACK_ROOT = path.resolve(process.cwd(), 'runtime', 'local-store')
const runningOnHostedNetlify = Boolean(process.env.NETLIFY && !process.env.NETLIFY_LOCAL)

function getMemoryStores(): MemoryStores {
  const scoped = globalThis as typeof globalThis & {
    __stockAnalysisStores?: MemoryStores
  }

  if (!scoped.__stockAnalysisStores) {
    scoped.__stockAnalysisStores = new Map()
  }

  return scoped.__stockAnalysisStores
}

function getMemoryStore(name: string): Map<string, unknown> {
  const stores = getMemoryStores()
  if (!stores.has(name)) {
    stores.set(name, new Map())
  }
  return stores.get(name)!
}

function getFallbackFilePath(storeName: string, key: string): string {
  return path.join(FALLBACK_ROOT, storeName, `${encodeURIComponent(key)}.json`)
}

async function getFileJson<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const raw = await readFile(getFallbackFilePath(storeName, key), 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null
    }

    return (getMemoryStore(storeName).get(key) as T | undefined) ?? null
  }
}

async function setFileJson<T>(storeName: string, key: string, value: T): Promise<void> {
  const fallbackPath = getFallbackFilePath(storeName, key)
  await mkdir(path.dirname(fallbackPath), { recursive: true })
  await writeFile(fallbackPath, JSON.stringify(value, null, 2), 'utf8')
  getMemoryStore(storeName).set(key, value)
}

async function deleteFileJson(storeName: string, key: string): Promise<void> {
  await rm(getFallbackFilePath(storeName, key), { force: true }).catch(() => {})
  getMemoryStore(storeName).delete(key)
}

function createBlobsUnavailableError(): Error {
  return new Error('Netlify Blobs に接続できません。サイト設定と環境変数を確認してください。')
}

async function getJson<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const store = getStore(storeName)
    return (await store.get(key, { type: 'json' })) as T | null
  } catch {
    if (runningOnHostedNetlify) {
      throw createBlobsUnavailableError()
    }

    return getFileJson<T>(storeName, key)
  }
}

async function setJson<T>(storeName: string, key: string, value: T): Promise<void> {
  try {
    const store = getStore(storeName)
    await store.setJSON(key, value)
    return
  } catch {
    if (runningOnHostedNetlify) {
      throw createBlobsUnavailableError()
    }

    await setFileJson(storeName, key, value)
  }
}

async function deleteJson(storeName: string, key: string): Promise<void> {
  try {
    const store = getStore(storeName)
    const deletableStore = store as typeof store & {
      delete?: (entryKey: string) => Promise<unknown>
    }

    if (typeof deletableStore.delete === 'function') {
      await deletableStore.delete(key)
      return
    }
  } catch {
    if (runningOnHostedNetlify) {
      throw createBlobsUnavailableError()
    }
  }

  if (!runningOnHostedNetlify) {
    await deleteFileJson(storeName, key)
  }
}

function isCachedAnalysisEnvelope(value: unknown): value is CachedAnalysisEnvelope {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<CachedAnalysisEnvelope>
  return typeof candidate.storedAt === 'string' && Boolean(candidate.result)
}

function isFreshTimestamp(value: string, ttlSeconds: number): boolean {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return false
  }

  return Date.now() - parsed <= ttlSeconds * 1000
}

export async function getJob(analysisId: string): Promise<AnalysisJobRecord | null> {
  return getJson<AnalysisJobRecord>('analysis-jobs', analysisId)
}

export async function setJob(job: AnalysisJobRecord): Promise<void> {
  await setJson('analysis-jobs', job.analysisId, job)
}

export async function updateJob(
  analysisId: string,
  patch: Partial<AnalysisJobRecord>,
): Promise<AnalysisJobRecord | null> {
  const current = await getJob(analysisId)
  if (!current) return null

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  await setJob(next)
  return next
}

export async function getCachedAnalysis(cacheKey: string): Promise<AnalysisResult | null> {
  const cached = await getJson<AnalysisResult | CachedAnalysisEnvelope>('analysis-cache', cacheKey)
  if (!cached) {
    return null
  }

  const envelope = isCachedAnalysisEnvelope(cached)
    ? cached
    : {
        storedAt: cached.generatedAt,
        result: cached,
      }

  const freshnessKey = envelope.result.generatedAt || envelope.storedAt
  if (!isFreshTimestamp(freshnessKey, ANALYSIS_CACHE_TTL_SECONDS)) {
    await deleteJson('analysis-cache', cacheKey).catch(() => {})
    return null
  }

  return envelope.result
}

export async function setCachedAnalysis(cacheKey: string, result: AnalysisResult): Promise<void> {
  await setJson<CachedAnalysisEnvelope>('analysis-cache', cacheKey, {
    storedAt: new Date().toISOString(),
    result,
  })
}

export async function getGenericStoreValue<T>(
  storeName: string,
  key: string,
): Promise<T | null> {
  return getJson<T>(storeName, key)
}

export async function setGenericStoreValue<T>(
  storeName: string,
  key: string,
  value: T,
): Promise<void> {
  await setJson(storeName, key, value)
}

export async function deleteGenericStoreValue(storeName: string, key: string): Promise<void> {
  await deleteJson(storeName, key)
}

export async function getInFlightAnalysis(cacheKey: string): Promise<string | null> {
  return getJson<string>('analysis-inflight', cacheKey)
}

export async function setInFlightAnalysis(cacheKey: string, analysisId: string): Promise<void> {
  await setJson('analysis-inflight', cacheKey, analysisId)
}

export async function clearInFlightAnalysis(cacheKey: string): Promise<void> {
  await deleteJson('analysis-inflight', cacheKey)
}

export function getStorageMode(): StorageMode {
  if (runningOnHostedNetlify) {
    return 'blobs-required'
  }

  return process.env.NETLIFY_LOCAL
    ? 'blobs-with-filesystem-fallback'
    : 'filesystem-fallback'
}

export async function probeStorage(): Promise<{
  ok: boolean
  mode: StorageMode
  error?: string
}> {
  const mode = getStorageMode()
  const key = `healthz:${Date.now()}`

  try {
    await setGenericStoreValue('healthz-probe', key, { checkedAt: new Date().toISOString() })
    await getGenericStoreValue('healthz-probe', key)
    await deleteGenericStoreValue('healthz-probe', key)
    return {
      ok: true,
      mode,
    }
  } catch (error) {
    return {
      ok: false,
      mode,
      error: error instanceof Error ? error.message : 'storage probe failed',
    }
  }
}
