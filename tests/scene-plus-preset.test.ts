import { describe, expect, it } from 'vitest'
import { normalizeScenePlusPresetImport } from '../src/shared/scene-plus-preset'

describe('scene plus preset import', () => {
  it('keeps the scene plus format and character slots', () => {
    const result = normalizeScenePlusPresetImport({
      mode: 'scene-plus',
      version: 1,
      preset: { name: 'Plus', defaultWidth: 1024, defaultHeight: 1024 },
      scenes: [
        {
          name: 'Cafe',
          prompt: 'indoors',
          negativePrompt: 'outside',
          width: 1024,
          height: 1024,
          useCoords: true,
          slots: [{ prompt: 'smile', negativePrompt: 'sad', center: { x: 0.25, y: 0.5 } }]
        }
      ]
    })

    expect(result?.legacyScenePreset).toBe(false)
    expect(result?.preset.name).toBe('Plus')
    expect(result?.scenes[0].slots).toEqual([
      {
        index: 1,
        prompt: 'smile',
        negativePrompt: 'sad',
        center: { x: 0.25, y: 0.5 }
      }
    ])
  })

  it('converts an existing scene preset into an independent scene plus preset', () => {
    const result = normalizeScenePlusPresetImport({
      version: 1,
      scenes: [
        {
          name: 'Legacy scene',
          prompt: 'forest',
          negativePrompt: 'city',
          width: 832,
          height: 1216
        }
      ]
    })

    expect(result).toEqual({
      legacyScenePreset: true,
      preset: {},
      scenes: [
        {
          name: 'Legacy scene',
          prompt: 'forest',
          negativePrompt: 'city',
          width: 832,
          height: 1216,
          useCoords: false,
          slots: [{ index: 1, prompt: '', negativePrompt: '' }]
        }
      ]
    })
  })

  it('rejects unrelated JSON formats', () => {
    expect(normalizeScenePlusPresetImport({ version: 1, mode: 'other', scenes: [] })).toBeNull()
  })
})
