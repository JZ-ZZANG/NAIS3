// @vitest-environment happy-dom
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenePlusScene } from '../src/shared/types'
import type { NaisApi } from '../src/preload/index'
import { ScenePlusMode } from '../src/renderer/src/components/scene-plus-mode'
import { TooltipProvider } from '../src/renderer/src/components/ui/tooltip'
import { useLanguageStore } from '../src/renderer/src/lib/i18n'
import { askConfirm, askText } from '../src/renderer/src/stores/dialog-store'
import { useGenerationStore } from '../src/renderer/src/stores/generation-store'
import { useScenePlusStore } from '../src/renderer/src/stores/scene-plus-store'

vi.mock('../src/renderer/src/stores/dialog-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/renderer/src/stores/dialog-store')>()),
  askText: vi.fn(),
  askConfirm: vi.fn()
}))

let root: Root
let container: HTMLDivElement
const invoke = vi.fn()
const originalState = useScenePlusStore.getState()

function scenes(): ScenePlusScene[] {
  return [1, 2, 3].map((id) => ({
    id,
    presetId: 1,
    name: `Scene ${id}`,
    prompt: '',
    negativePrompt: '',
    width: 832,
    height: 1216,
    useCoords: false,
    slots: [],
    reserveCount: 0,
    imageCount: 0,
    thumbnail: '',
    thumbnailPath: ''
  }))
}

function cards(): HTMLDivElement[] {
  return [
    ...container.querySelectorAll<HTMLDivElement>(
      'div[role="button"][aria-roledescription="sortable"]'
    )
  ]
}

async function render(): Promise<void> {
  await act(async () => root.render(h(TooltipProvider, null, h(ScenePlusMode))))
}

async function click(element: Element, shiftKey = false): Promise<void> {
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey })))
}

function button(label: string): HTMLButtonElement {
  const item = [...container.querySelectorAll('button')].find(
    (element) => element.getAttribute('aria-label') === label
  )
  expect(item, `button ${label}`).toBeDefined()
  return item!
}

function menuItem(label: string): HTMLElement {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (element) => element.textContent?.trim() === label
  )
  expect(item, `menu item ${label}`).toBeDefined()
  return item!
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.nais = { invoke, on: () => () => {} } as NaisApi
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'scenePlus:scenes:list') return { items: scenes() }
    if (channel === 'scenePlus:reservedTotal') return { total: 1 }
    return {}
  })
  useLanguageStore.setState({ lang: 'ko' })
  useGenerationStore.setState({ queue: null, previewPng: null, batchCount: 1 })
  useScenePlusStore.setState({
    ...originalState,
    presets: [{ id: 1, name: 'Preset', defaultWidth: 832, defaultHeight: 1216 }],
    activePresetId: 1,
    scenes: scenes(),
    columns: 3,
    load: vi.fn().mockResolvedValue(undefined)
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useScenePlusStore.setState(originalState, true)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.mocked(askText).mockReset()
  vi.mocked(askConfirm).mockReset()
  invoke.mockReset()
})

describe('scene+ card interactions', () => {
  it('opens the right-click menu and duplicates the scene through its own API', async () => {
    await render()
    await act(async () => {
      cards()[0].dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })
    expect(useScenePlusStore.getState().selectedSceneId).toBeNull()
    expect(menuItem('이름 변경')).toBeDefined()
    expect(menuItem('삭제')).toBeDefined()
    await click(menuItem('복제'))
    expect(invoke).toHaveBeenCalledWith('scenePlus:scenes:duplicate', { id: 1 })
    expect(invoke.mock.calls.some(([channel]) => channel.startsWith('scenes:'))).toBe(false)
  })

  it('uses the same rename action from the three-dot menu without opening the editor', async () => {
    vi.mocked(askText).mockResolvedValue('Renamed')
    await render()
    await click(button('"Scene 1" 메뉴'))
    const rename = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '이름 변경'
    )!
    await click(rename)
    expect(askText).toHaveBeenCalledWith('씬 이름', 'Scene 1')
    expect(invoke).toHaveBeenCalledWith('scenePlus:scenes:update', {
      id: 1,
      patch: expect.objectContaining({ name: 'Renamed' })
    })
    expect(useScenePlusStore.getState().selectedSceneId).toBeNull()
  })

  it('requires the existing delete confirmation when deleting from the right-click menu', async () => {
    vi.mocked(askConfirm).mockResolvedValue(false)
    await render()
    await act(async () => {
      cards()[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    })
    await click(menuItem('삭제'))
    expect(askConfirm).toHaveBeenCalledWith('씬 삭제', expect.objectContaining({ danger: true }))
    expect(invoke).not.toHaveBeenCalledWith('scenePlus:scenes:delete', expect.anything())
  })

  it('selects a range with Shift-click and clears the selection when switching presets', async () => {
    await render()
    await click(container.querySelector('button[aria-label="편집 모드"]')!)
    await click(cards()[0])
    await click(cards()[2], true)
    expect(container.textContent).toContain('3개 선택')
    await act(async () => useScenePlusStore.setState({ activePresetId: 2 }))
    expect(container.textContent).toContain('0개 선택')
  })

  it('lets the user edit a name and adjust reservations without selecting or opening a card', async () => {
    await render()
    await click(container.querySelector('button[aria-label="편집 모드"]')!)
    const input = container.querySelector<HTMLInputElement>('input[aria-label="씬 이름"]')!
    await click(input)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'Draft'
      )
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    })
    expect(useScenePlusStore.getState().scenes[0].name).toBe('Draft')
    await click(button('"Draft" 예약 증가'))
    expect(invoke).toHaveBeenCalledWith('scenePlus:scenes:setReserve', { id: 1, count: 1 })
    expect(container.textContent).toContain('0개 선택')
    expect(useScenePlusStore.getState().selectedSceneId).toBeNull()
  })

  it('reorders cards by dragging and persists the new scene+ order', async () => {
    await render()
    const elements = cards()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const index = elements.indexOf(this as HTMLDivElement)
      return new DOMRect(index < 0 ? 0 : index * 210, 0, index < 0 ? 640 : 200, 300)
    })
    const pointer = async (target: EventTarget, type: string, x: number): Promise<void> => {
      await act(async () => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: type === 'pointerup' ? 0 : 1,
            clientX: x,
            clientY: 100
          })
        )
      })
    }
    await pointer(elements[0], 'pointerdown', 100)
    await pointer(document, 'pointermove', 110)
    await pointer(document, 'pointermove', 520)
    await pointer(document, 'pointerup', 520)
    expect(useScenePlusStore.getState().scenes.map((scene) => scene.id)).toEqual([2, 3, 1])
    expect(invoke).toHaveBeenCalledWith('scenePlus:scenes:reorder', { ids: [2, 3, 1] })
    expect(useScenePlusStore.getState().selectedSceneId).toBeNull()
  })
})
