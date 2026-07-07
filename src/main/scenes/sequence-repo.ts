import type {
  CharacterPromptInput,
  GenerationRequest,
  Scene,
  SceneCharacterAddition,
  SceneGenerationOptions,
  SceneSequenceEntry
} from '../../shared/types'
import { getDb } from '../db'
import { getScene } from './repo'

type LinkKind = 'prompts' | 'charrefs' | 'vibes'
type AdditionLinkKind = 'prompts' | 'charrefs' | 'vibes'

const ENTRY_LINKS: Record<LinkKind, { table: string; idColumn: string }> = {
  prompts: { table: 'scene_sequence_entry_prompts', idColumn: 'character_prompt_id' },
  charrefs: { table: 'scene_sequence_entry_charrefs', idColumn: 'charref_id' },
  vibes: { table: 'scene_sequence_entry_vibes', idColumn: 'vibe_id' }
}

const ADDITION_LINKS: Record<AdditionLinkKind, { table: string; idColumn: string }> = {
  prompts: { table: 'scene_character_addition_prompts', idColumn: 'character_prompt_id' },
  charrefs: { table: 'scene_character_addition_charrefs', idColumn: 'charref_id' },
  vibes: { table: 'scene_character_addition_vibes', idColumn: 'vibe_id' }
}

interface EntryRow {
  id: number
  name: string
  enabled: number
}

interface CharRow {
  prompt: string
  negative_prompt: string
  center_x: number
  center_y: number
}

function unique(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
}

function idsForEntry(entryId: number, kind: LinkKind): number[] {
  const { table, idColumn } = ENTRY_LINKS[kind]
  return (
    getDb()
      .prepare(`SELECT ${idColumn} AS id FROM ${table} WHERE entry_id = ? ORDER BY sort_order`)
      .all(entryId) as { id: number }[]
  ).map((r) => r.id)
}

function idsForAddition(sceneId: number, kind: AdditionLinkKind): number[] {
  const { table, idColumn } = ADDITION_LINKS[kind]
  return (
    getDb()
      .prepare(`SELECT ${idColumn} AS id FROM ${table} WHERE scene_id = ? ORDER BY sort_order`)
      .all(sceneId) as { id: number }[]
  ).map((r) => r.id)
}

function replaceEntryLinks(entryId: number, kind: LinkKind, ids: number[]): void {
  const db = getDb()
  const { table, idColumn } = ENTRY_LINKS[kind]
  db.prepare(`DELETE FROM ${table} WHERE entry_id = ?`).run(entryId)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${table} (entry_id, ${idColumn}, sort_order) VALUES (?, ?, ?)`
  )
  unique(ids).forEach((id, i) => insert.run(entryId, id, i))
}

function replaceAdditionLinks(sceneId: number, kind: AdditionLinkKind, ids: number[]): void {
  const db = getDb()
  const { table, idColumn } = ADDITION_LINKS[kind]
  db.prepare(`DELETE FROM ${table} WHERE scene_id = ?`).run(sceneId)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${table} (scene_id, ${idColumn}, sort_order) VALUES (?, ?, ?)`
  )
  unique(ids).forEach((id, i) => insert.run(sceneId, id, i))
}

export function getSceneGenerationOptions(): SceneGenerationOptions {
  const rows = getDb().prepare('SELECT key, value FROM scene_generation_options').all() as {
    key: string
    value: string
  }[]
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    sequenceEnabled: map.get('sequenceEnabled') === '1',
    additionsEnabled: map.get('additionsEnabled') === '1'
  }
}

export function setSceneGenerationOptions(patch: Partial<SceneGenerationOptions>): void {
  const db = getDb()
  const set = db.prepare(
    `INSERT INTO scene_generation_options (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  )
  if (patch.sequenceEnabled !== undefined)
    set.run('sequenceEnabled', patch.sequenceEnabled ? '1' : '0')
  if (patch.additionsEnabled !== undefined)
    set.run('additionsEnabled', patch.additionsEnabled ? '1' : '0')
}

export function listSceneSequenceEntries(): SceneSequenceEntry[] {
  const rows = getDb()
    .prepare('SELECT id, name, enabled FROM scene_sequence_entries ORDER BY sort_order, id')
    .all() as EntryRow[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled === 1,
    characterPromptIds: idsForEntry(r.id, 'prompts'),
    charRefIds: idsForEntry(r.id, 'charrefs'),
    vibeIds: idsForEntry(r.id, 'vibes')
  }))
}

export function createSceneSequenceEntry(name?: string): number {
  const db = getDb()
  const max = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM scene_sequence_entries')
    .get() as {
    m: number
  }
  return Number(
    db
      .prepare('INSERT INTO scene_sequence_entries (name, sort_order) VALUES (?, ?)')
      .run(name?.trim() || `Queue Repeat ${max.m + 1}`, max.m + 1).lastInsertRowid
  )
}

export function updateSceneSequenceEntry(
  id: number,
  patch: Partial<Omit<SceneSequenceEntry, 'id'>>
): void {
  const db = getDb()
  db.transaction(() => {
    const sets: string[] = []
    const values: unknown[] = []
    if (patch.name !== undefined) {
      sets.push('name = ?')
      values.push(patch.name)
    }
    if (patch.enabled !== undefined) {
      sets.push('enabled = ?')
      values.push(patch.enabled ? 1 : 0)
    }
    if (sets.length) {
      db.prepare(`UPDATE scene_sequence_entries SET ${sets.join(', ')} WHERE id = ?`).run(
        ...values,
        id
      )
    }
    if (patch.characterPromptIds !== undefined)
      replaceEntryLinks(id, 'prompts', patch.characterPromptIds)
    if (patch.charRefIds !== undefined) replaceEntryLinks(id, 'charrefs', patch.charRefIds)
    if (patch.vibeIds !== undefined) replaceEntryLinks(id, 'vibes', patch.vibeIds)
  })()
}

export function deleteSceneSequenceEntry(id: number): void {
  getDb().prepare('DELETE FROM scene_sequence_entries WHERE id = ?').run(id)
}

export function reorderSceneSequenceEntries(ids: number[]): void {
  const stmt = getDb().prepare('UPDATE scene_sequence_entries SET sort_order = ? WHERE id = ?')
  getDb().transaction(() => ids.forEach((id, i) => stmt.run(i, id)))()
}

export function getSceneCharacterAddition(sceneId: number): SceneCharacterAddition | null {
  const exists = getDb()
    .prepare('SELECT scene_id FROM scene_character_additions WHERE scene_id = ?')
    .get(sceneId)
  if (!exists) return null
  const addition = {
    sceneId,
    characterPromptIds: idsForAddition(sceneId, 'prompts'),
    charRefIds: idsForAddition(sceneId, 'charrefs'),
    vibeIds: idsForAddition(sceneId, 'vibes')
  }
  return addition.characterPromptIds.length || addition.charRefIds.length || addition.vibeIds.length
    ? addition
    : null
}

export function setSceneCharacterAddition(addition: SceneCharacterAddition): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO scene_character_additions (scene_id) VALUES (?)').run(
      addition.sceneId
    )
    replaceAdditionLinks(addition.sceneId, 'prompts', addition.characterPromptIds)
    replaceAdditionLinks(addition.sceneId, 'charrefs', addition.charRefIds)
    replaceAdditionLinks(addition.sceneId, 'vibes', addition.vibeIds)
    const hasAny =
      addition.characterPromptIds.length || addition.charRefIds.length || addition.vibeIds.length
    if (!hasAny)
      db.prepare('DELETE FROM scene_character_additions WHERE scene_id = ?').run(addition.sceneId)
  })()
}

export function clearSceneCharacterAddition(sceneId: number): void {
  getDb().prepare('DELETE FROM scene_character_additions WHERE scene_id = ?').run(sceneId)
}

function characterPromptsByIds(ids: number[]): CharacterPromptInput[] {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT id, prompt, negative_prompt, center_x, center_y
       FROM character_prompts WHERE id IN (${placeholders})`
    )
    .all(...ids) as (CharRow & { id: number })[]
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is CharRow & { id: number } => Boolean(r?.prompt.trim()))
    .map((r) => ({
      prompt: r.prompt,
      negativePrompt: r.negative_prompt,
      center: { x: r.center_x, y: r.center_y },
      enabled: true
    }))
}

function appendPrompt(base: string, add: string): string {
  const b = base.trim().replace(/,\s*$/, '')
  const a = add.trim().replace(/^,\s*/, '')
  if (!b) return a
  if (!a) return b
  return `${b}, ${a}`
}

function enabledCharRefIds(): number[] {
  return (
    getDb()
      .prepare('SELECT id FROM charref_images WHERE enabled = 1 ORDER BY sort_order, id')
      .all() as { id: number }[]
  ).map((r) => r.id)
}

function enabledVibeIds(): number[] {
  return (
    getDb()
      .prepare('SELECT id FROM vibe_images WHERE enabled = 1 ORDER BY sort_order, id')
      .all() as { id: number }[]
  ).map((r) => r.id)
}

function sceneRequest(
  base: GenerationRequest,
  scene: Scene,
  prompts: CharacterPromptInput[],
  charRefIds: number[],
  vibeIds: number[]
): GenerationRequest {
  return {
    ...base,
    seed: base.seed >= 0 ? base.seed : Math.floor(Math.random() * 4294967295),
    prompt: appendPrompt(base.prompt, scene.prompt),
    negativePrompt: appendPrompt(base.negativePrompt, scene.negativePrompt),
    width: base.source ? base.width : scene.width,
    height: base.source ? base.height : scene.height,
    characterPrompts: prompts,
    charRefIds,
    vibeIds,
    sceneId: scene.id
  }
}

export function buildReservedSceneRequests(
  presetId: number,
  base: GenerationRequest
): { requests: GenerationRequest[]; skippedEmptyEntries: number } {
  const db = getDb()
  const reserved = db
    .prepare(
      'SELECT id, reserve_count FROM gen_scenes WHERE preset_id = ? AND reserve_count > 0 ORDER BY sort_order, id'
    )
    .all(presetId) as { id: number; reserve_count: number }[]
  if (!reserved.length) return { requests: [], skippedEmptyEntries: 0 }

  const options = getSceneGenerationOptions()
  const additionsEnabled = options.additionsEnabled
  const entries = options.sequenceEnabled ? listSceneSequenceEntries().filter((e) => e.enabled) : []
  let skippedEmptyEntries = 0
  const requests: GenerationRequest[] = []

  const buildForScene = (scene: Scene, entry: SceneSequenceEntry | null): void => {
    const addition = additionsEnabled ? getSceneCharacterAddition(scene.id) : null
    const promptIds = entry ? entry.characterPromptIds : []
    const basePrompts = entry ? characterPromptsByIds(promptIds) : base.characterPrompts
    const addPrompts = addition ? characterPromptsByIds(addition.characterPromptIds) : []
    const prompts = [...basePrompts, ...addPrompts].slice(0, 6)
    const charRefIds = unique([
      ...(entry?.charRefIds ?? base.charRefIds ?? enabledCharRefIds()),
      ...(addition?.charRefIds ?? [])
    ])
    const vibeIds = unique([
      ...(entry?.vibeIds ?? base.vibeIds ?? enabledVibeIds()),
      ...(addition?.vibeIds ?? [])
    ])
    requests.push(sceneRequest(base, scene, prompts, charRefIds, vibeIds))
  }

  for (const item of reserved) {
    const scene = getScene(item.id)
    if (!scene) continue
    for (let i = 0; i < item.reserve_count; i++) {
      if (entries.length) {
        for (const entry of entries) {
          const isEmpty =
            !entry.characterPromptIds.length && !entry.charRefIds.length && !entry.vibeIds.length
          if (isEmpty) {
            skippedEmptyEntries++
            continue
          }
          buildForScene(scene, entry)
        }
      } else {
        buildForScene(scene, null)
      }
    }
  }

  db.prepare(
    'UPDATE gen_scenes SET reserve_count = 0 WHERE preset_id = ? AND reserve_count > 0'
  ).run(presetId)
  return { requests, skippedEmptyEntries }
}
