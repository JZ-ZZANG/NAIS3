import { create } from 'zustand'
import type {
  GenerationRequest,
  SceneImage,
  ScenePlusCast,
  ScenePlusCastGroup,
  ScenePlusCastSettings,
  ScenePlusPreset,
  ScenePlusScene
} from '@shared/types'
import { enabledCharacters } from './characters-store'
import { randomSeed, useGenerationStore } from './generation-store'
import { toast } from './toast-store'

interface ScenePlusState {
  presets: ScenePlusPreset[]
  scenes: ScenePlusScene[]
  casts: ScenePlusCast[]
  groups: ScenePlusCastGroup[]
  castAssignments: ScenePlusCastSettings['castAssignments']
  groupAssignments: ScenePlusCastSettings['groupAssignments']
  assignmentSlotCount: number
  activePresetId: number | null
  activeCastId: number | null
  activeGroupId: number | null
  columns: number
  cardOrientation: 'portrait' | 'landscape' | 'square'
  selectedSceneId: number | null
  reservedTotal: number
  images: SceneImage[]
  imagesTotal: number
  imagesLoading: boolean
  favoritesOnly: boolean
  load: () => Promise<void>
  selectPreset: (id: number) => Promise<void>
  setActiveCast: (id: number | null) => void
  setActiveGroup: (id: number | null) => void
  setColumns: (columns: number) => void
  setCardOrientation: (orientation: 'portrait' | 'landscape' | 'square') => void
  selectScene: (id: number | null) => void
  createPreset: (name?: string) => Promise<void>
  updatePreset: (id: number, patch: Partial<ScenePlusPreset>) => Promise<void>
  deletePreset: (id: number) => Promise<void>
  reorderPresets: (ids: number[]) => Promise<void>
  setCastSettings: (
    castAssignments: Record<number, number>,
    groupAssignments: Record<number, number>,
    slotCount: number
  ) => Promise<void>
  exportJson: () => Promise<void>
  exportZip: () => Promise<void>
  importJson: () => Promise<void>
  createScene: () => Promise<void>
  updateScene: (id: number, patch: Partial<ScenePlusScene>) => Promise<void>
  duplicateScene: (id: number) => Promise<void>
  deleteScene: (id: number) => Promise<void>
  reorderScenes: (ids: number[]) => Promise<void>
  setReserve: (id: number, count: number) => Promise<void>
  adjustReserveAll: (delta: number) => Promise<void>
  clearReserveAll: () => Promise<void>
  loadImages: (sceneId: number, reset: boolean) => Promise<void>
  toggleFavorite: (imageId: number) => Promise<void>
  deleteImage: (imageId: number) => Promise<void>
  setFavoritesOnly: (value: boolean) => void
  createCast: (data: Omit<ScenePlusCast, 'id'>) => Promise<void>
  updateCast: (id: number, patch: Partial<Omit<ScenePlusCast, 'id'>>) => Promise<void>
  deleteCast: (id: number) => Promise<void>
  reorderCasts: (ids: number[]) => Promise<void>
  createGroup: (data: Omit<ScenePlusCastGroup, 'id'>) => Promise<void>
  updateGroup: (id: number, patch: Partial<Omit<ScenePlusCastGroup, 'id'>>) => Promise<void>
  deleteGroup: (id: number) => Promise<void>
  generateReserved: () => Promise<void>
  generateOne: (sceneId: number) => Promise<void>
}

function baseRequest(): GenerationRequest {
  const generation = useGenerationStore.getState()
  const base = generation.request
  const source = generation.source
  return {
    ...base,
    promptParts: generation.promptSplitEnabled ? base.promptParts : undefined,
    width: source ? source.width : base.width,
    height: source ? source.height : base.height,
    characterPrompts: enabledCharacters().map((character) => ({
      prompt: character.prompt,
      negativePrompt: character.negativePrompt,
      center: character.center,
      enabled: true
    })),
    source: source
      ? {
          imageBase64: source.imageBase64,
          maskBase64: source.maskBase64,
          strength: base.i2iStrength ?? 0.7,
          noise: base.i2iNoise ?? 0
        }
      : undefined
  }
}

export const useScenePlusStore = create<ScenePlusState>((set, get) => ({
  presets: [],
  scenes: [],
  casts: [],
  groups: [],
  castAssignments: {},
  groupAssignments: {},
  assignmentSlotCount: 0,
  activePresetId: null,
  activeCastId: null,
  activeGroupId: null,
  columns: Number(localStorage.getItem('scene_plus_columns')) || 3,
  cardOrientation:
    (localStorage.getItem('scene_plus_orientation') as 'portrait' | 'landscape' | 'square') ||
    'portrait',
  selectedSceneId: null,
  reservedTotal: 0,
  images: [],
  imagesTotal: 0,
  imagesLoading: false,
  favoritesOnly: false,

  load: async () => {
    const [{ items: presets }, { items: casts }, { items: groups }, castSettings, { total }] =
      await Promise.all([
        window.nais.invoke('scenePlus:presets:list', undefined),
        window.nais.invoke('scenePlus:casts:list', undefined),
        window.nais.invoke('scenePlus:castGroups:list', undefined),
        window.nais.invoke('scenePlus:castSettings:get', undefined),
        window.nais.invoke('scenePlus:reservedTotal', undefined)
      ])
    const active = presets.some((preset) => preset.id === get().activePresetId)
      ? get().activePresetId
      : (presets[0]?.id ?? null)
    const scenes =
      active == null
        ? []
        : (await window.nais.invoke('scenePlus:scenes:list', { presetId: active })).items
    const selectedSceneId = scenes.some((scene) => scene.id === get().selectedSceneId)
      ? get().selectedSceneId
      : null
    set({
      presets,
      casts,
      groups,
      castAssignments: castSettings.castAssignments,
      groupAssignments: castSettings.groupAssignments,
      assignmentSlotCount: castSettings.slotCount,
      activePresetId: active,
      reservedTotal: total,
      scenes,
      selectedSceneId
    })
  },
  selectPreset: async (activePresetId) => {
    const { items } = await window.nais.invoke('scenePlus:scenes:list', {
      presetId: activePresetId
    })
    set({ activePresetId, scenes: items, selectedSceneId: null })
  },
  setActiveCast: (activeCastId) => set({ activeCastId, activeGroupId: null }),
  setActiveGroup: (activeGroupId) => set({ activeGroupId, activeCastId: null }),
  setColumns: (columns) => {
    set({ columns })
    localStorage.setItem('scene_plus_columns', String(columns))
  },
  setCardOrientation: (cardOrientation) => {
    set({ cardOrientation })
    localStorage.setItem('scene_plus_orientation', cardOrientation)
  },
  selectScene: (selectedSceneId) => {
    set({ selectedSceneId, images: [], imagesTotal: 0 })
    if (selectedSceneId != null) void get().loadImages(selectedSceneId, true)
  },
  createPreset: async (name) => {
    const { id } = await window.nais.invoke('scenePlus:presets:create', {
      name: name?.trim() || `프리셋 ${get().presets.length + 1}`
    })
    await get().load()
    await get().selectPreset(id)
  },
  updatePreset: async (id, patch) => {
    set({ presets: get().presets.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
    await window.nais.invoke('scenePlus:presets:update', {
      id,
      patch: {
        name: patch.name,
        defaultWidth: patch.defaultWidth,
        defaultHeight: patch.defaultHeight
      }
    })
  },
  deletePreset: async (id) => {
    await window.nais.invoke('scenePlus:presets:delete', { id })
    await get().load()
  },
  reorderPresets: async (ids) => {
    const order = new Map(ids.map((id, index) => [id, index]))
    set({
      presets: [...get().presets].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    })
    await window.nais.invoke('scenePlus:presets:reorder', { ids })
  },
  setCastSettings: async (castAssignments, groupAssignments, slotCount) => {
    set({
      castAssignments,
      groupAssignments,
      assignmentSlotCount: slotCount
    })
    await window.nais.invoke('scenePlus:castSettings:set', {
      castAssignments,
      groupAssignments,
      slotCount
    })
  },
  exportJson: async () => {
    const presetId = get().activePresetId
    if (presetId != null) await window.nais.invoke('scenePlus:exportJson', { presetId })
  },
  exportZip: async () => {
    const presetId = get().activePresetId
    if (presetId != null) await window.nais.invoke('scenePlus:exportZip', { presetId })
  },
  importJson: async () => {
    const result = await window.nais.invoke('scenePlus:importJson', undefined)
    if (result.presetId == null) return
    await get().load()
    await get().selectPreset(result.presetId)
  },
  createScene: async () => {
    const presetId = get().activePresetId
    if (presetId == null) return
    const { id } = await window.nais.invoke('scenePlus:scenes:create', {
      presetId,
      name: `씬 ${get().scenes.length + 1}`
    })
    await get().selectPreset(presetId)
    set({ selectedSceneId: id })
  },
  updateScene: async (id, patch) => {
    set({ scenes: get().scenes.map((item) => (item.id === id ? { ...item, ...patch } : item)) })
    await window.nais.invoke('scenePlus:scenes:update', {
      id,
      patch: {
        name: patch.name,
        prompt: patch.prompt,
        negativePrompt: patch.negativePrompt,
        width: patch.width,
        height: patch.height,
        useCoords: patch.useCoords,
        slots: patch.slots
      }
    })
  },
  duplicateScene: async (id) => {
    await window.nais.invoke('scenePlus:scenes:duplicate', { id })
    const presetId = get().activePresetId
    if (presetId != null) await get().selectPreset(presetId)
  },
  deleteScene: async (id) => {
    await window.nais.invoke('scenePlus:scenes:delete', { id })
    const presetId = get().activePresetId
    if (presetId != null) await get().selectPreset(presetId)
  },
  reorderScenes: async (ids) => {
    const order = new Map(ids.map((id, index) => [id, index]))
    set({
      scenes: [...get().scenes].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    })
    await window.nais.invoke('scenePlus:scenes:reorder', { ids })
  },
  setReserve: async (id, count) => {
    const next = Math.max(0, Math.min(9999, Math.floor(count)))
    set({
      scenes: get().scenes.map((scene) =>
        scene.id === id ? { ...scene, reserveCount: next } : scene
      )
    })
    await window.nais.invoke('scenePlus:scenes:setReserve', { id, count: next })
    const { total } = await window.nais.invoke('scenePlus:reservedTotal', undefined)
    set({ reservedTotal: total })
  },
  adjustReserveAll: async (delta) => {
    const scenes = get().scenes
    await Promise.all(
      scenes.map((scene) =>
        window.nais.invoke('scenePlus:scenes:setReserve', {
          id: scene.id,
          count: Math.max(0, Math.min(9999, scene.reserveCount + delta))
        })
      )
    )
    await get().load()
  },
  clearReserveAll: async () => {
    await Promise.all(
      get().scenes.map((scene) =>
        window.nais.invoke('scenePlus:scenes:setReserve', { id: scene.id, count: 0 })
      )
    )
    await get().load()
  },
  loadImages: async (sceneId, reset) => {
    if (!reset && get().imagesLoading) return
    set({ imagesLoading: true })
    const offset = reset ? 0 : get().images.length
    const { items, total } = await window.nais.invoke('scenePlus:scenes:images', {
      sceneId,
      limit: 60,
      offset,
      favoritesOnly: get().favoritesOnly
    })
    if (get().selectedSceneId !== sceneId) return
    set({
      images: reset ? items : [...get().images, ...items],
      imagesTotal: total,
      imagesLoading: false
    })
  },
  toggleFavorite: async (imageId) => {
    const image = get().images.find((item) => item.id === imageId)
    if (!image) return
    const favorite = !image.favorite
    set({
      images: get().images.map((item) => (item.id === imageId ? { ...item, favorite } : item))
    })
    await window.nais.invoke('images:setFavorite', { id: imageId, favorite })
    await get().load()
  },
  deleteImage: async (imageId) => {
    set({
      images: get().images.filter((item) => item.id !== imageId),
      imagesTotal: Math.max(0, get().imagesTotal - 1)
    })
    await window.nais.invoke('images:delete', { id: imageId, deleteFile: true })
    await get().load()
  },
  setFavoritesOnly: (favoritesOnly) => {
    set({ favoritesOnly, images: [], imagesTotal: 0 })
    const sceneId = get().selectedSceneId
    if (sceneId != null) void get().loadImages(sceneId, true)
  },
  createCast: async (data) => {
    await window.nais.invoke('scenePlus:casts:create', data)
    const { items } = await window.nais.invoke('scenePlus:casts:list', undefined)
    set({ casts: items })
  },
  updateCast: async (id, patch) => {
    await window.nais.invoke('scenePlus:casts:update', { id, patch })
    const { items } = await window.nais.invoke('scenePlus:casts:list', undefined)
    set({ casts: items })
  },
  deleteCast: async (id) => {
    await window.nais.invoke('scenePlus:casts:delete', { id })
    await get().load()
  },
  reorderCasts: async (ids) => {
    const order = new Map(ids.map((id, index) => [id, index]))
    set({ casts: [...get().casts].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) })
    await window.nais.invoke('scenePlus:casts:reorder', { ids })
  },
  createGroup: async (data) => {
    await window.nais.invoke('scenePlus:castGroups:create', data)
    const { items } = await window.nais.invoke('scenePlus:castGroups:list', undefined)
    set({ groups: items })
  },
  updateGroup: async (id, patch) => {
    await window.nais.invoke('scenePlus:castGroups:update', { id, patch })
    const { items } = await window.nais.invoke('scenePlus:castGroups:list', undefined)
    set({ groups: items })
  },
  deleteGroup: async (id) => {
    await window.nais.invoke('scenePlus:castGroups:delete', { id })
    if (get().activeGroupId === id) set({ activeGroupId: null })
    await get().load()
  },
  generateReserved: async () => {
    try {
      await window.nais.invoke('scenePlus:enqueueReserved', {
        request: baseRequest(),
        seedLocked: useGenerationStore.getState().seedLocked
      })
      await get().load()
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  },
  generateOne: async (sceneId) => {
    try {
      const request = baseRequest()
      request.seed = useGenerationStore.getState().seedLocked ? request.seed : randomSeed()
      await window.nais.invoke('scenePlus:generateOne', { sceneId, request })
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
    }
  }
}))

export function bindScenePlusEvents(): () => void {
  return window.nais.on('scenePlus:changed', () => {
    const store = useScenePlusStore.getState()
    void store.load()
    if (store.selectedSceneId != null) void store.loadImages(store.selectedSceneId, true)
  })
}
