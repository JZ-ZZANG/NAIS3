import { modelCapabilities } from './nai-models'
import { appendPrompt } from './scene-request'
import type { CharacterPromptInput, GenerationRequest, ScenePlusScene } from './types'

/** 씬+의 슬롯과 출연자를 같은 순번끼리 결합한다. */
export function applyScenePlusRequest(
  base: GenerationRequest,
  scene: Pick<
    ScenePlusScene,
    'id' | 'prompt' | 'negativePrompt' | 'width' | 'height' | 'useCoords' | 'slots'
  >,
  actors: (CharacterPromptInput | null)[] = base.characterPrompts,
  refs?: { charRefIds: number[]; vibeIds: number[] }
): GenerationRequest {
  const slots = [...scene.slots].sort((a, b) => a.index - b.index)
  if (scene.useCoords && slots.some((slot) => !slot.center)) {
    throw new Error('위치 설정을 켠 씬은 모든 캐릭터 슬롯의 위치가 필요합니다.')
  }
  const pairCount = Math.min(slots.length, actors.length)
  const characterPrompts = Array.from(
    { length: pairCount },
    (_, i): CharacterPromptInput | null => {
      const actor = actors[i]
      if (!actor?.prompt.trim()) return null
      return {
        ...actor,
        prompt: appendPrompt(actor.prompt, slots[i].prompt),
        negativePrompt: appendPrompt(actor.negativePrompt, slots[i].negativePrompt),
        ...(scene.useCoords ? { center: slots[i].center } : { center: undefined }),
        enabled: true
      }
    }
  )
    .filter((actor): actor is CharacterPromptInput => actor !== null)
    .slice(0, modelCapabilities(base.model).maxCharacters)
  return {
    ...base,
    prompt: appendPrompt(base.prompt, scene.prompt),
    negativePrompt: appendPrompt(base.negativePrompt, scene.negativePrompt),
    promptParts: base.promptParts
      ? { ...base.promptParts, detail: appendPrompt(base.promptParts.detail, scene.prompt) }
      : undefined,
    width: base.source ? base.width : scene.width,
    height: base.source ? base.height : scene.height,
    useCoords: scene.useCoords,
    characterPrompts,
    sceneId: undefined,
    scenePlusId: scene.id,
    ...(refs ? refs : {})
  }
}
