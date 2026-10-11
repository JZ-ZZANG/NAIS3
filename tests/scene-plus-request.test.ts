import { describe, expect, it } from 'vitest'
import { applyScenePlusRequest } from '../src/shared/scene-plus-request'
import type { GenerationRequest, ScenePlusScene } from '../src/shared/types'

const request: GenerationRequest = {
  prompt: 'base',
  negativePrompt: 'bad',
  model: 'nai-diffusion-5-curated',
  width: 832,
  height: 1216,
  steps: 23,
  cfgScale: 7,
  cfgRescale: 0,
  sampler: 'k_euler_ancestral',
  noiseSchedule: 'karras',
  seed: 1,
  variety: false,
  qualityToggle: true,
  ucPreset: 0,
  useCoords: false,
  characterPrompts: [],
  charRefIds: [9],
  vibeIds: [8]
}

const scene: ScenePlusScene = {
  id: 3,
  presetId: 2,
  name: 'test',
  prompt: 'room',
  negativePrompt: 'outside',
  width: 1024,
  height: 1024,
  useCoords: true,
  slots: [
    { index: 1, prompt: 'smiling', negativePrompt: 'crying', center: { x: 0.2, y: 0.4 } },
    { index: 2, prompt: 'sitting', negativePrompt: '', center: { x: 0.8, y: 0.5 } }
  ],
  reserveCount: 0,
  imageCount: 0,
  thumbnail: '',
  thumbnailPath: ''
}

describe('scene mode plus request composition', () => {
  it('merges main and per-character prompts by slot and replaces references', () => {
    const result = applyScenePlusRequest(
      request,
      scene,
      [
        { prompt: 'alice', negativePrompt: 'red hair', enabled: true },
        { prompt: 'bob', negativePrompt: '', enabled: true },
        { prompt: 'unused', negativePrompt: '', enabled: true }
      ],
      { charRefIds: [1, 2], vibeIds: [4] }
    )
    expect(result.prompt).toBe('base, room')
    expect(result.negativePrompt).toBe('bad, outside')
    expect(result.characterPrompts).toEqual([
      {
        prompt: 'alice, smiling',
        negativePrompt: 'red hair, crying',
        enabled: true,
        center: { x: 0.2, y: 0.4 }
      },
      {
        prompt: 'bob, sitting',
        negativePrompt: '',
        enabled: true,
        center: { x: 0.8, y: 0.5 }
      }
    ])
    expect(result.charRefIds).toEqual([1, 2])
    expect(result.vibeIds).toEqual([4])
    expect(result.sceneId).toBeUndefined()
    expect(result.scenePlusId).toBe(3)
  })

  it('does not shift a later fixed cast into an earlier empty slot', () => {
    const result = applyScenePlusRequest(request, scene, [
      null,
      { prompt: 'bob', negativePrompt: '', enabled: true }
    ])
    expect(result.characterPrompts).toEqual([
      {
        prompt: 'smiling',
        negativePrompt: 'crying',
        enabled: true,
        center: { x: 0.2, y: 0.4 }
      },
      {
        prompt: 'bob, sitting',
        negativePrompt: '',
        enabled: true,
        center: { x: 0.8, y: 0.5 }
      }
    ])
  })

  it('keeps every scene slot when fewer casts are assigned', () => {
    const result = applyScenePlusRequest(request, scene, [
      { prompt: 'alice', negativePrompt: 'red hair', enabled: true }
    ])
    expect(result.characterPrompts).toHaveLength(2)
    expect(result.characterPrompts[0].prompt).toBe('alice, smiling')
    expect(result.characterPrompts[1]).toEqual({
      prompt: 'sitting',
      negativePrompt: '',
      enabled: true,
      center: { x: 0.8, y: 0.5 }
    })
  })

  it('uses scene prompts and positions when no casts are assigned', () => {
    const result = applyScenePlusRequest(request, scene)
    expect(result.characterPrompts).toEqual(
      scene.slots.map(({ prompt, negativePrompt, center }) => ({
        prompt,
        negativePrompt,
        center,
        enabled: true
      }))
    )
  })

  it('keeps an unassigned slot even when its prompt is empty', () => {
    const result = applyScenePlusRequest(request, {
      ...scene,
      slots: [scene.slots[0], { ...scene.slots[1], prompt: '', negativePrompt: 'hat' }]
    })
    expect(result.characterPrompts).toHaveLength(2)
    expect(result.characterPrompts[1]).toEqual({
      prompt: '',
      negativePrompt: 'hat',
      center: { x: 0.8, y: 0.5 },
      enabled: true
    })
  })

  it('clears cast positions when scene positioning is disabled', () => {
    const result = applyScenePlusRequest(request, { ...scene, useCoords: false }, [
      { prompt: 'alice', negativePrompt: '', center: { x: 0.1, y: 0.1 }, enabled: true }
    ])
    expect(result.characterPrompts).toHaveLength(2)
    expect(result.characterPrompts.every((character) => character.center === undefined)).toBe(true)
    expect(result.useCoords).toBe(false)
  })

  it.each([
    ['nai-diffusion-4-5-full', 6],
    ['nai-diffusion-5-curated', 32]
  ])('keeps scene slots up to the %s model limit', (model, limit) => {
    const result = applyScenePlusRequest(
      { ...request, model },
      {
        ...scene,
        slots: Array.from({ length: 33 }, (_, i) => ({ ...scene.slots[0], index: i + 1 }))
      }
    )
    expect(result.characterPrompts).toHaveLength(limit)
  })

  it('requires every slot position when scene positioning is enabled', () => {
    expect(() =>
      applyScenePlusRequest(
        request,
        {
          ...scene,
          slots: [{ index: 1, prompt: '', negativePrompt: '' }]
        },
        [{ prompt: 'alice', negativePrompt: '', enabled: true }]
      )
    ).toThrow('모든 캐릭터 슬롯')
  })
})
