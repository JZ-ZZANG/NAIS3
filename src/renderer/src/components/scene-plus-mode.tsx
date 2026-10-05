import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CalendarPlus,
  CalendarX,
  Copy,
  Crosshair,
  FileDown,
  FileUp,
  FolderArchive,
  ImageOff,
  Loader2,
  Minus,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  Star,
  Trash2,
  UserRoundCog,
  UsersRound
} from 'lucide-react'
import type { ScenePlusScene } from '@shared/types'
import { characterCenterForModel, isV5Model } from '@shared/nai-models'
import { useGenerationStore } from '../stores/generation-store'
import { useScenePlusStore } from '../stores/scene-plus-store'
import { imageUrl } from '../lib/constants'
import { cn } from '../lib/utils'
import { askConfirm, askText } from '../stores/dialog-store'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Switch } from './ui/switch'
import { ResolutionPicker } from './resolution-picker'
import { ReserveCount } from './reserve-count'
import { PromptEditor } from './prompt-editor'
import { ImageContextMenu } from './image-context-menu'
import { Lightbox } from './lightbox'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { PresetDropdown as SharedPresetDropdown } from './scene-mode'
import { SceneCastDialog } from './scene-cast-dialog'
import { PositionPicker, V5PositionPicker } from './character-overlay'

function IconButton({
  children,
  title,
  active,
  onClick
}: {
  children: React.ReactNode
  title: string
  active?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={title}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'grid size-8 place-items-center rounded-md transition-colors',
            active ? 'bg-accent text-white' : 'text-muted hover:bg-surface-2 hover:text-fg'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

function CastAssignmentDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const casts = useScenePlusStore((state) => state.casts)
  const groups = useScenePlusStore((state) => state.groups)
  const castAssignments = useScenePlusStore((state) => state.castAssignments)
  const groupAssignments = useScenePlusStore((state) => state.groupAssignments)
  const assignmentSlotCount = useScenePlusStore((state) => state.assignmentSlotCount)
  const setCastSettings = useScenePlusStore((state) => state.setCastSettings)
  const [rowCount, setRowCount] = useState(0)
  const [values, setValues] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!open) return
    const next: Record<number, string> = {}
    for (const [slot, castId] of Object.entries(castAssignments))
      next[Number(slot)] = `cast:${castId}`
    for (const [slot, groupId] of Object.entries(groupAssignments))
      next[Number(slot)] = `group:${groupId}`
    setValues(next)
    setRowCount(assignmentSlotCount)
  }, [open, castAssignments, groupAssignments, assignmentSlotCount])

  const persist = (nextValues: Record<number, string>, nextRowCount: number): void => {
    const castAssignments: Record<number, number> = {}
    const groupAssignments: Record<number, number> = {}
    for (let slot = 1; slot <= nextRowCount; slot++) {
      const [kind, rawId] = (nextValues[slot] ?? '').split(':')
      const id = Number(rawId)
      if (!Number.isSafeInteger(id)) continue
      if (kind === 'cast') castAssignments[slot] = id
      if (kind === 'group') groupAssignments[slot] = id
    }
    void setCastSettings(castAssignments, groupAssignments, nextRowCount)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82vh] max-w-xl flex-col p-0">
        <div className="border-b border-line px-5 py-4">
          <DialogTitle>출연 설정</DialogTitle>
          <DialogDescription className="mt-1">
            씬+ 전체의 캐릭터 순서에 단일 출연 또는 출연 그룹을 배정합니다.
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {Array.from({ length: rowCount }, (_, index) => index + 1).map((slot) => (
            <div
              key={slot}
              className="flex items-center gap-3 rounded-lg border border-line bg-paper p-2"
            >
              <span className="w-20 shrink-0 text-[13px] font-medium">캐릭터 {slot}</span>
              <select
                value={values[slot] ?? ''}
                onChange={(event) => {
                  const next = { ...values, [slot]: event.target.value }
                  setValues(next)
                  persist(next, rowCount)
                }}
                className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-[13px]"
              >
                <option value="">미배정</option>
                {casts.length > 0 && (
                  <optgroup label="출연 목록">
                    {casts.map((cast) => (
                      <option key={cast.id} value={`cast:${cast.id}`}>
                        {cast.name || `출연 ${cast.id}`}
                      </option>
                    ))}
                  </optgroup>
                )}
                {groups.length > 0 && (
                  <optgroup label="출연 그룹">
                    {groups.map((group) => (
                      <option key={group.id} value={`group:${group.id}`}>
                        {group.name || `그룹 ${group.id}`} ({group.castIds.length}명)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <button
                className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                title={`캐릭터 ${slot} 제거`}
                onClick={() => {
                  const next: Record<number, string> = {}
                  for (let current = 1; current <= rowCount; current++) {
                    if (current < slot) next[current] = values[current] ?? ''
                    if (current > slot) next[current - 1] = values[current] ?? ''
                  }
                  const nextCount = Math.max(0, rowCount - 1)
                  setValues(next)
                  setRowCount(nextCount)
                  persist(next, nextCount)
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {rowCount === 0 && (
            <p className="py-8 text-center text-[12px] text-faint">
              캐릭터 추가를 눌러 출연 항목을 만드세요.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const nextCount = rowCount + 1
              setRowCount(nextCount)
              persist(values, nextCount)
            }}
          >
            <Plus size={13} /> 캐릭터 추가
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SceneSlotPosition({
  center,
  model,
  onPick
}: {
  center: { x: number; y: number } | undefined
  model: string
  onPick: (center: { x: number; y: number }) => void
}): React.JSX.Element {
  const v5 = isV5Model(model)
  const displayCenter = characterCenterForModel(model, center ?? { x: 0.5, y: 0.5 })
  const coordinateText = v5
    ? `${displayCenter.x.toFixed(3)},${displayCenter.y.toFixed(3)}`
    : `${displayCenter.x.toFixed(1)},${displayCenter.y.toFixed(1)}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            'ml-auto h-7 shrink-0 justify-start gap-1 px-1.5 font-mono text-[11px]',
            v5 ? 'w-[104px]' : 'w-20'
          )}
        >
          <Crosshair size={13} />
          {coordinateText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        {v5 ? (
          <V5PositionPicker center={displayCenter} onPick={onPick} />
        ) : (
          <PositionPicker center={displayCenter} onPick={onPick} />
        )}
      </PopoverContent>
    </Popover>
  )
}

function SceneEditor({ scene }: { scene: ScenePlusScene }): React.JSX.Element {
  const update = useScenePlusStore((state) => state.updateScene)
  const selectScene = useScenePlusStore((state) => state.selectScene)
  const generateOne = useScenePlusStore((state) => state.generateOne)
  const setReserve = useScenePlusStore((state) => state.setReserve)
  const images = useScenePlusStore((state) => state.images)
  const imagesTotal = useScenePlusStore((state) => state.imagesTotal)
  const imagesLoading = useScenePlusStore((state) => state.imagesLoading)
  const favoritesOnly = useScenePlusStore((state) => state.favoritesOnly)
  const loadImages = useScenePlusStore((state) => state.loadImages)
  const toggleFavorite = useScenePlusStore((state) => state.toggleFavorite)
  const deleteImage = useScenePlusStore((state) => state.deleteImage)
  const setFavoritesOnly = useScenePlusStore((state) => state.setFavoritesOnly)
  const batchCount = useGenerationStore((state) => state.batchCount)
  const model = useGenerationStore((state) => state.request.model)
  const previewPng = useGenerationStore((state) => state.previewPng)
  const generatingSceneId = useGenerationStore(
    (state) =>
      state.queue?.items.find((item) => item.state === 'generating')?.request.scenePlusId ?? null
  )
  const streaming = generatingSceneId === scene.id
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [imageColumns, setImageColumns] = useState(3)
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const setSlots = (slots: ScenePlusScene['slots']): void => void update(scene.id, { slots })

  useEffect(() => {
    const element = sentinelRef.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && images.length < imagesTotal && !imagesLoading)
          void loadImages(scene.id, false)
      },
      { rootMargin: '800px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [scene.id, images.length, imagesTotal, imagesLoading, loadImages])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && lightboxIndex < 0) selectScene(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, selectScene])

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => selectScene(null)}>
          <ArrowLeft size={15} /> 씬 목록
        </Button>
        <input
          value={scene.name}
          onChange={(event) => void update(scene.id, { name: event.target.value })}
          className="min-w-0 flex-1 truncate rounded-md bg-transparent px-2 py-1 text-[15px] font-medium outline-none focus:bg-surface-2"
        />
        <ResolutionPicker
          width={scene.width}
          height={scene.height}
          onPick={(width, height) => void update(scene.id, { width, height })}
          className="w-40"
        />
        <Button
          size="sm"
          variant="accent"
          className="gap-1"
          onClick={() => void generateOne(scene.id)}
        >
          <Play size={13} /> 생성
        </Button>
        <div className="flex items-center gap-0.5 rounded-full bg-surface-2 p-0.5">
          <button
            className="grid size-6 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"
            disabled={scene.reserveCount === 0}
            onClick={() => void setReserve(scene.id, scene.reserveCount - batchCount)}
          >
            <Minus size={13} />
          </button>
          <ReserveCount
            value={scene.reserveCount}
            className="min-w-6 px-1 text-center text-[12px] font-medium"
            onCommit={(count) => void setReserve(scene.id, count)}
          />
          <button
            className="grid size-6 place-items-center rounded-full hover:bg-surface-2"
            onClick={() => void setReserve(scene.id, scene.reserveCount + batchCount)}
          >
            <Plus size={13} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
        <div className="grid gap-2">
          <PromptEditor
            value={scene.prompt}
            onValueChange={(prompt) => void update(scene.id, { prompt })}
            placeholder="씬 프롬프트"
            className="h-32 max-h-[520px] min-h-24 resize-y"
          />
          <PromptEditor
            value={scene.negativePrompt}
            onValueChange={(negativePrompt) => void update(scene.id, { negativePrompt })}
            placeholder="씬 네거티브 프롬프트"
            negative
            className="h-20 max-h-96 min-h-16 resize-y"
          />
        </div>

        <div className="mt-5 flex items-center gap-2 border-t border-line pt-4">
          <h3 className="text-[14px] font-semibold">캐릭터 프롬프트</h3>
          <span className="text-xs text-faint">{scene.slots.length}명</span>
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            위치 설정
            <Switch
              checked={scene.useCoords}
              onCheckedChange={(useCoords) =>
                void update(scene.id, {
                  useCoords,
                  ...(useCoords
                    ? {
                        slots: scene.slots.map((slot) => ({
                          ...slot,
                          center: slot.center ?? { x: 0.5, y: 0.5 }
                        }))
                      }
                    : {})
                })
              }
            />
          </div>
          <Button
            size="sm"
            onClick={() =>
              setSlots([
                ...scene.slots,
                {
                  index: scene.slots.length + 1,
                  prompt: '',
                  negativePrompt: '',
                  center: { x: 0.5, y: 0.5 }
                }
              ])
            }
          >
            <Plus size={13} /> 캐릭터 추가
          </Button>
        </div>

        <div className="mt-3 space-y-3">
          {scene.slots.map((slot, index) => (
            <div key={slot.index} className="rounded-lg border border-line bg-paper p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent">
                  {index + 1}
                </span>
                <span className="text-[13px] font-semibold">캐릭터 {index + 1}</span>
                {scene.useCoords && (
                  <SceneSlotPosition
                    center={slot.center}
                    model={model}
                    onPick={(center) =>
                      setSlots(
                        scene.slots.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, center } : item
                        )
                      )
                    }
                  />
                )}
                <button
                  className={cn(
                    'grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger',
                    !scene.useCoords && 'ml-auto'
                  )}
                  disabled={scene.slots.length <= 1}
                  onClick={() =>
                    setSlots(
                      scene.slots
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((item, itemIndex) => ({ ...item, index: itemIndex + 1 }))
                    )
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PromptEditor
                  value={slot.prompt}
                  placeholder="이 캐릭터의 동작·표정·의상 등"
                  className="h-20 min-h-20 resize-y"
                  onValueChange={(prompt) =>
                    setSlots(
                      scene.slots.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, prompt } : item
                      )
                    )
                  }
                />
                <PromptEditor
                  value={slot.negativePrompt}
                  placeholder="이 캐릭터의 네거티브 프롬프트"
                  negative
                  className="h-20 min-h-20 resize-y"
                  onValueChange={(negativePrompt) =>
                    setSlots(
                      scene.slots.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, negativePrompt } : item
                      )
                    )
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mb-2 mt-4 flex items-center gap-2 border-t border-line pt-4 text-[12px] text-muted">
          <span className="font-medium text-fg">생성 이미지</span>
          <span>{imagesTotal.toLocaleString()}장</span>
          <div className="flex-1" />
          <button
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={cn(
              'flex h-6 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium transition-colors',
              favoritesOnly
                ? 'bg-amber-400/90 text-black'
                : 'bg-surface-2 text-muted hover:text-ink'
            )}
          >
            <Star size={12} fill={favoritesOnly ? 'currentColor' : 'none'} /> 즐겨찾기
          </button>
          <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {[2, 3, 4, 5].map((count) => (
              <button
                key={count}
                className={cn(
                  'grid h-5 w-5 place-items-center rounded text-[11px] font-medium',
                  imageColumns === count ? 'bg-paper text-ink' : 'text-muted hover:text-ink'
                )}
                onClick={() => setImageColumns(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {!images.length && !imagesLoading && !streaming ? (
          <p className="py-10 text-center text-[13px] text-faint">
            {favoritesOnly ? '즐겨찾기 이미지가 없습니다.' : '아직 생성된 이미지가 없습니다.'}
          </p>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${imageColumns}, minmax(0, 1fr))` }}
          >
            {streaming && (
              <div
                className="relative overflow-hidden rounded-md bg-surface-2 ring-2 ring-accent/50"
                style={{ aspectRatio: `${scene.width} / ${scene.height}` }}
              >
                {previewPng ? (
                  <img
                    src={`data:image/png;base64,${previewPng}`}
                    className="h-full w-full object-cover"
                    alt=""
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center">
                    <Loader2 size={26} className="animate-spin text-accent" />
                  </div>
                )}
                <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  생성 중
                </span>
              </div>
            )}
            {images.map((image, index) => (
              <ImageContextMenu
                key={image.id}
                filePath={image.filePath}
                onDelete={() => void deleteImage(image.id)}
              >
                <div
                  className="group relative overflow-hidden rounded-md bg-surface-2"
                  style={{ aspectRatio: `${scene.width} / ${scene.height}` }}
                >
                  <img
                    src={imageUrl(image.filePath)}
                    className="h-full w-full cursor-pointer object-cover"
                    loading="lazy"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData('nais/file-path', image.filePath)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => setLightboxIndex(index)}
                    alt=""
                  />
                  <button
                    className={cn(
                      'absolute left-1 top-1 grid size-6 place-items-center rounded-full backdrop-blur transition',
                      image.favorite
                        ? 'bg-amber-400/90 text-black'
                        : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'
                    )}
                    onClick={() => void toggleFavorite(image.id)}
                  >
                    <Star size={13} fill={image.favorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition hover:bg-danger group-hover:opacity-100"
                    onClick={() => void deleteImage(image.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </ImageContextMenu>
            ))}
          </div>
        )}
        <div ref={sentinelRef} className="h-4" />
        {imagesLoading && <p className="py-3 text-center text-[12px] text-faint">불러오는 중...</p>}
      </div>
      {lightboxIndex >= 0 && (
        <Lightbox
          filePaths={images.map((image) => image.filePath)}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(-1)}
        />
      )}
    </section>
  )
}

const CARD_ASPECT = { portrait: '832 / 1216', landscape: '1216 / 832', square: '1 / 1' }

function SceneCard({
  scene,
  orientation,
  editMode,
  selected,
  onToggle
}: {
  scene: ScenePlusScene
  orientation: keyof typeof CARD_ASPECT
  editMode: boolean
  selected: boolean
  onToggle: () => void
}): React.JSX.Element {
  const selectScene = useScenePlusStore((state) => state.selectScene)
  const updateScene = useScenePlusStore((state) => state.updateScene)
  const duplicateScene = useScenePlusStore((state) => state.duplicateScene)
  const deleteScene = useScenePlusStore((state) => state.deleteScene)
  const setReserve = useScenePlusStore((state) => state.setReserve)
  const batchCount = useGenerationStore((state) => state.batchCount)
  const previewPng = useGenerationStore((state) => state.previewPng)
  const generatingSceneId = useGenerationStore(
    (state) =>
      state.queue?.items.find((item) => item.state === 'generating')?.request.scenePlusId ?? null
  )
  const src =
    generatingSceneId === scene.id && previewPng
      ? `data:image/png;base64,${previewPng}`
      : scene.thumbnail
        ? `data:image/webp;base64,${scene.thumbnail}`
        : scene.thumbnailPath
          ? imageUrl(scene.thumbnailPath)
          : null

  const remove = async (): Promise<void> => {
    if (
      await askConfirm('씬 삭제', {
        message: `'${scene.name}' 씬을 삭제합니다.`,
        confirmLabel: '삭제',
        danger: true
      })
    )
      void deleteScene(scene.id)
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-lg border bg-surface-2 transition',
        editMode && selected ? 'border-accent ring-2 ring-accent/40' : 'border-line'
      )}
      style={{ aspectRatio: CARD_ASPECT[orientation] }}
      onClick={() => (editMode ? onToggle() : selectScene(scene.id))}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-paper text-faint">
          <ImageOff size={26} strokeWidth={1.3} />
        </div>
      )}
      {scene.reserveCount > 0 && (
        <span className="absolute left-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1.5 text-[12px] font-bold text-white shadow">
          {scene.reserveCount}
        </span>
      )}
      {editMode ? (
        <span
          className={cn(
            'absolute right-1.5 top-1.5 grid size-5 place-items-center rounded border-2 transition',
            selected ? 'border-accent bg-accent text-white' : 'border-white/80 bg-black/30'
          )}
        >
          {selected && <span className="text-[11px] leading-none">✓</span>}
        </span>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
              aria-label={`${scene.name} 메뉴`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical size={14} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-40 p-1"
            onClick={(event) => event.stopPropagation()}
          >
            <MenuItem
              icon={<Pencil size={13} />}
              label="이름 변경"
              onClick={async () => {
                const name = await askText('씬 이름', scene.name)
                if (name) void updateScene(scene.id, { name })
              }}
            />
            <MenuItem
              icon={<Copy size={13} />}
              label="복제"
              onClick={() => void duplicateScene(scene.id)}
            />
            <MenuItem
              icon={<Trash2 size={13} />}
              label="삭제"
              danger
              onClick={() => void remove()}
            />
          </PopoverContent>
        </Popover>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-7">
        <div className="pointer-events-auto flex items-end justify-between gap-1">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-white drop-shadow">
              {scene.name}
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/55 p-0.5"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="grid size-5 place-items-center rounded-full text-white hover:bg-white/20 disabled:opacity-30"
              disabled={scene.reserveCount === 0}
              onClick={() => void setReserve(scene.id, scene.reserveCount - batchCount)}
            >
              <Minus size={13} />
            </button>
            <ReserveCount
              value={scene.reserveCount}
              className="min-w-5 px-1 text-center text-[12px] font-medium text-white"
              inputClassName="bg-black/70 text-white"
              onCommit={(count) => void setReserve(scene.id, count)}
            />
            <button
              className="grid size-5 place-items-center rounded-full text-white hover:bg-white/20"
              onClick={() => void setReserve(scene.id, scene.reserveCount + batchCount)}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  danger,
  onClick
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2',
        danger && 'text-danger'
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

export function ScenePlusMode(): React.JSX.Element {
  const store = useScenePlusStore()
  const load = useScenePlusStore((state) => state.load)
  const columns = useScenePlusStore((state) => state.columns)
  const setColumns = useScenePlusStore((state) => state.setColumns)
  const orientation = useScenePlusStore((state) => state.cardOrientation)
  const setOrientation = useScenePlusStore((state) => state.setCardOrientation)
  const [editMode, setEditMode] = useState(false)
  const [selection, setSelection] = useState<Set<number>>(new Set())
  const [castManagerOpen, setCastManagerOpen] = useState(false)
  const [castAssignmentOpen, setCastAssignmentOpen] = useState(false)
  const batchCount = useGenerationStore((state) => state.batchCount)

  useEffect(() => {
    void load()
  }, [load])

  const selected = store.scenes.find((item) => item.id === store.selectedSceneId)
  const assignmentSummary = [
    ...Object.entries(store.castAssignments).map(([slot, castId]) => ({
      slot: Number(slot),
      label: store.casts.find((cast) => cast.id === castId)?.name ?? '삭제된 출연'
    })),
    ...Object.entries(store.groupAssignments).map(([slot, groupId]) => {
      const group = store.groups.find((item) => item.id === groupId)
      const members = group?.castIds
        .map((castId) => store.casts.find((cast) => cast.id === castId)?.name)
        .filter(Boolean)
        .join(', ')
      return {
        slot: Number(slot),
        label: `${group?.name ?? '삭제된 그룹'}${members ? ` (${members})` : ''}`
      }
    })
  ].sort((a, b) => a.slot - b.slot)

  if (selected) return <SceneEditor scene={selected} />

  const toggleSelected = (id: number): void => {
    setSelection((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const adjustSelected = (delta: number): void => {
    for (const scene of store.scenes) {
      if (selection.has(scene.id))
        void store.setReserve(scene.id, scene.reserveCount + delta * batchCount)
    }
  }

  const deleteSelected = async (): Promise<void> => {
    if (!selection.size) return
    if (
      !(await askConfirm('씬 삭제', {
        message: `선택한 씬 ${selection.size}개를 삭제합니다.`,
        confirmLabel: '삭제',
        danger: true
      }))
    )
      return
    await Promise.all([...selection].map((id) => store.deleteScene(id)))
    setSelection(new Set())
  }

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-line bg-surface">
        <header className="flex items-center gap-1 border-b border-line px-2 py-1.5">
          <SharedPresetDropdown mode="scene-plus" />
          <button
            className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-paper px-2.5 text-[12.5px] font-medium text-muted hover:bg-surface-2 hover:text-ink"
            onClick={() => setCastManagerOpen(true)}
          >
            <UsersRound size={13} /> 출연관리
          </button>
          <div className="group relative">
            <button
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium',
                assignmentSummary.length
                  ? 'border-accent/60 bg-accent/10 text-accent'
                  : 'border-line bg-paper text-muted hover:bg-surface-2 hover:text-ink'
              )}
              onClick={() => setCastAssignmentOpen(true)}
            >
              <UserRoundCog size={13} /> 출연설정
              {assignmentSummary.length > 0 && (
                <span className="font-mono text-[10px]">{assignmentSummary.length}</span>
              )}
            </button>
            <div className="invisible absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-line bg-surface p-2 opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100">
              <p className="mb-1.5 text-[11px] font-semibold text-muted">씬+ 출연 설정</p>
              {assignmentSummary.length ? (
                <div className="max-h-60 space-y-1 overflow-y-auto">
                  {assignmentSummary.map((item) => (
                    <div
                      key={`${item.slot}-${item.label}`}
                      className="flex gap-2 rounded-md bg-surface-2 px-2 py-1.5 text-[12px]"
                    >
                      <span className="shrink-0 font-medium text-accent">캐릭터 {item.slot}</span>
                      <span className="min-w-0 truncate text-ink">{item.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-1 py-2 text-[12px] text-faint">설정된 출연이 없습니다.</p>
              )}
            </div>
          </div>
          <div className="mx-1 h-5 w-px bg-line" />
          <IconButton title="JSON 내보내기" onClick={() => void store.exportJson()}>
            <FileDown size={16} />
          </IconButton>
          <IconButton title="JSON 불러오기" onClick={() => void store.importJson()}>
            <FileUp size={16} />
          </IconButton>
          <IconButton title="ZIP 내보내기" onClick={() => void store.exportZip()}>
            <FolderArchive size={16} />
          </IconButton>
          <IconButton
            title="편집 모드"
            active={editMode}
            onClick={() => {
              setEditMode(!editMode)
              setSelection(new Set())
            }}
          >
            <Pencil size={16} />
          </IconButton>

          <div className="flex-1" />

          <IconButton
            title="모든 씬에 1회 예약"
            onClick={() => void store.adjustReserveAll(batchCount)}
          >
            <CalendarPlus size={16} />
          </IconButton>
          <IconButton title="모든 예약 취소" onClick={() => void store.clearReserveAll()}>
            <CalendarX size={16} />
          </IconButton>
          <div className="mx-1 h-5 w-px bg-line" />
          <IconButton
            title={
              orientation === 'portrait'
                ? '세로 카드 (클릭: 가로)'
                : orientation === 'landscape'
                  ? '가로 카드 (클릭: 정사각형)'
                  : '정사각형 카드 (클릭: 세로)'
            }
            onClick={() =>
              setOrientation(
                orientation === 'portrait'
                  ? 'landscape'
                  : orientation === 'landscape'
                    ? 'square'
                    : 'portrait'
              )
            }
          >
            {orientation === 'portrait' ? (
              <RectangleVertical size={16} />
            ) : orientation === 'landscape' ? (
              <RectangleHorizontal size={16} />
            ) : (
              <Square size={16} />
            )}
          </IconButton>
          <div className="flex items-center gap-0.5 rounded-md bg-surface-2 p-0.5">
            {[2, 3, 4, 5].map((count) => (
              <button
                key={count}
                className={cn(
                  'grid h-6 w-6 place-items-center rounded text-[12px] font-medium',
                  columns === count ? 'bg-paper text-ink shadow-sm' : 'text-muted hover:text-ink'
                )}
                aria-label={`${count}열`}
                onClick={() => setColumns(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </header>

        {editMode && (
          <div className="flex items-center gap-2 border-b border-line bg-surface-2/50 px-3 py-2">
            <span className="text-[12px] font-medium">{selection.size}개 선택</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelection(new Set(store.scenes.map((scene) => scene.id)))}
            >
              전체 선택
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}>
              선택 해제
            </Button>
            <div className="mx-1 h-4 w-px bg-line" />
            <div className="flex items-center gap-0.5 rounded-full border border-line bg-paper p-0.5">
              <span className="px-1.5 text-[12px] text-muted">예약</span>
              <button
                className="grid size-5 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"
                disabled={!selection.size}
                onClick={() => adjustSelected(-1)}
              >
                <Minus size={13} />
              </button>
              <button
                className="grid size-5 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"
                disabled={!selection.size}
                onClick={() => adjustSelected(1)}
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={!selection.size}
              onClick={() => void deleteSelected()}
            >
              <Trash2 size={13} /> 삭제
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3 no-scrollbar">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {store.scenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                orientation={orientation}
                editMode={editMode}
                selected={selection.has(scene.id)}
                onToggle={() => toggleSelected(scene.id)}
              />
            ))}
            <button
              className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-faint transition hover:text-accent"
              style={{ aspectRatio: CARD_ASPECT[orientation] }}
              onClick={() => void store.createScene()}
            >
              <Plus size={22} />
              <span className="text-[12px]">씬 추가</span>
            </button>
          </div>
          {!store.scenes.length && (
            <p className="mt-6 text-center text-[13px] text-faint">
              프롬프트와 해상도를 저장할 씬을 추가하세요.
            </p>
          )}
        </div>
      </div>
      {castManagerOpen && (
        <SceneCastDialog mode="scene-plus" onClose={() => setCastManagerOpen(false)} />
      )}
      <CastAssignmentDialog open={castAssignmentOpen} onOpenChange={setCastAssignmentOpen} />
    </>
  )
}
