import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getStore } from '@netlify/blobs'
import { ANALYSIS_CACHE_TTL_SECONDS } from '../../../shared/constants'
import type { AnalysisJobRecord, AnalysisResult } from '../../../shared/types'

type MemoryStores = Map<string, Map<string, unknown>>
type StorageMode =
  | 'blobs-with-filesystem-fallback'
  | 'filesystem-fallback'

interface CachedAnalysisEnvelope {
  storedAt: string
  result: AnalysisResult
}

const NETLIFY_TASK_ROOT = '/var/task'
const NETLIFY_TMP_RUNTIME_ROOT = '/tmp/runtime'

function isRunningOnHostedNetlify(): boolean {
  return Boolean(process.env.NETLIFY && !process.env.NETLIFY_LOCAL)
}

function prefersBlobStore(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_LOCAL)
}

function shouldUseNetlifyTmpRuntime(): boolean {
  if (process.env.NETLIFY_LOCAL) {
    return false
  }

  const currentWorkingDirectory = process.cwd()
  const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT ?? ''

  return (
    currentWorkingDirectory.startsWith(NETLIFY_TASK_ROOT) ||
    lambdaTaskRoot.startsWith(NETLIFY_TASK_ROOT)
  )
}

export function resolveRuntimeRoot(): string {
  return shouldUseNetlifyTmpRuntime()
    ? NETLIFY_TMP_RUNTIME_ROOT
    : path.resolve(process.cwd(), 'runtime')
}

export function resolveFallbackRoot(): string {
  return shouldUseNetlifyTmpRuntime()
    ? path.posix.join(NETLIFY_TMP_RUNTIME_ROOT, 'local-store')
    : path.resolve(resolveRuntimeRoot(), 'local-store')
}

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
  return path.join(resolveFallbackRoot(), storeName, `${encodeURIComponent(key)}.json`)
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

async function canUseBlobStore(): Promise<boolean> {
  if (!isRunningOnHostedNetlify()) {
    return true
  }

  const key = `blob-probe:${Date.now()}`

  try {
    const store = getStore('healthz-probe')
    await store.setJSON(key, { checkedAt: new Date().toISOString() })
    const value = await store.get(key, { type: 'json' })
    const deletableStore = store as typeof store & {
      delete?: (entryKey: string) => Promise<unknown>
    }

    if (typeof deletableStore.delete === 'function') {
      await deletableStore.delete(key)
    }

    return Boolean(value)
  } catch {
    return false
  }
}

async function getJson<T>(storeName: string, key: string): Promise<T | null> {
  if (prefersBlobStore()) {
    try {
      const store = getStore(storeName)
      return (await store.get(key, { type: 'json' })) as T | null
    } catch {
      if (isRunningOnHostedNetlify()) {
        console.warn(createBlobsUnavailableError().message)
      }
    }
  }

  return getFileJson<T>(storeName, key)
}

async function setJson<T>(storeName: string, key: string, value: T): Promise<void> {
  if (prefersBlobStore()) {
    try {
      const store = getStore(storeName)
      await store.setJSON(key, value)
      return
    } catch {
      if (isRunningOnHostedNetlify()) {
        console.warn(createBlobsUnavailableError().message)
      }
    }
  }

  await setFileJson(storeName, key, value)
}

async function deleteJson(storeName: string, key: string): Promise<void> {
  if (prefersBlobStore()) {
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
      if (isRunningOnHostedNetlify()) {
        console.warn(createBlobsUnavailableError().message)
      }
    }
  }

  await deleteFileJson(storeName, key)
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

export async function canUseBackgroundProcessing(): Promise<boolean> {
  if (!isRunningOnHostedNetlify()) {
    return true
  }

  return canUseBlobStore()
}

async function getStorageMode(): Promise<StorageMode> {
  if (process.env.NETLIFY_LOCAL) {
    return 'blobs-with-filesystem-fallback'
  }

  if (!prefersBlobStore()) {
    return 'filesystem-fallback'
  }

  return (await canUseBackgroundProcessing())
    ? 'blobs-with-filesystem-fallback'
    : 'filesystem-fallback'
}

export async function probeStorage(): Promise<{
  ok: boolean
  mode: StorageMode
  backgroundProcessing: boolean
  error?: string
}> {
  const backgroundProcessing = await canUseBackgroundProcessing()
  const mode = await getStorageMode()
  const key = `healthz:${Date.now()}`

  try {
    await setGenericStoreValue('healthz-probe', key, { checkedAt: new Date().toISOString() })
    await getGenericStoreValue('healthz-probe', key)
    await deleteGenericStoreValue('healthz-probe', key)
    return {
      ok: true,
      mode,
      backgroundProcessing,
    }
  } catch (error) {
    return {
      ok: false,
      mode,
      backgroundProcessing,
      error: error instanceof Error ? error.message : 'storage probe failed',
    }
  }
}
