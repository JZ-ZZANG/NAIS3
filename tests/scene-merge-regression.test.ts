// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NaisApi } from '../src/preload/index'
import type { Scene, SceneCast } from '../src/shared/types'
import { importBackup } from '../src/renderer/src/lib/backup-import'
import { useCharactersStore } from '../src/renderer/src/stores/characters-store'
import { useFragmentsStore } from '../src/renderer/src/stores/fragments-store'
import { useGenerationStore } from '../src/renderer/src/stores/generation-store'
import { useLibraryStore } from '../src/renderer/src/stores/library-store'
import { usePromptPresetsStore } from '../src/renderer/src/stores/prompt-presets-store'
import { useCharRefsStore, useVibesStore } from '../src/renderer/src/stores/refs-store'
import { useScenePlusStore } from '../src/renderer/src/stores/scene-plus-store'
import { useScenesStore } from '../src/renderer/src/stores/scenes-store'
import { toast } from '../src/renderer/src/stores/toast-store'

vi.mock('../src/renderer/src/stores/toast-store', () => ({ toast: vi.fn() }))

const originalScenes = useScenesStore.getState()
const originalPlus = useScenePlusStore.getState()
const originalGeneration = useGenerationStore.getState()
const invoke = vi.fn()
const casts: SceneCast[] = ['a', 'b'].map((id, index) => ({
  id,
  name: id,
  color: '#0ea5e9',
  characterIds: [],
  charRefIds: [index + 1],
  vibeIds: [index + 11]
}))
const groups = [{ id: 'group', name: 'Group', castIds: ['a', 'b'] }]
const scene = {
  id: 1,
  prompt: 'scene prompt',
  negativePrompt: '',
  width: 832,
  height: 1216
} as Scene

beforeEach(() => {
  window.nais = { invoke, on: () => () => {} } as NaisApi
  useScenesStore.setState({ scenes: [scene], casts, groups, activeGroupId: 'group' })
  useGenerationStore.setState({
    source: null,
    seedLocked: true,
    request: { ...originalGeneration.request, seed: 42 }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  invoke.mockReset()
  useScenesStore.setState(originalScenes, true)
  useScenePlusStore.setState(originalPlus, true)
  useGenerationStore.setState(originalGeneration, true)
})

describe('scene extensions with upstream generation guards', () => {
  it('generates every cast in the selected group with its own references and seed', async () => {
    invoke.mockResolvedValue({ ids: ['queued'] })
    await useScenesStore.getState().generateOne(1)
    expect(invoke).toHaveBeenCalledTimes(2)
    casts.forEach((cast, index) => {
      expect(invoke).toHaveBeenNthCalledWith(index + 1, 'queue:enqueue', {
        count: 1,
        request: expect.objectContaining({
          sceneId: 1,
          seed: 42 + index,
          charRefIds: cast.charRefIds,
          vibeIds: cast.vibeIds
        })
      })
    })
  })

  it('reports a blocked request once and stops submitting the rest of the group', async () => {
    invoke.mockResolvedValue({ ids: [], blocked: 'Daily limit' })
    await useScenesStore.getState().generateOne(1)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledExactlyOnceWith('Daily limit', 'error')
  })
})

describe('shared backup import with scene extensions', () => {
  it('refreshes additions, casts, groups and scene+ after restoring a backup', async () => {
    for (const store of [
      useCharactersStore,
      useFragmentsStore,
      useVibesStore,
      useCharRefsStore,
      usePromptPresetsStore
    ]) {
      vi.spyOn(store.getState(), 'load').mockResolvedValue(undefined)
    }
    vi.spyOn(useScenesStore.getState(), 'loadPresets').mockResolvedValue(undefined)
    vi.spyOn(useLibraryStore.getState(), 'openStack').mockImplementation(() => {})
    const loadPlus = vi.spyOn(useScenePlusStore.getState(), 'load').mockResolvedValue(undefined)
    useScenePlusStore.setState({ selectedSceneId: 99 })
    useScenesStore.setState({
      additionsEnabled: false,
      additions: { 1: { sceneId: 1, characterPromptIds: [99], charRefIds: [], vibeIds: [] } },
      casts: [],
      groups: []
    })
    const settings: Record<string, string> = {
      scene_additions_enabled: '1',
      scene_casts: JSON.stringify(casts),
      scene_cast_groups_personal_v1: JSON.stringify({ version: 1, groups })
    }
    invoke.mockImplementation(async (channel: string, req?: { key: string }) => {
      if (channel === 'backup:import') return { summary: 'Restored', needsPromptReload: false }
      if (channel === 'settings:get') return { value: settings[req!.key] ?? null }
      throw new Error(`Unexpected invocation: ${channel}`)
    })

    expect(await importBackup()).toBe(true)
    await vi.waitFor(() => expect(useScenesStore.getState().groups).toEqual(groups))
    expect(useScenesStore.getState().casts).toEqual(casts)
    expect(useScenesStore.getState().additions).toEqual({})
    expect(useScenesStore.getState().additionsEnabled).toBe(true)
    expect(useScenePlusStore.getState().selectedSceneId).toBeNull()
    expect(loadPlus).toHaveBeenCalledOnce()
  })

  it.each([{ canceled: true }, { error: 'Invalid backup' }])(
    'preserves extension state when the import does not succeed: %j',
    async (result) => {
      invoke.mockResolvedValue(result)
      const before = useScenesStore.getState()
      expect(await importBackup()).toBe(false)
      expect(useScenesStore.getState()).toBe(before)
      expect(invoke).toHaveBeenCalledTimes(1)
    }
  )
})
