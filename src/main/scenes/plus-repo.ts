import type { GenerationQueue } from '../queue/generation-queue'
import { BrowserWindow, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import type {
  CharacterPromptInput,
  GenerationRequest,
  ScenePlusCast,
  ScenePlusCastGroup,
  ScenePlusCastSettings,
  ScenePlusPreset,
  ScenePlusScene,
  ScenePlusSlot,
  SceneImage
} from '../../shared/types'
import { applyScenePlusRequest } from '../../shared/scene-plus-request'
import { normalizeScenePlusPresetImport } from '../../shared/scene-plus-preset'
import { getDb } from '../db'
import { extname } from 'path'
import { zipFiles } from './repo'

function ids(table: string, owner: string, ownerId: number, column: string): number[] {
  return (
    getDb()
      .prepare(`SELECT ${column} AS id FROM ${table} WHERE ${owner} = ? ORDER BY sort_order, id`)
      .all(ownerId) as { id: number }[]
  ).map((row) => row.id)
}

function replaceIds(
  table: string,
  owner: string,
  ownerId: number,
  column: string,
  values: number[]
): void {
  const db = getDb()
  db.prepare(`DELETE FROM ${table} WHERE ${owner} = ?`).run(ownerId)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${table} (${owner}, ${column}, sort_order) VALUES (?, ?, ?)`
  )
  ;[...new Set(values)].forEach((id, index) => insert.run(ownerId, id, index))
}

export function listPlusCasts(): ScenePlusCast[] {
  const rows = getDb()
    .prepare('SELECT id, name, character_prompt_id FROM scene_plus_casts ORDER BY sort_order, id')
    .all() as { id: number; name: string; character_prompt_id: number | null }[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    characterPromptId: row.character_prompt_id,
    charRefIds: ids('scene_plus_cast_charrefs', 'cast_id', row.id, 'charref_id'),
    vibeIds: ids('scene_plus_cast_vibes', 'cast_id', row.id, 'vibe_id')
  }))
}

export function createPlusCast(data: Omit<ScenePlusCast, 'id'>): number {
  const db = getDb()
  const order = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM scene_plus_casts')
    .get() as {
    n: number
  }
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          'INSERT INTO scene_plus_casts (name, character_prompt_id, sort_order) VALUES (?, ?, ?)'
        )
        .run(data.name, data.characterPromptId, order.n + 1).lastInsertRowid
    )
    replaceIds('scene_plus_cast_charrefs', 'cast_id', id, 'charref_id', data.charRefIds)
    replaceIds('scene_plus_cast_vibes', 'cast_id', id, 'vibe_id', data.vibeIds)
    return id
  })()
}

export function updatePlusCast(id: number, patch: Partial<Omit<ScenePlusCast, 'id'>>): void {
  const db = getDb()
  db.transaction(() => {
    if (patch.name !== undefined)
      db.prepare('UPDATE scene_plus_casts SET name = ? WHERE id = ?').run(patch.name, id)
    if (patch.characterPromptId !== undefined)
      db.prepare('UPDATE scene_plus_casts SET character_prompt_id = ? WHERE id = ?').run(
        patch.characterPromptId,
        id
      )
    if (patch.charRefIds)
      replaceIds('scene_plus_cast_charrefs', 'cast_id', id, 'charref_id', patch.charRefIds)
    if (patch.vibeIds) replaceIds('scene_plus_cast_vibes', 'cast_id', id, 'vibe_id', patch.vibeIds)
  })()
}

export function deletePlusCast(id: number): void {
  getDb().prepare('DELETE FROM scene_plus_casts WHERE id = ?').run(id)
}

export function reorderPlusCasts(values: number[]): void {
  const update = getDb().prepare('UPDATE scene_plus_casts SET sort_order = ? WHERE id = ?')
  getDb().transaction(() => values.forEach((id, index) => update.run(index, id)))()
}

export function listPlusCastGroups(): ScenePlusCastGroup[] {
  const rows = getDb()
    .prepare('SELECT id, name FROM scene_plus_cast_groups ORDER BY sort_order, id')
    .all() as { id: number; name: string }[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    castIds: ids('scene_plus_cast_group_members', 'group_id', row.id, 'cast_id')
  }))
}

export function createPlusCastGroup(data: Omit<ScenePlusCastGroup, 'id'>): number {
  const db = getDb()
  const order = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM scene_plus_cast_groups')
    .get() as { n: number }
  return db.transaction(() => {
    const id = Number(
      db
        .prepare('INSERT INTO scene_plus_cast_groups (name, sort_order) VALUES (?, ?)')
        .run(data.name, order.n + 1).lastInsertRowid
    )
    replaceIds('scene_plus_cast_group_members', 'group_id', id, 'cast_id', data.castIds)
    return id
  })()
}

export function updatePlusCastGroup(
  id: number,
  patch: Partial<Omit<ScenePlusCastGroup, 'id'>>
): void {
  if (patch.name !== undefined)
    getDb().prepare('UPDATE scene_plus_cast_groups SET name = ? WHERE id = ?').run(patch.name, id)
  if (patch.castIds)
    replaceIds('scene_plus_cast_group_members', 'group_id', id, 'cast_id', patch.castIds)
}

export function deletePlusCastGroup(id: number): void {
  getDb().prepare('DELETE FROM scene_plus_cast_groups WHERE id = ?').run(id)
}

function assignments(): Record<number, number> {
  const rows = getDb()
    .prepare(
      'SELECT slot_index, cast_id FROM scene_plus_cast_slots WHERE cast_id IS NOT NULL ORDER BY slot_index'
    )
    .all() as { slot_index: number; cast_id: number }[]
  return Object.fromEntries(rows.map((row) => [row.slot_index, row.cast_id]))
}

function groupAssignments(): Record<number, number> {
  const rows = getDb()
    .prepare(
      'SELECT slot_index, group_id FROM scene_plus_cast_slots WHERE group_id IS NOT NULL ORDER BY slot_index'
    )
    .all() as { slot_index: number; group_id: number }[]
  return Object.fromEntries(rows.map((row) => [row.slot_index, row.group_id]))
}

export function listPlusPresets(): ScenePlusPreset[] {
  const rows = getDb()
    .prepare(
      'SELECT id, name, default_width, default_height FROM scene_plus_presets ORDER BY sort_order, id'
    )
    .all() as {
    id: number
    name: string
    default_width: number
    default_height: number
  }[]
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    defaultWidth: row.default_width,
    defaultHeight: row.default_height
  }))
}

export function createPlusPreset(name: string): number {
  const db = getDb()
  const order = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM scene_plus_presets')
    .get() as { n: number }
  return Number(
    db
      .prepare('INSERT INTO scene_plus_presets (name, sort_order) VALUES (?, ?)')
      .run(name, order.n + 1).lastInsertRowid
  )
}

export function updatePlusPreset(
  id: number,
  patch: Partial<Pick<ScenePlusPreset, 'name' | 'defaultWidth' | 'defaultHeight'>>
): void {
  const fields: string[] = []
  const values: unknown[] = []
  for (const [key, column] of [
    ['name', 'name'],
    ['defaultWidth', 'default_width'],
    ['defaultHeight', 'default_height']
  ] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${column} = ?`)
      values.push(patch[key])
    }
  }
  if (fields.length)
    getDb()
      .prepare(`UPDATE scene_plus_presets SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values, id)
}

export function deletePlusPreset(id: number): void {
  const db = getDb()
  const count = db.prepare('SELECT COUNT(*) AS n FROM scene_plus_presets').get() as { n: number }
  if (count.n > 1) db.prepare('DELETE FROM scene_plus_presets WHERE id = ?').run(id)
}

export function reorderPlusPresets(values: number[]): void {
  const update = getDb().prepare('UPDATE scene_plus_presets SET sort_order = ? WHERE id = ?')
  getDb().transaction(() => values.forEach((id, index) => update.run(index, id)))()
}

export function getPlusCastSettings(): ScenePlusCastSettings {
  const row = getDb()
    .prepare('SELECT slot_count FROM scene_plus_cast_settings WHERE id = 1')
    .get() as { slot_count: number }
  return {
    slotCount: row.slot_count,
    castAssignments: assignments(),
    groupAssignments: groupAssignments()
  }
}

export function setPlusCastSettings(settings: ScenePlusCastSettings): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE scene_plus_cast_settings SET slot_count = ? WHERE id = 1').run(
      Math.max(0, Math.floor(settings.slotCount))
    )
    db.prepare('DELETE FROM scene_plus_cast_slots').run()
    const insertCast = db.prepare(
      'INSERT INTO scene_plus_cast_slots (slot_index, cast_id) VALUES (?, ?)'
    )
    Object.entries(settings.castAssignments)
      .map(([slot, cast]) => [Number(slot), cast] as const)
      .filter(
        ([slot, cast]) => Number.isSafeInteger(slot) && slot > 0 && Number.isSafeInteger(cast)
      )
      .sort((a, b) => a[0] - b[0])
      .forEach(([slot, cast]) => insertCast.run(slot, cast))
    const insertGroup = db.prepare(
      'INSERT OR REPLACE INTO scene_plus_cast_slots (slot_index, group_id) VALUES (?, ?)'
    )
    Object.entries(settings.groupAssignments)
      .map(([slot, group]) => [Number(slot), group] as const)
      .filter(
        ([slot, group]) => Number.isSafeInteger(slot) && slot > 0 && Number.isSafeInteger(group)
      )
      .sort((a, b) => a[0] - b[0])
      .forEach(([slot, group]) => insertGroup.run(slot, group))
  })()
}

function sceneSlots(sceneId: number): ScenePlusSlot[] {
  const rows = getDb()
    .prepare(
      'SELECT slot_index, prompt, negative_prompt, center_x, center_y FROM scene_plus_slots WHERE scene_id = ? ORDER BY slot_index'
    )
    .all(sceneId) as {
    slot_index: number
    prompt: string
    negative_prompt: string
    center_x: number | null
    center_y: number | null
  }[]
  return rows.map((row) => ({
    index: row.slot_index,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    ...(row.center_x == null || row.center_y == null
      ? {}
      : { center: { x: row.center_x, y: row.center_y } })
  }))
}

type PlusSceneRow = {
  id: number
  preset_id: number
  name: string
  prompt: string
  negative_prompt: string
  width: number
  height: number
  use_coords: number
  reserve_count: number
  image_count: number
  thumbnail?: Buffer | null
  thumbnail_path?: string | null
}

function mapScene(row: PlusSceneRow): ScenePlusScene {
  return {
    id: row.id,
    presetId: row.preset_id,
    name: row.name,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    width: row.width,
    height: row.height,
    useCoords: row.use_coords === 1,
    slots: sceneSlots(row.id),
    reserveCount: row.reserve_count,
    imageCount: row.image_count,
    thumbnail: row.thumbnail?.toString('base64') ?? '',
    thumbnailPath: row.thumbnail_path ?? ''
  }
}

const SCENE_SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM scene_plus_images spi WHERE spi.scene_id = s.id) AS image_count,
    (SELECT i.thumbnail FROM scene_plus_images spi JOIN images i ON i.id = spi.image_id
      WHERE spi.scene_id = s.id ORDER BY i.favorite DESC, i.id DESC LIMIT 1) AS thumbnail,
    (SELECT i.file_path FROM scene_plus_images spi JOIN images i ON i.id = spi.image_id
      WHERE spi.scene_id = s.id ORDER BY i.favorite DESC, i.id DESC LIMIT 1) AS thumbnail_path
  FROM scene_plus_scenes s`

export function listPlusScenes(presetId: number): ScenePlusScene[] {
  return (
    getDb()
      .prepare(`${SCENE_SELECT} WHERE s.preset_id = ? ORDER BY s.sort_order, s.id`)
      .all(presetId) as PlusSceneRow[]
  ).map(mapScene)
}

export function getPlusScene(id: number): ScenePlusScene | null {
  const row = getDb().prepare(`${SCENE_SELECT} WHERE s.id = ?`).get(id) as PlusSceneRow | undefined
  return row ? mapScene(row) : null
}

export function createPlusScene(presetId: number, name: string): number {
  const db = getDb()
  const preset = db
    .prepare('SELECT default_width, default_height FROM scene_plus_presets WHERE id = ?')
    .get(presetId) as { default_width: number; default_height: number }
  const order = db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM scene_plus_scenes WHERE preset_id = ?')
    .get(presetId) as { n: number }
  return db.transaction(() => {
    const id = Number(
      db
        .prepare(
          'INSERT INTO scene_plus_scenes (preset_id, name, width, height, sort_order) VALUES (?, ?, ?, ?, ?)'
        )
        .run(presetId, name, preset.default_width, preset.default_height, order.n + 1)
        .lastInsertRowid
    )
    db.prepare('INSERT INTO scene_plus_slots (scene_id, slot_index) VALUES (?, 1)').run(id)
    return id
  })()
}

function replaceSlots(sceneId: number, slots: ScenePlusSlot[]): void {
  const db = getDb()
  db.prepare('DELETE FROM scene_plus_slots WHERE scene_id = ?').run(sceneId)
  const insert = db.prepare(
    `INSERT INTO scene_plus_slots
      (scene_id, slot_index, prompt, negative_prompt, center_x, center_y)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  slots.forEach((slot, i) =>
    insert.run(
      sceneId,
      i + 1,
      slot.prompt,
      slot.negativePrompt,
      slot.center?.x ?? null,
      slot.center?.y ?? null
    )
  )
}

export function updatePlusScene(
  id: number,
  patch: Partial<
    Pick<
      ScenePlusScene,
      'name' | 'prompt' | 'negativePrompt' | 'width' | 'height' | 'useCoords' | 'slots'
    >
  >
): void {
  const db = getDb()
  db.transaction(() => {
    const fields: string[] = []
    const values: unknown[] = []
    for (const [key, column] of [
      ['name', 'name'],
      ['prompt', 'prompt'],
      ['negativePrompt', 'negative_prompt'],
      ['width', 'width'],
      ['height', 'height']
    ] as const) {
      if (patch[key] !== undefined) {
        fields.push(`${column} = ?`)
        values.push(patch[key])
      }
    }
    if (patch.useCoords !== undefined) {
      fields.push('use_coords = ?')
      values.push(patch.useCoords ? 1 : 0)
    }
    if (fields.length)
      db.prepare(
        `UPDATE scene_plus_scenes SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`
      ).run(...values, id)
    if (patch.slots) replaceSlots(id, patch.slots)
  })()
}

export function duplicatePlusScene(id: number): number {
  const source = getPlusScene(id)
  if (!source) return 0
  const newId = createPlusScene(source.presetId, `${source.name} 복사`)
  updatePlusScene(newId, {
    prompt: source.prompt,
    negativePrompt: source.negativePrompt,
    width: source.width,
    height: source.height,
    useCoords: source.useCoords,
    slots: source.slots
  })
  return newId
}

export function deletePlusScene(id: number): void {
  getDb().prepare('DELETE FROM scene_plus_scenes WHERE id = ?').run(id)
}

export function reorderPlusScenes(values: number[]): void {
  const update = getDb().prepare('UPDATE scene_plus_scenes SET sort_order = ? WHERE id = ?')
  getDb().transaction(() => values.forEach((id, index) => update.run(index, id)))()
}

export function setPlusReserve(id: number, count: number): void {
  getDb()
    .prepare('UPDATE scene_plus_scenes SET reserve_count = ? WHERE id = ?')
    .run(Math.max(0, Math.min(9999, Math.floor(count))), id)
}

export function plusReservedTotal(): number {
  return (
    getDb().prepare('SELECT COALESCE(SUM(reserve_count), 0) AS n FROM scene_plus_scenes').get() as {
      n: number
    }
  ).n
}

function castActors(slotCount: number): {
  actors: (CharacterPromptInput | null)[]
  charRefIds: number[]
  vibeIds: number[]
} | null {
  const assigned = assignments()
  const assignedGroups = groupAssignments()
  if (!Object.keys(assigned).length && !Object.keys(assignedGroups).length) return null
  const db = getDb()
  const casts = new Map(listPlusCasts().map((cast) => [cast.id, cast]))
  const groups = new Map(listPlusCastGroups().map((group) => [group.id, group]))
  const maxGroupSlot = Math.max(
    0,
    ...Object.entries(assignedGroups).map(
      ([slot, groupId]) => Number(slot) + (groups.get(groupId)?.castIds.length ?? 1) - 1
    )
  )
  const maxSlot = Math.max(maxGroupSlot, 0, ...Object.keys(assigned).map(Number))
  const actors: (CharacterPromptInput | null)[] = Array.from({ length: maxSlot }, () => null)
  const charRefIds: number[] = []
  const vibeIds: number[] = []
  const applyCast = (slot: number, castId: number): void => {
    if (slot > slotCount) return
    const cast = casts.get(castId)
    if (!cast?.characterPromptId) return
    const character = db
      .prepare('SELECT prompt, negative_prompt FROM character_prompts WHERE id = ?')
      .get(cast.characterPromptId) as { prompt: string; negative_prompt: string } | undefined
    if (!character?.prompt.trim()) return
    actors[slot - 1] = {
      prompt: character.prompt,
      negativePrompt: character.negative_prompt,
      enabled: true
    }
    charRefIds.push(...cast.charRefIds)
    vibeIds.push(...cast.vibeIds)
  }
  for (const slot of Object.keys(assignedGroups)
    .map(Number)
    .sort((a, b) => a - b)) {
    groups
      .get(assignedGroups[slot])
      ?.castIds.forEach((castId, index) => applyCast(slot + index, castId))
  }
  for (const slot of Object.keys(assigned)
    .map(Number)
    .sort((a, b) => a - b))
    applyCast(slot, assigned[slot])
  return {
    actors,
    charRefIds: [...new Set(charRefIds)],
    vibeIds: [...new Set(vibeIds)]
  }
}

function buildPlusRequest(base: GenerationRequest, scene: ScenePlusScene): GenerationRequest {
  const fixed = castActors(scene.slots.length)
  return applyScenePlusRequest(
    base,
    scene,
    fixed?.actors ?? base.characterPrompts,
    fixed ? { charRefIds: fixed.charRefIds, vibeIds: fixed.vibeIds } : undefined
  )
}

export function enqueuePlusReserved(
  queue: GenerationQueue,
  base: GenerationRequest,
  seedLocked: boolean
): string[] {
  const db = getDb()
  const rows = db
    .prepare(`${SCENE_SELECT} WHERE s.reserve_count > 0 ORDER BY s.preset_id, s.sort_order, s.id`)
    .all() as PlusSceneRow[]
  const requests: GenerationRequest[] = []
  for (const row of rows) {
    const scene = mapScene(row)
    const built = buildPlusRequest(base, scene)
    for (let i = 0; i < scene.reserveCount; i++) {
      requests.push({
        ...built,
        seed:
          seedLocked && base.seed >= 0
            ? (base.seed + i) % 4294967296
            : Math.floor(Math.random() * 4294967295)
      })
    }
  }
  return queue.enqueueRequests(requests, () => {
    db.prepare('UPDATE scene_plus_scenes SET reserve_count = 0 WHERE reserve_count > 0').run()
  })
}

export function enqueuePlusOne(
  queue: GenerationQueue,
  sceneId: number,
  base: GenerationRequest
): string[] {
  const scene = getPlusScene(sceneId)
  if (!scene) return []
  return queue.enqueue(buildPlusRequest(base, scene), 1)
}

export function linkPlusImage(imageId: number, sceneId: number): void {
  getDb()
    .prepare('INSERT INTO scene_plus_images (image_id, scene_id) VALUES (?, ?)')
    .run(imageId, sceneId)
}

export function plusSceneImages(
  sceneId: number,
  limit: number,
  offset: number,
  favoritesOnly?: boolean
): { items: SceneImage[]; total: number } {
  const db = getDb()
  const favoriteClause = favoritesOnly ? ' AND i.favorite = 1' : ''
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM scene_plus_images spi
         JOIN images i ON i.id = spi.image_id
         WHERE spi.scene_id = ?${favoriteClause}`
      )
      .get(sceneId) as { count: number }
  ).count
  const rows = db
    .prepare(
      `SELECT i.id, i.file_path, i.thumbnail, i.seed, i.favorite
       FROM scene_plus_images spi JOIN images i ON i.id = spi.image_id
       WHERE spi.scene_id = ?${favoriteClause}
       ORDER BY i.id DESC LIMIT ? OFFSET ?`
    )
    .all(sceneId, limit, offset) as {
    id: number
    file_path: string
    thumbnail: Buffer | null
    seed: number | null
    favorite: number
  }[]
  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      thumbnail: row.thumbnail?.toString('base64') ?? '',
      seed: row.seed,
      favorite: row.favorite === 1
    }))
  }
}

export function getPlusPresetName(id: number): string | null {
  const row = getDb().prepare('SELECT name FROM scene_plus_presets WHERE id = ?').get(id) as
    { name: string } | undefined
  return row?.name ?? null
}

export async function exportPlusJson(presetId: number): Promise<boolean> {
  const preset = listPlusPresets().find((item) => item.id === presetId)
  if (!preset) return false
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showSaveDialog(win, {
    title: '씬+ 내보내기',
    defaultPath: 'nais3-scene-plus.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return false
  writeFileSync(
    result.filePath,
    JSON.stringify(
      {
        mode: 'scene-plus',
        version: 1,
        preset: {
          name: preset.name,
          defaultWidth: preset.defaultWidth,
          defaultHeight: preset.defaultHeight
        },
        scenes: listPlusScenes(presetId).map(
          ({ name, prompt, negativePrompt, width, height, useCoords, slots }) => ({
            name,
            prompt,
            negativePrompt,
            width,
            height,
            useCoords,
            slots
          })
        )
      },
      null,
      2
    ),
    'utf-8'
  )
  return true
}

export async function exportPlusZip(presetId: number): Promise<number> {
  const db = getDb()
  const scenes = db
    .prepare('SELECT id, name FROM scene_plus_scenes WHERE preset_id = ? ORDER BY sort_order, id')
    .all(presetId) as { id: number; name: string }[]
  const entries: { file_path: string; name: string }[] = []
  for (const scene of scenes) {
    const favorites = db
      .prepare(
        `SELECT i.file_path FROM scene_plus_images spi JOIN images i ON i.id = spi.image_id
         WHERE spi.scene_id = ? AND i.favorite = 1 ORDER BY i.id DESC`
      )
      .all(scene.id) as { file_path: string }[]
    const images = favorites.length
      ? favorites
      : (db
          .prepare(
            `SELECT i.file_path FROM scene_plus_images spi JOIN images i ON i.id = spi.image_id
             WHERE spi.scene_id = ? ORDER BY i.id DESC LIMIT 1`
          )
          .all(scene.id) as { file_path: string }[])
    const safeName = scene.name.replace(/[/\\:*?"<>|]/g, '_') || `scene_${scene.id}`
    images.forEach((image, index) => {
      const suffix = images.length > 1 ? `_${index + 1}` : ''
      entries.push({
        file_path: image.file_path,
        name: `${safeName}${suffix}${extname(image.file_path) || '.png'}`
      })
    })
  }
  const presetName = (getPlusPresetName(presetId) ?? '씬+').replace(/[/\\:*?"<>|]/g, '_')
  return zipFiles(entries, `${presetName}_${Date.now()}.zip`)
}

export async function importPlusJson(): Promise<{ presetId: number | null; count: number }> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(win, {
    title: '씬+ 불러오기',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths.length) return { presetId: null, count: 0 }
  const parsed = normalizeScenePlusPresetImport(
    JSON.parse(readFileSync(result.filePaths[0], 'utf-8'))
  )
  if (!parsed) throw new Error('씬+ 또는 기존 씬 프리셋 JSON 파일이 아닙니다.')
  const importedScenes = parsed.scenes
  const db = getDb()
  return db.transaction(() => {
    const presetId = createPlusPreset(
      parsed.preset.name?.trim() ||
        (parsed.legacyScenePreset ? '가져온 씬 프리셋' : '가져온 프리셋')
    )
    updatePlusPreset(presetId, {
      defaultWidth: parsed.preset.defaultWidth ?? importedScenes[0]?.width ?? 832,
      defaultHeight: parsed.preset.defaultHeight ?? importedScenes[0]?.height ?? 1216
    })
    let count = 0
    for (const source of importedScenes) {
      const id = createPlusScene(presetId, source.name)
      updatePlusScene(id, {
        prompt: source.prompt,
        negativePrompt: source.negativePrompt,
        width: source.width ?? parsed.preset.defaultWidth ?? 832,
        height: source.height ?? parsed.preset.defaultHeight ?? 1216,
        useCoords: source.useCoords,
        slots: source.slots
      })
      count++
    }
    return { presetId, count }
  })()
}
