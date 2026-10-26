import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

// Execute the child-process check itself without building or launching a packaged app.
const source = readFileSync('scripts/verify-packaged-app.mjs', 'utf8')
const check = source.match(/const output = execFileSync\([\s\S]*?`([\s\S]*?)`,/u)?.[1]
assert.ok(check, 'Packaged runtime check script is missing')

describe('packaged dependency checks', () => {
  it.each(['linux', 'win32', 'darwin'])(
    'checks the runtime dependencies for %s',
    async (platform) => {
      const close = vi.fn()
      const database = vi.fn(function () {
        return {
          exec: vi.fn(),
          prepare: () => ({ get: () => ({ value: 42 }) }),
          close
        }
      })
      const metadata = vi.fn(async () => ({ width: 2 }))
      const sharp = vi.fn(() => ({
        png: () => ({ toBuffer: async () => Buffer.from('png') }),
        metadata
      }))
      const load = vi.fn((id: string) => {
        if (id === 'node:assert/strict') return assert
        if (id === 'node:path') return path
        if (id.endsWith(path.join('node_modules', 'better-sqlite3'))) return database
        if (id.endsWith(path.join('node_modules', 'sharp'))) {
          assert.notEqual(platform, 'linux', 'Linux must use the separate WebAssembly check')
          return sharp
        }
        throw new Error(`Unexpected dependency: ${id}`)
      })
      const log = vi.fn()
      const error = vi.fn()
      const childProcess = { platform, arch: 'x64', argv: ['electron', '/app', 'x64'], exitCode: 0 }
      runInNewContext(check, { require: load, process: childProcess, console: { log, error } })

      expect(database).toHaveBeenCalledWith(':memory:')
      expect(close).toHaveBeenCalledOnce()
      expect(log).toHaveBeenCalledWith(`Packaged SQLite runtime passed: ${platform} x64`)
      if (platform === 'linux') {
        expect(sharp).not.toHaveBeenCalled()
      } else {
        await vi.waitFor(() =>
          expect(log).toHaveBeenCalledWith(`Packaged native sharp passed: ${platform} x64`)
        )
        expect(metadata).toHaveBeenCalledOnce()
      }
      expect(error).not.toHaveBeenCalled()
      expect(childProcess.exitCode).toBe(0)
    }
  )
})
