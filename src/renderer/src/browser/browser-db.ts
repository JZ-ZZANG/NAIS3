import type {
  CharRefItem,
  CharacterCard,
  Fragment,
  HistoryItem,
  LibraryImage,
  LibraryStack,
  ListFolder,
  NaiAccountInfo,
  PromptPreset,
  Scene,
  ScenePlusCast,
  ScenePlusCastGroup,
  ScenePlusCastSettings,
  ScenePlusPreset,
  ScenePlusScene,
  ScenePreset,
  VibeItem
} from '@shared/types'

const DB_NAME = 'nais3-web'
const STORE_NAME = 'runtime'
const STATE_KEY = 'state'

export interface BrowserAccount extends Omit<NaiAccountInfo, 'tier' | 'anlas' | 'usage'> {
  token: string
}

export interface BrowserImage extends HistoryItem {
  base64: string
  payloadJson: string | null
  sceneId: number | null
  scenePlusId: number | null
  favorite: boolean
}

export interface BrowserLibraryImage extends LibraryImage {
  base64: string
}

export interface BrowserState {
  nextId: number
  settings: Record<string, string>
  accounts: BrowserAccount[]
  activeAccountId: string | null
  anlasLog: { at: string; spent: number }[]
  characterFolders: ListFolder[]
  characters: CharacterCard[]
  fragmentFolders: ListFolder[]
  fragments: Fragment[]
  vibeFolders: ListFolder[]
  vibes: VibeItem[]
  vibeEncodings: Record<string, string>
  charRefFolders: ListFolder[]
  charRefs: CharRefItem[]
  promptPresets: PromptPreset[]
  scenePresets: ScenePreset[]
  scenes: Scene[]
  scenePlusPresets: ScenePlusPreset[]
  scenePlusScenes: ScenePlusScene[]
  scenePlusCasts: ScenePlusCast[]
  scenePlusCastGroups: ScenePlusCastGroup[]
  scenePlusCastSettings: ScenePlusCastSettings
  images: BrowserImage[]
  libraryImages: BrowserLibraryImage[]
  libraryStacks: LibraryStack[]
}

export function emptyState(): BrowserState {
  return {
    nextId: 1,
    settings: {},
    accounts: [],
    activeAccountId: null,
    anlasLog: [],
    characterFolders: [],
    characters: [],
    fragmentFolders: [],
    fragments: [],
    vibeFolders: [],
    vibes: [],
    vibeEncodings: {},
    charRefFolders: [],
    charRefs: [],
    promptPresets: [],
    scenePresets: [],
    scenes: [],
    scenePlusPresets: [
      {
        id: 0,
        name: '기본',
        defaultWidth: 832,
        defaultHeight: 1216
      }
    ],
    scenePlusScenes: [],
    scenePlusCasts: [],
    scenePlusCastGroups: [],
    scenePlusCastSettings: { slotCount: 0, castAssignments: {}, groupAssignments: {} },
    images: [],
    libraryImages: [],
    libraryStacks: []
  }
}

let databasePromise: Promise<IDBDatabase> | null = null
let mutationQueue: Promise<unknown> = Promise.resolve()

function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
  return databasePromise
}

async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const request = run(tx.objectStore(STORE_NAME))
    tx.oncomplete = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

export async function readBrowserState(): Promise<BrowserState> {
  const stored = await transaction<BrowserState | undefined>('readonly', (store) =>
    store.get(STATE_KEY)
  )
  const state = stored ? { ...emptyState(), ...stored } : emptyState()
  state.scenePlusPresets = state.scenePlusPresets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    defaultWidth: preset.defaultWidth,
    defaultHeight: preset.defaultHeight
  }))
  return state
}

export function mutateBrowserState<T>(
  mutator: (state: BrowserState) => T | Promise<T>
): Promise<T> {
  const operation = mutationQueue.then(async () => {
    const state = await readBrowserState()
    const result = await mutator(state)
    await transaction<IDBValidKey>('readwrite', (store) => store.put(state, STATE_KEY))
    return result
  })
  mutationQueue = operation.catch(() => undefined)
  return operation
}

export function nextBrowserId(state: BrowserState): number {
  const id = state.nextId
  state.nextId += 1
  return id
}
