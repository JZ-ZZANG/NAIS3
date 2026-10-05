import type { ScenePlusSlot } from './types'

type JsonObject = Record<string, unknown>

export type ScenePlusPresetImport = {
  legacyScenePreset: boolean
  preset: {
    name?: string
    defaultWidth?: number
    defaultHeight?: number
  }
  scenes: {
    name: string
    prompt: string
    negativePrompt: string
    width?: number
    height?: number
    useCoords: boolean
    slots: ScenePlusSlot[]
  }[]
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 씬+ JSON과 기존 씬 프리셋 JSON을 씬+의 독립 데이터 구조로 정규화한다.
 * 기존 씬 파일은 캐릭터 슬롯 정보가 없으므로 빈 슬롯 하나로 시작한다.
 */
export function normalizeScenePlusPresetImport(value: unknown): ScenePlusPresetImport | null {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.scenes)) return null

  const legacyScenePreset = value.mode === undefined
  if (!legacyScenePreset && value.mode !== 'scene-plus') return null

  const presetSource = isObject(value.preset) ? value.preset : {}
  const preset = legacyScenePreset
    ? {}
    : {
        name: text(presetSource.name),
        defaultWidth: positiveNumber(presetSource.defaultWidth),
        defaultHeight: positiveNumber(presetSource.defaultHeight)
      }

  const scenes = value.scenes.map((rawScene, index) => {
    const source = isObject(rawScene) ? rawScene : {}
    const rawSlots = !legacyScenePreset && Array.isArray(source.slots) ? source.slots : []
    const slots = rawSlots.filter(isObject).map((slot, slotIndex): ScenePlusSlot => {
      const center = isObject(slot.center) ? slot.center : null
      const x = center ? finiteNumber(center.x) : undefined
      const y = center ? finiteNumber(center.y) : undefined
      return {
        index: slotIndex + 1,
        prompt: text(slot.prompt) ?? '',
        negativePrompt: text(slot.negativePrompt) ?? '',
        ...(x !== undefined && y !== undefined ? { center: { x, y } } : {})
      }
    })

    return {
      name: text(source.name)?.trim() || `씬 ${index + 1}`,
      prompt: text(source.prompt) ?? text(source.scenePrompt) ?? '',
      negativePrompt: text(source.negativePrompt) ?? '',
      width: positiveNumber(source.width),
      height: positiveNumber(source.height),
      useCoords: legacyScenePreset ? false : source.useCoords === true,
      slots: slots.length ? slots : [{ index: 1, prompt: '', negativePrompt: '' }]
    }
  })

  return { legacyScenePreset, preset, scenes }
}
