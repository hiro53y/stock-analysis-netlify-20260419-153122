import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(scriptDir, '..')

const runtimeCandidates = [
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? process.env.TEMP ?? os.tmpdir(), 'stock-analysis-netlify')
    : path.join(os.tmpdir(), 'stock-analysis-netlify'),
  path.join(appRoot, 'runtime'),
]

const resolveRuntimeRoot = async () => {
  for (const candidate of runtimeCandidates) {
    try {
      await mkdir(candidate, { recursive: true })
      return candidate
    } catch {
      // 次の候補へフォールバック
    }
  }

  throw new Error('Netlify 開発用の runtime ディレクトリを作成できませんでした。')
}

const runtimeRoot = await resolveRuntimeRoot()
const npmCacheDir = path.join(runtimeRoot, 'npm-cache')
const appDataDir = path.join(runtimeRoot, 'netlify-appdata')
const xdgConfigDir = path.join(runtimeRoot, 'netlify-config')

await Promise.all([
  mkdir(npmCacheDir, { recursive: true }),
  mkdir(appDataDir, { recursive: true }),
  mkdir(xdgConfigDir, { recursive: true }),
])

const env = {
  ...process.env,
  npm_config_cache: npmCacheDir,
  npm_config_ignore_scripts: 'true',
  APPDATA: appDataDir,
  XDG_CONFIG_HOME: xdgConfigDir,
}

const cliArgs = ['-y', 'netlify-cli@24.11.3', 'dev', ...process.argv.slice(2)]
const quoteForCmd = (value) => {
  if (/^[\w./:=@\-]+$/.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '""')}"`
}

const isWindows = process.platform === 'win32'
const command = isWindows ? 'cmd.exe' : 'npx'
const args = isWindows
  ? ['/d', '/s', '/c', ['npx', ...cliArgs].map(quoteForCmd).join(' ')]
  : cliArgs
const child = spawn(command, args, {
  cwd: appRoot,
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
