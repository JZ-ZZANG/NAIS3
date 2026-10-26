// @vitest-environment happy-dom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scene } from '../src/shared/types'
import type { NaisApi } from '../src/preload'
import { SceneMode } from '../src/renderer/src/components/scene-mode'
import { TooltipProvider } from '../src/renderer/src/components/ui/tooltip'
import { useGenerationStore } from '../src/renderer/src/stores/generation-store'
import { useScenesStore } from '../src/renderer/src/stores/scenes-store'

const initialScenes = useScenesStore.getState()
const initialGeneration = useGenerationStore.getState()
let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.nais = {
    invoke: vi.fn(async () => ({ value: null, total: 0 })),
    on: () => () => {}
  } as unknown as NaisApi
  const scenes: Scene[] = [1, 2].map((id) => ({
    id,
    presetId: 1,
    name: `Scene ${id}`,
    prompt: '',
    negativePrompt: '',
    width: 832,
    height: 1216,
    reserveCount: 5,
    reserves: { cast1: 2, cast2: 3 },
    thumbnailUrl: `nais-image://local/?thumb=image&id=${id}`,
    thumbnailPath: `/scene/${id}.png`,
    imageCount: 1,
    hasFavorite: false,
    hasAddition: true
  }))
  useScenesStore.setState({
    ...initialScenes,
    scenes,
    selectedId: null,
    additionsEnabled: true,
    casts: ['cast1', 'cast2'].map((id) => ({
      id,
      name: id,
      color: '#ef4444',
      characterIds: [],
      charRefIds: [],
      vibeIds: []
    })),
    groups: [{ id: 'group', name: 'Group', castIds: ['cast1', 'cast2'] }],
    activeGroupId: 'group',
    loadPresets: vi.fn().mockResolvedValue(undefined),
    loadAdditionsEnabled: vi.fn().mockResolvedValue(undefined)
  })
  useGenerationStore.setState({ queue: null, previewPng: null })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useScenesStore.setState(initialScenes, true)
  useGenerationStore.setState(initialGeneration, true)
  vi.unstubAllGlobals()
})

describe('scene grid after upstream merge', () => {
  it('keeps group reservations and character additions with URL thumbnails', async () => {
    await act(async () => root.render(h(TooltipProvider, null, h(SceneMode))))
    const card = container.querySelector<HTMLDivElement>('[aria-roledescription="sortable"]')!
    const image = card.querySelector('img')!
    expect(image.getAttribute('src')).toBe('nais-image://local/?thumb=image&id=1')
    expect(card.querySelector('button[title="씬별 캐릭터 추가"]')).not.toBeNull()
    const count = card.querySelector<HTMLButtonElement>('button.cursor-text')!
    expect(count.textContent).toBe('5')
    await act(async () => count.click())
    expect(card.querySelector('input')?.value).toBe('')
    await act(async () => image.dispatchEvent(new Event('error')))
    expect(image.getAttribute('src')).toBe('nais-image://local/?path=%2Fscene%2F1.png')
  })

  it('updates the generating card preview while other cards keep their thumbnails', async () => {
    useGenerationStore.setState({
      queue: {
        running: true,
        delayMs: 0,
        items: [
          { id: 'job', state: 'generating', request: { ...initialGeneration.request, sceneId: 1 } }
        ]
      }
    })
    await act(async () => root.render(h(TooltipProvider, null, h(SceneMode))))
    await act(async () => useGenerationStore.setState({ previewPng: 'FRAME' }))
    const images = [...container.querySelectorAll('img')].map((image) => image.getAttribute('src'))
    expect(images).toEqual(['data:image/png;base64,FRAME', 'nais-image://local/?thumb=image&id=2'])
  })
})
