// @vitest-environment happy-dom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CharacterOverlay } from '../src/renderer/src/components/character-overlay'
import { useCharactersStore } from '../src/renderer/src/stores/characters-store'
import { DEFAULT_REQUEST, useGenerationStore } from '../src/renderer/src/stores/generation-store'
import { useLanguageStore } from '../src/renderer/src/lib/i18n'
import type { NaisApi } from '../src/preload'
let root: Root
let container: HTMLDivElement
const invoke = vi.fn()
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  invoke.mockResolvedValue({ counts: [] })
  window.nais = { invoke } as unknown as NaisApi
  useLanguageStore.setState({ lang: 'en' })
  useGenerationStore.setState({ request: { ...DEFAULT_REQUEST, useCoords: true } })
  useCharactersStore.setState({
    items: [1, 2].map((id) => ({
      id,
      name: `Character ${id}`,
      prompt: 'girl',
      negativePrompt: '',
      enabled: true,
      center: { x: 0.5, y: 0.5 },
      folderId: null,
      thumbnail: ''
    })),
    folders: []
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  invoke.mockReset()
  vi.unstubAllGlobals()
})
it('preserves saved center coordinates when the sidebar mounts', async () => {
  await act(async () => root.render(h(CharacterOverlay)))
  expect(useCharactersStore.getState().items.map((c) => c.center)).toEqual([
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.5 }
  ])
  expect(invoke.mock.calls.filter(([channel]) => channel === 'chars:update')).toHaveLength(0)
})
it('allows both characters to be deliberately moved to the center', async () => {
  useCharactersStore.setState({
    items: useCharactersStore
      .getState()
      .items.map((c, i) => ({ ...c, center: { x: i ? 0.7 : 0.3, y: 0.5 } }))
  })
  await act(async () => root.render(h(CharacterOverlay)))
  await act(async () => useCharactersStore.getState().updateCard(1, { center: { x: 0.5, y: 0.5 } }))
  await act(async () => useCharactersStore.getState().updateCard(2, { center: { x: 0.5, y: 0.5 } }))
  expect(useCharactersStore.getState().items.map((c) => c.center.x)).toEqual([0.5, 0.5])
})
it('keeps compact position controls and refreshes their precision when switching models', async () => {
  await act(async () => root.render(h(CharacterOverlay)))
  const coordinateButtons = (text: string): HTMLButtonElement[] =>
    Array.from(container.querySelectorAll('button')).filter((button) => button.textContent === text)
  expect(coordinateButtons('0.500,0.500')).toHaveLength(2)
  expect(container.querySelector('button[title="V5 freeform character positioning"]')).toBeNull()
  await act(async () =>
    useGenerationStore.setState({
      request: { ...DEFAULT_REQUEST, model: 'nai-diffusion-4-5-full', useCoords: true }
    })
  )
  expect(coordinateButtons('0.500,0.500')).toHaveLength(0)
  expect(coordinateButtons('0.5,0.5')).toHaveLength(2)
  await act(async () =>
    useGenerationStore.setState({ request: { ...DEFAULT_REQUEST, useCoords: true } })
  )
  expect(coordinateButtons('0.500,0.500')).toHaveLength(2)
})

it('allows position controls for a single active character', async () => {
  useCharactersStore.setState({ items: useCharactersStore.getState().items.slice(0, 1) })
  await act(async () => root.render(h(CharacterOverlay)))
  const positioning = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Set positions"]'
  )!
  expect(positioning.getAttribute('aria-disabled')).not.toBe('true')
  expect(positioning.getAttribute('data-state')).toBe('checked')
  expect(
    Array.from(container.querySelectorAll('button')).some(
      (button) => button.textContent === '0.500,0.500'
    )
  ).toBe(true)
})
