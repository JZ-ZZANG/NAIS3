import type {
  CharacterPromptInput,
  GenerationRequest,
  SceneCharacterAddition
} from '../../shared/types'
import { getDb } from '../db'
import { getSetting } from '../db/settings'

type LinkKind = 'prompts' | 'charrefs' | 'vibes'

const LINKS: Record<LinkKind, { table: string; column: string }> = {
  prompts: { table: 'scene_character_addition_prompts', column: 'character_prompt_id' },
  charrefs: { table: 'scene_character_addition_charrefs', column: 'charref_id' },
  vibes: { table: 'scene_character_addition_vibes', column: 'vibe_id' }
}

function idsFor(sceneId: number, kind: LinkKind): number[] {
  const { table, column } = LINKS[kind]
  return (
    getDb()
      .prepare(`SELECT ${column} AS id FROM ${table} WHERE scene_id = ? ORDER BY sort_order, id`)
      .all(sceneId) as { id: number }[]
  ).map((row) => row.id)
}

function replaceLinks(sceneId: number, kind: LinkKind, ids: number[]): void {
  const db = getDb()
  const { table, column } = LINKS[kind]
  db.prepare(`DELETE FROM ${table} WHERE scene_id = ?`).run(sceneId)
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${table} (scene_id, ${column}, sort_order) VALUES (?, ?, ?)`
  )
  ids.forEach((id, index) => insert.run(sceneId, id, index))
}

export function getSceneCharacterAddition(sceneId: number): SceneCharacterAddition | null {
  const exists = getDb()
    .prepare('SELECT 1 FROM scene_character_additions WHERE scene_id = ?')
    .get(sceneId)
  if (!exists) return null
  const addition = {
    sceneId,
    characterPromptIds: idsFor(sceneId, 'prompts'),
    charRefIds: idsFor(sceneId, 'charrefs'),
    vibeIds: idsFor(sceneId, 'vibes')
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
    replaceLinks(addition.sceneId, 'prompts', addition.characterPromptIds)
    replaceLinks(addition.sceneId, 'charrefs', addition.charRefIds)
    replaceLinks(addition.sceneId, 'vibes', addition.vibeIds)
    if (
      !addition.characterPromptIds.length &&
      !addition.charRefIds.length &&
      !addition.vibeIds.length
    ) {
      db.prepare('DELETE FROM scene_character_additions WHERE scene_id = ?').run(addition.sceneId)
    }
  })()
}

export function clearSceneCharacterAddition(sceneId: number): void {
  getDb().prepare('DELETE FROM scene_character_additions WHERE scene_id = ?').run(sceneId)
}

function characterPromptsByIds(ids: number[]): CharacterPromptInput[] {
  if (!ids.length) return []
  const rows = getDb()
    .prepare(
      `SELECT id, prompt, negative_prompt, center_x, center_y
       FROM character_prompts WHERE id IN (${ids.map(() => '?').join(',')})`
    )
    .all(...ids) as {
    id: number
    prompt: string
    negative_prompt: string
    center_x: number
    center_y: number
  }[]
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (!row?.prompt.trim()) return []
    return [
      {
        prompt: row.prompt,
        negativePrompt: row.negative_prompt,
        center: { x: row.center_x, y: row.center_y },
        enabled: true
      }
    ]
  })
}

function unique(ids: number[]): number[] {
  return [...new Set(ids)]
}

function enabledIds(table: 'charref_images' | 'vibe_images'): number[] {
  return (
    getDb().prepare(`SELECT id FROM ${table} WHERE enabled = 1 ORDER BY sort_order, id`).all() as {
      id: number
    }[]
  ).map((row) => row.id)
}

/** 모든 씬 생성 경로에 공통으로 추가 설정을 합친다. */
export function applySceneCharacterAddition(request: GenerationRequest): GenerationRequest {
  if (request.sceneId == null || getSetting('scene_additions_enabled') !== '1') return request
  const addition = getSceneCharacterAddition(request.sceneId)
  if (!addition) return request
  return {
    ...request,
    characterPrompts: [
      ...request.characterPrompts,
      ...characterPromptsByIds(addition.characterPromptIds)
    ].slice(0, 6),
    charRefIds: unique([
      ...(request.charRefIds ?? enabledIds('charref_images')),
      ...addition.charRefIds
    ]),
    vibeIds: unique([...(request.vibeIds ?? enabledIds('vibe_images')), ...addition.vibeIds])
  }
}
