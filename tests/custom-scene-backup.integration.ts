import Database from 'better-sqlite3'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ db: null as Database.Database | null, root: '' }))
vi.mock('../src/main/db', () => ({ getDb: () => mocks.db }))
vi.mock('../src/main/db/settings', () => ({
  getSetting: (key: string) =>
    mocks.db!.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(key) ?? null,
  setSetting: (key: string, value: string) =>
    mocks.db!.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
}))
vi.mock('../src/main/images/storage', () => ({ libraryRoot: () => mocks.root }))

import { migrations } from '../src/main/db/migrations'
import { ensureSceneAdditionSchema } from '../src/main/db/scene-addition-schema'
import { ensureScenePlusSchema } from '../src/main/db/scene-plus-schema'
import { createNaisArchive, readNaisArchive } from '../src/main/backup/archive'
import {
  captureBackupDatabase,
  exportLegacyJson,
  importLegacyJson,
  restoreBackupDatabase
} from '../src/main/backup/repo'
import { CUSTOM_BACKUP_TABLES } from '../src/main/backup/types'
import { GenerationQueue } from '../src/main/queue/generation-queue'
import { applySceneCharacterAddition } from '../src/main/scenes/addition-repo'
import type { GenerationRequest } from '../src/shared/types'

let db: Database.Database

function customRows(): Record<string, unknown> {
  return Object.fromEntries(
    CUSTOM_BACKUP_TABLES.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()])
  )
}

beforeEach(() => {
  mocks.root = mkdtempSync(join(tmpdir(), 'nais-custom-backup-'))
  db = new Database(':memory:')
  mocks.db = db
  db.pragma('foreign_keys = ON')
  for (const migrate of migrations) migrate(db)
  ensureSceneAdditionSchema(db)
  ensureScenePlusSchema(db)
  const vibePath = join(mocks.root, 'vibe.png')
  const refPath = join(mocks.root, 'reference.png')
  writeFileSync(vibePath, 'vibe-data')
  writeFileSync(refPath, 'reference-data')
  db.exec(`
    INSERT INTO character_prompts (id, name, prompt) VALUES (1, 'Added', 'added character');
    INSERT INTO scene_presets (id, name) VALUES (10, 'Custom scenes');
    INSERT INTO gen_scenes (id, preset_id, name, prompt) VALUES (11, 10, 'Scene', 'scene prompt');
    INSERT INTO scene_character_additions (scene_id) VALUES (11);
    INSERT INTO scene_character_addition_prompts (scene_id, character_prompt_id) VALUES (11, 1);
    INSERT INTO scene_plus_scenes (id, preset_id, name, use_coords) VALUES (21, 1, 'Plus scene', 1);
    INSERT INTO scene_plus_slots (scene_id, slot_index, prompt, center_x, center_y)
      VALUES (21, 1, 'slot prompt', 0.176, 0.21);
    INSERT INTO scene_plus_casts (id, name, character_prompt_id) VALUES (31, 'Plus cast', 1);
    INSERT INTO scene_plus_cast_groups (id, name) VALUES (41, 'Plus group');
    INSERT INTO scene_plus_cast_group_members (group_id, cast_id) VALUES (41, 31);
    UPDATE scene_plus_cast_settings SET slot_count = 2 WHERE id = 1;
    INSERT INTO scene_plus_cast_slots (slot_index, cast_id) VALUES (1, 31);
    INSERT INTO scene_plus_cast_slots (slot_index, group_id) VALUES (2, 41);
    INSERT INTO settings (key, value) VALUES ('scene_additions_enabled', '1');
    INSERT INTO settings (key, value) VALUES ('scene_casts', '[{"id":"cast","name":"Saved"}]');
    INSERT INTO settings (key, value) VALUES ('nai_token', 'SECRET');
  `)
  db.prepare('INSERT INTO vibe_images (id, name, file_path) VALUES (1, ?, ?)').run('Vibe', vibePath)
  db.prepare('INSERT INTO charref_images (id, name, file_path) VALUES (1, ?, ?)').run(
    'Ref',
    refPath
  )
  db.exec(`
    INSERT INTO scene_character_addition_charrefs (scene_id, charref_id) VALUES (11, 1);
    INSERT INTO scene_character_addition_vibes (scene_id, vibe_id) VALUES (11, 1);
    INSERT INTO scene_plus_cast_charrefs (cast_id, charref_id) VALUES (31, 1);
    INSERT INTO scene_plus_cast_vibes (cast_id, vibe_id) VALUES (31, 1);
  `)
})

afterEach(() => {
  db.close()
  mocks.db = null
  rmSync(mocks.root, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('custom scene data during upstream backup integration', () => {
  it.each(['nais', 'json'])('restores all scene+ and addition tables from %s', async (format) => {
    const expected = customRows()
    const { database, skippedFiles } = captureBackupDatabase()
    expect(skippedFiles).toBe(0)
    const backup =
      format === 'nais'
        ? await readNaisArchive(await createNaisArchive(database, '1.0.27'))
        : exportLegacyJson()
    expect(JSON.stringify(backup)).not.toContain('SECRET')
    db.exec("UPDATE settings SET value = '0' WHERE key = 'scene_additions_enabled'")
    for (const table of [...CUSTOM_BACKUP_TABLES].reverse())
      db.prepare(`DELETE FROM ${table}`).run()
    const result =
      format === 'nais'
        ? restoreBackupDatabase(backup as typeof database)
        : importLegacyJson(backup as Record<string, unknown>)
    expect(result.imported).toBeGreaterThan(0)
    expect(customRows()).toEqual(expected)
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(
      db.prepare("SELECT value FROM settings WHERE key = 'scene_additions_enabled'").pluck().get()
    ).toBe('1')
    expect(db.prepare("SELECT value FROM settings WHERE key = 'nai_token'").pluck().get()).toBe(
      'SECRET'
    )
    const restoredPath = db
      .prepare('SELECT file_path FROM vibe_images WHERE id = 1')
      .pluck()
      .get() as string
    expect(readFileSync(restoredPath).toString()).toBe('vibe-data')
  })

  it('rejects a missing composite key before changing the database', () => {
    const { database } = captureBackupDatabase()
    delete database.tables.scene_plus_slots![0].slot_index
    const before = customRows()
    expect(() => restoreBackupDatabase(database)).toThrow(
      'scene_plus_slots row is missing a numeric slot_index'
    )
    expect(customRows()).toEqual(before)
  })

  it('reports a missing reference source instead of producing an unrestorable custom backup', () => {
    rmSync(join(mocks.root, 'vibe.png'))
    const before = customRows()
    expect(() => captureBackupDatabase()).toThrow('has no source image')
    expect(() => importLegacyJson(exportLegacyJson())).toThrow('has no source image')
    expect(customRows()).toEqual(before)
  })

  it('keeps scene additions after choosing a random base character for each image', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.9)
    const generate = vi.fn(async () => '/image.png')
    const queue = new GenerationQueue(generate)
    queue.setDelayMs(0)
    queue.enqueue(
      {
        model: 'nai-diffusion-5-full',
        sceneId: 11,
        seed: 42,
        characterPrompts: [],
        charRefIds: [],
        vibeIds: []
      } as unknown as GenerationRequest,
      2,
      [
        { prompt: 'alpha', negativePrompt: '', enabled: true },
        { prompt: 'beta', negativePrompt: '', enabled: true }
      ],
      applySceneCharacterAddition
    )
    await vi.waitFor(() =>
      expect(queue.status().items.map((item) => item.state)).toEqual(['done', 'done'])
    )
    expect(
      queue
        .status()
        .items.map((item) => item.request.characterPrompts.map((character) => character.prompt))
    ).toEqual([
      ['alpha', 'added character'],
      ['beta', 'added character']
    ])
    expect(queue.status().items.map((item) => item.request.seed)).toEqual([42, 43])
    expect(queue.status().items[0].request).toMatchObject({ charRefIds: [1], vibeIds: [1] })
  })
})
