import { ChevronDown, ChevronRight, Search, Trash2, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type {
  CharacterCard,
  CharRefItem,
  ListFolder,
  Scene,
  SceneCharacterAddition,
  VibeItem
} from '@shared/types'
import { buildDisplayRows } from '../lib/folder-list'
import { cn } from '../lib/utils'
import { useCharactersStore } from '../stores/characters-store'
import { useCharRefsStore, useVibesStore } from '../stores/refs-store'
import { useScenesStore } from '../stores/scenes-store'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

function characterLabel(item: CharacterCard): string {
  return item.name || item.prompt.split(',')[0]?.trim() || `캐릭터 ${item.id}`
}

function refLabel<T extends CharRefItem | VibeItem>(item: T, prefix: string): string {
  return item.name || `${prefix} ${item.id}`
}

function SummaryChip({
  tone,
  label,
  onRemove
}: {
  tone: 'prompt' | 'ref' | 'vibe'
  label: string
  onRemove?: () => void
}): React.JSX.Element {
  if (!onRemove) return <></>
  return (
    <button
      className={cn(
        'flex max-w-44 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition hover:bg-paper',
        tone === 'prompt' &&
          'border-emerald-500/25 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        tone === 'ref' && 'border-sky-500/25 bg-sky-500/15 text-sky-700 dark:text-sky-300',
        tone === 'vibe' &&
          'border-fuchsia-500/25 bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300'
      )}
      title={label}
      onClick={onRemove}
    >
      <span className="truncate">{label}</span>
      <span className="text-faint">x</span>
    </button>
  )
}

function CombinedSelectionSummary({
  promptIds,
  characters,
  onRemovePrompt,
  charRefIds,
  charRefs,
  onRemoveCharRef,
  vibeIds,
  vibes,
  onRemoveVibe
}: {
  promptIds: number[]
  characters: CharacterCard[]
  onRemovePrompt: (id: number) => void
  charRefIds: number[]
  charRefs: CharRefItem[]
  onRemoveCharRef: (id: number) => void
  vibeIds: number[]
  vibes: VibeItem[]
  onRemoveVibe: (id: number) => void
}): React.JSX.Element {
  const prompts = promptIds
    .map((id) => characters.find((item) => item.id === id))
    .filter((item): item is CharacterCard => Boolean(item))
  const refs = charRefIds
    .map((id) => charRefs.find((item) => item.id === id))
    .filter((item): item is CharRefItem => Boolean(item))
  const vibeItems = vibeIds
    .map((id) => vibes.find((item) => item.id === id))
    .filter((item): item is VibeItem => Boolean(item))

  if (!prompts.length && !refs.length && !vibeItems.length) {
    return <p className="text-[12px] text-faint">선택한 항목이 없습니다.</p>
  }
  return (
    <div className="mt-1 flex max-h-14 flex-wrap gap-1 overflow-y-auto rounded-md border border-line/80 bg-surface/50 p-1">
      {prompts.map((item) => (
        <SummaryChip
          key={`prompt-${item.id}`}
          tone="prompt"
          label={`프롬프트 - ${characterLabel(item)}`}
          onRemove={() => onRemovePrompt(item.id)}
        />
      ))}
      {refs.map((item) => (
        <SummaryChip
          key={`ref-${item.id}`}
          tone="ref"
          label={`레퍼런스 - ${refLabel(item, '레퍼런스')}`}
          onRemove={() => onRemoveCharRef(item.id)}
        />
      ))}
      {vibeItems.map((item) => (
        <SummaryChip
          key={`vibe-${item.id}`}
          tone="vibe"
          label={`바이브 - ${refLabel(item, '바이브')}`}
          onRemove={() => onRemoveVibe(item.id)}
        />
      ))}
    </div>
  )
}

function SelectionSummary<T extends { id: number }>({
  selected,
  items,
  labelFor,
  onRemove
}: {
  selected: number[]
  items: T[]
  labelFor: (item: T) => string
  onRemove: (id: number) => void
}): React.JSX.Element | null {
  const selectedItems = selected
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is T => Boolean(item))
  if (!selectedItems.length) return null
  return (
    <div className="mb-2 flex max-h-16 flex-wrap gap-1 overflow-y-auto rounded-md border border-accent/25 bg-accent/10 p-1">
      {selectedItems.map((item) => (
        <button
          key={item.id}
          className="flex max-w-52 items-center gap-1 rounded bg-paper px-1.5 py-1 text-[11px] text-accent shadow-sm"
          onClick={() => onRemove(item.id)}
          title="제거"
        >
          <span className="truncate">{labelFor(item)}</span>
          <span className="text-faint">x</span>
        </button>
      ))}
    </div>
  )
}

function CharacterSelectionList({
  title,
  selected,
  folders,
  items,
  showSummary = true,
  onToggleFolder,
  onChange
}: {
  title: string
  selected: number[]
  folders: ListFolder[]
  items: CharacterCard[]
  showSummary?: boolean
  onToggleFolder: (id: number) => void
  onChange: (ids: number[]) => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const toggle = (id: number): void =>
    onChange(selectedSet.has(id) ? selected.filter((v) => v !== id) : [...selected, id])
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = buildDisplayRows(folders, items)
    if (!q) return all
    return all.filter(
      (row) =>
        row.type === 'item' &&
        (row.item.name.toLowerCase().includes(q) ||
          row.item.prompt.toLowerCase().includes(q) ||
          row.item.negativePrompt.toLowerCase().includes(q))
    )
  }, [folders, items, search])
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-muted">
          {title} <span className="font-normal text-faint">{selected.length}</span>
        </div>
        <div className="relative ml-auto w-56">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            className="h-7 pl-7 text-[12px]"
            value={search}
            placeholder="검색"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {showSummary && (
        <SelectionSummary
          selected={selected}
          items={items}
          labelFor={characterLabel}
          onRemove={toggle}
        />
      )}
      <div className="max-h-56 overflow-y-auto rounded-md border border-line bg-surface p-1">
        {rows.map((row) => {
          if (row.type === 'folder')
            return (
              <button
                key={`f-${row.folder.id}`}
                className="mt-1 flex h-8 w-full items-center gap-1.5 rounded-md bg-surface-2 px-2 text-left text-[12px] font-medium text-muted first:mt-0 hover:text-ink"
                style={
                  row.folder.color
                    ? {
                        backgroundColor: `color-mix(in srgb, ${row.folder.color} 22%, var(--surface-2))`
                      }
                    : undefined
                }
                onClick={() => onToggleFolder(row.folder.id)}
              >
                {row.folder.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className="truncate">{row.folder.name}</span>
              </button>
            )
          if (row.type === 'divider' || row.hidden) return null
          return (
            <button
              key={row.item.id}
              onClick={() => toggle(row.item.id)}
              className={cn(
                'mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2',
                selectedSet.has(row.item.id) && 'bg-accent/15 text-accent'
              )}
            >
              {row.item.thumbnail ? (
                <img
                  src={`data:image/webp;base64,${row.item.thumbnail}`}
                  className="size-8 shrink-0 rounded-md object-cover"
                  alt=""
                />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-paper text-faint">
                  <UserRound size={14} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">
                  {characterLabel(row.item)}
                </span>
                <span className="block truncate text-[11px] text-faint">
                  {row.item.prompt || row.item.negativePrompt || '빈 프롬프트'}
                </span>
              </span>
            </button>
          )
        })}
        {rows.length === 0 && <p className="px-2 py-2 text-[12px] text-faint">항목이 없습니다.</p>}
      </div>
    </div>
  )
}

function RefSelectionList<T extends CharRefItem | VibeItem>({
  title,
  selected,
  folders,
  items,
  fallbackPrefix,
  showSummary = true,
  onToggleFolder,
  onChange
}: {
  title: string
  selected: number[]
  folders: ListFolder[]
  items: T[]
  fallbackPrefix: string
  showSummary?: boolean
  onToggleFolder: (id: number) => void
  onChange: (ids: number[]) => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const toggle = (id: number): void =>
    onChange(selectedSet.has(id) ? selected.filter((v) => v !== id) : [...selected, id])
  const labelFor = (item: T): string => item.name || `${fallbackPrefix} ${item.id}`
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = buildDisplayRows(folders, items)
    if (!q) return all
    return all.filter(
      (row) =>
        row.type === 'item' &&
        (row.item.name.toLowerCase().includes(q) || String(row.item.id).includes(q))
    )
  }, [folders, items, search])
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="text-[12px] font-semibold text-muted">
          {title} <span className="font-normal text-faint">{selected.length}</span>
        </div>
        <div className="relative ml-auto w-56">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            className="h-7 pl-7 text-[12px]"
            value={search}
            placeholder="검색"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {showSummary && (
        <SelectionSummary selected={selected} items={items} labelFor={labelFor} onRemove={toggle} />
      )}
      <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-line bg-surface p-1">
        {rows.map((row) => {
          if (row.type === 'folder')
            return (
              <button
                key={`f-${row.folder.id}`}
                className="col-span-2 mt-1 flex h-8 w-full items-center gap-1.5 rounded-md bg-surface-2 px-2 text-left text-[12px] font-medium text-muted first:mt-0 hover:text-ink"
                style={
                  row.folder.color
                    ? {
                        backgroundColor: `color-mix(in srgb, ${row.folder.color} 22%, var(--surface-2))`
                      }
                    : undefined
                }
                onClick={() => onToggleFolder(row.folder.id)}
              >
                {row.folder.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                <span className="truncate">{row.folder.name}</span>
              </button>
            )
          if (row.type === 'divider' || row.hidden) return null
          return (
            <button
              key={row.item.id}
              onClick={() => toggle(row.item.id)}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2',
                selectedSet.has(row.item.id) && 'bg-accent/15 text-accent'
              )}
            >
              <img
                src={`data:image/webp;base64,${row.item.thumbnail}`}
                className="size-8 shrink-0 rounded-md object-cover"
                alt=""
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">
                  {labelFor(row.item)}
                </span>
                {'refType' in row.item && (
                  <span className="block truncate text-[11px] text-faint">{row.item.refType}</span>
                )}
              </span>
            </button>
          )
        })}
        {rows.length === 0 && (
          <p className="col-span-2 px-2 py-2 text-[12px] text-faint">항목이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

export function SceneAdditionDialog({
  scene,
  open,
  onOpenChange
}: {
  scene: Scene
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const stored = useScenesStore((s) => s.additions[scene.id])
  const loadAddition = useScenesStore((s) => s.loadSceneAddition)
  const setAddition = useScenesStore((s) => s.setSceneAddition)
  const clearAddition = useScenesStore((s) => s.clearSceneAddition)
  const characterFolders = useCharactersStore((s) => s.folders)
  const characters = useCharactersStore((s) => s.items)
  const loadCharacters = useCharactersStore((s) => s.load)
  const toggleCharacterFolder = useCharactersStore((s) => s.toggleCollapse)
  const charRefFolders = useCharRefsStore((s) => s.folders)
  const charRefs = useCharRefsStore((s) => s.items)
  const loadCharRefs = useCharRefsStore((s) => s.load)
  const toggleCharRefFolder = useCharRefsStore((s) => s.toggleCollapse)
  const vibeFolders = useVibesStore((s) => s.folders)
  const vibes = useVibesStore((s) => s.items)
  const loadVibes = useVibesStore((s) => s.load)
  const toggleVibeFolder = useVibesStore((s) => s.toggleCollapse)
  const current: SceneCharacterAddition = stored ?? {
    sceneId: scene.id,
    characterPromptIds: [],
    charRefIds: [],
    vibeIds: []
  }
  const [collapsed, setCollapsed] = useState(false)
  const empty =
    !current.characterPromptIds.length && !current.charRefIds.length && !current.vibeIds.length
  useEffect(() => {
    if (!open) return
    void loadAddition(scene.id)
    void loadCharacters()
    void loadCharRefs()
    void loadVibes()
  }, [open, scene.id, loadAddition, loadCharacters, loadCharRefs, loadVibes])
  const save = (patch: Partial<Omit<SceneCharacterAddition, 'sceneId'>>): void => {
    void setAddition({ ...current, ...patch, sceneId: scene.id })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-4 py-3">
          <DialogTitle>씬별 캐릭터 추가</DialogTitle>
          <DialogDescription>{scene.name}</DialogDescription>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto p-4">
          <div className="rounded-lg border border-line bg-paper p-3">
            <div className="flex items-start gap-2">
              <button
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                onClick={() => setCollapsed(!collapsed)}
                title={collapsed ? '펼치기' : '접기'}
              >
                {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex min-h-7 items-center gap-2">
                  <span className="text-[13px] font-semibold text-ink">{scene.name}</span>
                  {empty && (
                    <span className="rounded bg-danger/15 px-2 py-1 text-[11px] text-danger">
                      비어 있음
                    </span>
                  )}
                </div>
                <CombinedSelectionSummary
                  promptIds={current.characterPromptIds}
                  characters={characters}
                  onRemovePrompt={(id) =>
                    save({ characterPromptIds: current.characterPromptIds.filter((v) => v !== id) })
                  }
                  charRefIds={current.charRefIds}
                  charRefs={charRefs}
                  onRemoveCharRef={(id) =>
                    save({ charRefIds: current.charRefIds.filter((v) => v !== id) })
                  }
                  vibeIds={current.vibeIds}
                  vibes={vibes}
                  onRemoveVibe={(id) => save({ vibeIds: current.vibeIds.filter((v) => v !== id) })}
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => void clearAddition(scene.id)}
                title="비우기"
              >
                <Trash2 size={13} />
              </Button>
            </div>
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-3 overflow-hidden"
                >
                  <CharacterSelectionList
                    title="캐릭터 프롬프트"
                    selected={current.characterPromptIds}
                    folders={characterFolders}
                    items={characters}
                    showSummary={false}
                    onToggleFolder={toggleCharacterFolder}
                    onChange={(characterPromptIds) => save({ characterPromptIds })}
                  />
                  <RefSelectionList
                    title="캐릭터 레퍼런스"
                    selected={current.charRefIds}
                    folders={charRefFolders}
                    items={charRefs}
                    fallbackPrefix="레퍼런스"
                    showSummary={false}
                    onToggleFolder={toggleCharRefFolder}
                    onChange={(charRefIds) => save({ charRefIds })}
                  />
                  <RefSelectionList
                    title="바이브"
                    selected={current.vibeIds}
                    folders={vibeFolders}
                    items={vibes}
                    fallbackPrefix="바이브"
                    showSummary={false}
                    onToggleFolder={toggleVibeFolder}
                    onChange={(vibeIds) => save({ vibeIds })}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
