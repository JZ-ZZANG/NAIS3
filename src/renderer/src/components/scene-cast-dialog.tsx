import { useState } from 'react'
import {
  Check,
  ImageIcon,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  UsersRound,
  Waves,
  X,
  type LucideIcon
} from 'lucide-react'
import type { CharacterCard, CharRefItem, SceneCast, SceneCastGroup, VibeItem } from '@shared/types'
import { cn } from '../lib/utils'
import { useCharactersStore } from '../stores/characters-store'
import { useCharRefsStore, useVibesStore } from '../stores/refs-store'
import { nextCastColor, useScenesStore } from '../stores/scenes-store'
import { useScenePlusStore } from '../stores/scene-plus-store'
import { SortableList, SortableRow } from './sortable-list'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { useT } from '../lib/i18n'

const PLUS_CAST_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#06b6d4']

/**
 * 출연(Cast) 관리 — 예약에 붙는 캐릭터/레퍼런스 구성을 편집.
 * 상단 빌더에서 캐릭터/캐릭레퍼/바이브를 선택한 뒤 "출연 추가"로 확정하고,
 * 하단 목록에서 기존 출연을 편집/삭제한다. 출연마다 고유색이 자동 배정되어
 * 씬 카드 예약 배지에 그 색으로 표시된다 (사이드바 예약 = 빨강).
 */
export function SceneCastDialog({
  onClose,
  mode = 'scene'
}: {
  onClose: () => void
  mode?: 'scene' | 'scene-plus'
}): React.JSX.Element {
  const t = useT()
  const sceneCasts = useScenesStore((s) => s.casts)
  const sceneAddCast = useScenesStore((s) => s.addCast)
  const sceneUpdateCast = useScenesStore((s) => s.updateCast)
  const sceneRemoveCast = useScenesStore((s) => s.removeCast)
  const sceneGroups = useScenesStore((s) => s.groups)
  const sceneAddGroup = useScenesStore((s) => s.addGroup)
  const sceneUpdateGroup = useScenesStore((s) => s.updateGroup)
  const sceneRemoveGroup = useScenesStore((s) => s.removeGroup)
  const sceneReorderCasts = useScenesStore((s) => s.reorderCasts)
  const plusCasts = useScenePlusStore((s) => s.casts)
  const plusCreateCast = useScenePlusStore((s) => s.createCast)
  const plusUpdateCast = useScenePlusStore((s) => s.updateCast)
  const plusDeleteCast = useScenePlusStore((s) => s.deleteCast)
  const plusReorderCasts = useScenePlusStore((s) => s.reorderCasts)
  const plusGroups = useScenePlusStore((s) => s.groups)
  const plusCreateGroup = useScenePlusStore((s) => s.createGroup)
  const plusUpdateGroup = useScenePlusStore((s) => s.updateGroup)
  const plusDeleteGroup = useScenePlusStore((s) => s.deleteGroup)
  const isPlus = mode === 'scene-plus'
  const casts: SceneCast[] = isPlus
    ? plusCasts.map((cast, index) => ({
        id: String(cast.id),
        name: cast.name,
        color: PLUS_CAST_COLORS[index % PLUS_CAST_COLORS.length],
        characterIds: cast.characterPromptId == null ? [] : [cast.characterPromptId],
        charRefIds: cast.charRefIds,
        vibeIds: cast.vibeIds
      }))
    : sceneCasts
  const groups: SceneCastGroup[] = isPlus
    ? plusGroups.map((group) => ({
        id: String(group.id),
        name: group.name,
        castIds: group.castIds.map(String)
      }))
    : sceneGroups
  const addCast = (
    data: Pick<SceneCast, 'name' | 'characterIds' | 'charRefIds' | 'vibeIds'>
  ): void => {
    if (isPlus) {
      void plusCreateCast({
        name: data.name,
        characterPromptId: data.characterIds[0] ?? null,
        charRefIds: data.charRefIds,
        vibeIds: data.vibeIds
      })
    } else sceneAddCast(data)
  }
  const updateCast = (id: string, patch: Partial<SceneCast>): void => {
    if (isPlus) {
      void plusUpdateCast(Number(id), {
        name: patch.name,
        characterPromptId: patch.characterIds?.[0] ?? null,
        charRefIds: patch.charRefIds,
        vibeIds: patch.vibeIds
      })
    } else sceneUpdateCast(id, patch)
  }
  const removeCast = (id: string): void => {
    if (isPlus) void plusDeleteCast(Number(id))
    else sceneRemoveCast(id)
  }
  const reorderCasts = (ids: string[]): void => {
    if (isPlus) void plusReorderCasts(ids.map(Number))
    else sceneReorderCasts(ids)
  }
  const addGroup = (data: Pick<SceneCastGroup, 'name' | 'castIds'>): void => {
    if (isPlus) void plusCreateGroup({ name: data.name, castIds: data.castIds.map(Number) })
    else sceneAddGroup(data)
  }
  const updateGroup = (id: string, patch: Partial<SceneCastGroup>): void => {
    if (isPlus)
      void plusUpdateGroup(Number(id), {
        name: patch.name,
        castIds: patch.castIds?.map(Number)
      })
    else sceneUpdateGroup(id, patch)
  }
  const removeGroup = (id: string): void => {
    if (isPlus) void plusDeleteGroup(Number(id))
    else sceneRemoveGroup(id)
  }
  const characters = useCharactersStore((s) => s.items)
  const charFolders = useCharactersStore((s) => s.folders)
  const charRefs = useCharRefsStore((s) => s.items) as CharRefItem[]
  const vibes = useVibesStore((s) => s.items) as VibeItem[]

  // 빌더 — 선택을 모아뒀다가 "출연 추가"(또는 편집 중이면 "변경 저장")로 확정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [characterIds, setCharacterIds] = useState<number[]>([])
  const [charRefIds, setCharRefIds] = useState<number[]>([])
  const [vibeIds, setVibeIds] = useState<number[]>([])
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupCastIds, setGroupCastIds] = useState<string[]>([])
  const [openSection, setOpenSection] = useState<'casts' | 'groups'>('casts')

  const editing = editingId ? (casts.find((c) => c.id === editingId) ?? null) : null
  const builderColor = editing ? editing.color : nextCastColor(casts)
  const hasSelection = characterIds.length > 0 || charRefIds.length > 0 || vibeIds.length > 0

  const toggle = (ids: number[], setIds: (v: number[]) => void, id: number): void =>
    setIds(ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id])

  const resetBuilder = (): void => {
    setEditingId(null)
    setName('')
    setCharacterIds([])
    setCharRefIds([])
    setVibeIds([])
  }

  const startEdit = (cast: SceneCast): void => {
    setOpenSection('casts')
    setEditingId(cast.id)
    setName(cast.name)
    setCharacterIds(cast.characterIds)
    setCharRefIds(cast.charRefIds)
    setVibeIds(cast.vibeIds)
  }

  const submit = (): void => {
    const data = {
      name: name.trim() || t('ui.castValue', casts.length + 1),
      characterIds,
      charRefIds,
      vibeIds
    }
    if (editingId) updateCast(editingId, data)
    else addCast(data)
    resetBuilder()
  }

  const resetGroupBuilder = (): void => {
    setEditingGroupId(null)
    setGroupName('')
    setGroupCastIds([])
  }

  const submitGroup = (): void => {
    if (!groupCastIds.length) return
    const data = {
      name: groupName.trim() || t('ui.castGroupValue', groups.length + 1),
      castIds: groupCastIds
    }
    if (editingGroupId) updateGroup(editingGroupId, data)
    else addGroup(data)
    resetGroupBuilder()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[86vh] max-w-4xl flex-col p-0">
        <div className="shrink-0 border-b border-line px-5 py-3.5">
          <DialogTitle className="text-[15px]">{t('ui.manageCasts.5271e10')}</DialogTitle>
          <p className="mt-1 text-[12px] text-muted">
            {t('ui.aCastIsTheCharacterReferenceSetupAttachedToQueuesSelectBelowToAdabc5220')}
          </p>
        </div>

        {/* ── 빌더: 선택 → 출연 추가 ── */}
        <div className="shrink-0 border-b border-line px-5 py-3">
          <div className="mb-2.5 flex items-center gap-2">
            <span
              className="size-5 shrink-0 rounded-md shadow-inner"
              style={{ backgroundColor: builderColor }}
              title={t('ui.queueBadgeColorForThisCast')}
            />
            <Input
              className="h-8 max-w-xs"
              value={name}
              placeholder={t('ui.castNameEGMikuLeaveEmptyForCastValue', casts.length + 1)}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex-1" />
            {editingId && (
              <Button size="sm" variant="ghost" className="gap-1 text-muted" onClick={resetBuilder}>
                <X size={13} /> {t('ui.cancelEdit')}
              </Button>
            )}
            <Button
              size="sm"
              variant="accent"
              className="gap-1"
              disabled={!hasSelection && !name.trim()}
              onClick={submit}
            >
              {editingId ? (
                <>
                  <Check size={13} /> {t('ui.saveChanges')}
                </>
              ) : (
                <>
                  <Plus size={13} /> {t('ui.addCast')}
                </>
              )}
            </Button>
          </div>

          {/* 3열 선택자 — 높이 고정(각자 스크롤)이라 내용에 따라 레이아웃이 튀지 않음 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section>
              <SectionTitle
                icon={UserRound}
                label={t('ui.characterPrompts')}
                count={characterIds.length}
              />
              <div className="h-52 space-y-0.5 overflow-y-auto rounded-md border border-line bg-paper p-1.5">
                {characters.length === 0 && <EmptyNote text={t('ui.noCharacterPrompts')} />}
                <CharacterChecklist
                  characters={characters}
                  folders={charFolders}
                  selectedIds={characterIds}
                  onToggle={(id) =>
                    isPlus ? setCharacterIds([id]) : toggle(characterIds, setCharacterIds, id)
                  }
                />
              </div>
            </section>
            <section>
              <SectionTitle
                icon={ImageIcon}
                label={t('ui.characterReference')}
                count={charRefIds.length}
              />
              <ThumbGrid
                items={charRefs}
                selectedIds={charRefIds}
                emptyText={t('ui.noCharacterReferences')}
                onToggle={(id) => toggle(charRefIds, setCharRefIds, id)}
              />
            </section>
            <section>
              <SectionTitle icon={Waves} label={t('ui.vibeReferences')} count={vibeIds.length} />
              <ThumbGrid
                items={vibes}
                selectedIds={vibeIds}
                emptyText={t('ui.noVibeReferences')}
                onToggle={(id) => toggle(vibeIds, setVibeIds, id)}
              />
            </section>
          </div>

          {/* 선택 요약 칩 (클릭 = 해제) — 공간 미리 확보해서 선택해도 높이가 안 변함 */}
          <div className="mt-2 flex min-h-7 flex-wrap items-center gap-1.5">
            {!hasSelection && (
              <span className="text-[11px] text-faint">
                {t('ui.selectedCharactersReferencesAppearHere')}
              </span>
            )}
            {characterIds.map((id) => {
              const c = characters.find((x) => x.id === id)
              return (
                <Chip
                  key={`c${id}`}
                  color="sky"
                  label={
                    c
                      ? c.name || c.prompt.split(',')[0] || t('ui.character')
                      : t('ui.deletedCharacter')
                  }
                  onRemove={() => toggle(characterIds, setCharacterIds, id)}
                />
              )
            })}
            {charRefIds.map((id, i) => (
              <Chip
                key={`r${id}`}
                color="emerald"
                label={charRefs.find((x) => x.id === id)?.name || t('ui.referenceValue', i + 1)}
                onRemove={() => toggle(charRefIds, setCharRefIds, id)}
              />
            ))}
            {vibeIds.map((id, i) => (
              <Chip
                key={`v${id}`}
                color="violet"
                label={vibes.find((x) => x.id === id)?.name || t('ui.vibeValue', i + 1)}
                onRemove={() => toggle(vibeIds, setVibeIds, id)}
              />
            ))}
          </div>
        </div>

        {/* 출연 목록/그룹은 한 줄짜리 가로 탭으로 전환해 세로 공간을 확보한다. */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-line">
          <div className="grid h-10 shrink-0 grid-cols-2 border-b border-line">
            <button
              className={cn(
                'flex items-center justify-center gap-2 border-r border-line text-[12.5px] hover:bg-surface-2',
                openSection === 'casts' && 'bg-surface-2/60 font-semibold text-accent'
              )}
              onClick={() => setOpenSection('casts')}
            >
              <UserRound size={14} className="text-sky-500" />
              <span>{t('ui.castList')}</span>
              <span className="rounded-full border border-line px-1.5 text-[10px] text-muted">
                {t('ui.valueCasts', casts.length)}
              </span>
            </button>
            <button
              className={cn(
                'flex items-center justify-center gap-2 text-[12.5px] hover:bg-surface-2',
                openSection === 'groups' && 'bg-surface-2/60 font-semibold text-accent'
              )}
              onClick={() => setOpenSection('groups')}
            >
              <UsersRound size={14} className="text-accent" />
              <span>{t('ui.castGroups')}</span>
              <span className="rounded-full border border-line px-1.5 text-[10px] text-muted">
                {t('ui.valueGroups', groups.length)}
              </span>
            </button>
          </div>
          {openSection === 'casts' && (
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-3">
              {casts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line py-8 text-faint">
                  <UserRound size={32} strokeWidth={1.2} className="opacity-40" />
                  <p className="text-[12.5px]">{t('ui.selectAboveAndPressAddCast')}</p>
                </div>
              ) : (
                <SortableList ids={casts.map((cast) => cast.id)} onReorder={reorderCasts}>
                  {casts.map((cast) => (
                    <SortableRow key={cast.id} id={cast.id}>
                      <CastRow
                        cast={cast}
                        editing={cast.id === editingId}
                        characters={characters}
                        onEdit={() => startEdit(cast)}
                        onRemove={() => {
                          if (cast.id === editingId) resetBuilder()
                          removeCast(cast.id)
                        }}
                      />
                    </SortableRow>
                  ))}
                </SortableList>
              )}
            </div>
          )}

          {openSection === 'groups' && (
            <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-3">
              <div className="mb-2 flex items-center gap-2">
                <Input
                  className="h-8 max-w-xs"
                  value={groupName}
                  placeholder={t('ui.groupNameDefaultPlaceholder', groups.length + 1)}
                  onChange={(e) => setGroupName(e.target.value)}
                />
                {editingGroupId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-muted"
                    onClick={resetGroupBuilder}
                  >
                    <X size={13} /> {t('ui.cancelGroupEdit')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="accent"
                  className="gap-1"
                  disabled={groupCastIds.length === 0}
                  onClick={submitGroup}
                >
                  {editingGroupId ? <Check size={13} /> : <Plus size={13} />}
                  {editingGroupId ? t('ui.saveGroupChanges') : t('ui.addGroup')}
                </Button>
              </div>
              <div className="mb-2 flex max-h-[4.5rem] flex-wrap content-start gap-1.5 overflow-y-auto rounded-md border border-line bg-paper p-2">
                {casts.length === 0 ? (
                  <EmptyNote text={t('ui.addCastsFirst')} />
                ) : (
                  casts.map((cast) => {
                    const selected = groupCastIds.includes(cast.id)
                    return (
                      <button
                        key={cast.id}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px]',
                          selected
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-line text-muted hover:bg-surface-2'
                        )}
                        onClick={() =>
                          setGroupCastIds(
                            selected
                              ? groupCastIds.filter((id) => id !== cast.id)
                              : [...groupCastIds, cast.id]
                          )
                        }
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: cast.color }}
                        />
                        {cast.name || t('ui.unnamed')}
                      </button>
                    )
                  })
                )}
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="py-3 text-center text-[11.5px] text-faint">
                    {t('ui.selectCastsToAddGroup')}
                  </p>
                ) : (
                  groups.map((group) => {
                    const members = group.castIds
                      .map((id) => casts.find((c) => c.id === id))
                      .filter((c) => c != null)
                    return (
                      <div
                        key={group.id}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2',
                          editingGroupId === group.id && 'border-accent/60 ring-1 ring-accent/40'
                        )}
                      >
                        <UsersRound size={14} className="shrink-0 text-accent" />
                        <span className="shrink-0 text-[13px] font-semibold">
                          {group.name || t('ui.unnamed')}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                          {members.map((c) => c.name || t('ui.unnamed')).join(', ') ||
                            t('ui.noValidCasts')}
                        </span>
                        <span className="shrink-0 text-[10.5px] text-faint">
                          {t('ui.valuePeople', members.length)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 p-0 text-muted"
                          title={t('ui.editGroup')}
                          onClick={() => {
                            setOpenSection('groups')
                            setEditingGroupId(group.id)
                            setGroupName(group.name)
                            setGroupCastIds(members.map((c) => c.id))
                          }}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 shrink-0 p-0 text-danger"
                          title={t('ui.deleteGroupPreservesReservations')}
                          onClick={() => {
                            if (editingGroupId === group.id) resetGroupBuilder()
                            removeGroup(group.id)
                          }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 출연 목록 한 줄 — 고유색 칩 · 이름 · 구성 요약 · 편집/삭제 */
function CastRow({
  cast,
  editing,
  characters,
  onEdit,
  onRemove
}: {
  cast: SceneCast
  editing: boolean
  characters: CharacterCard[]
  onEdit: () => void
  onRemove: () => void
}): React.JSX.Element {
  const t = useT()
  const charNames = cast.characterIds
    .map((id) => {
      const c = characters.find((x) => x.id === id)
      return c ? c.name || c.prompt.split(',')[0] : null
    })
    .filter(Boolean)
    .join(', ')

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2',
        editing && 'border-accent/60 ring-1 ring-accent/40'
      )}
    >
      <span
        className="size-4 shrink-0 rounded-full shadow-inner"
        style={{ backgroundColor: cast.color }}
        title={t('ui.queueBadgeColor')}
      />
      <span className="min-w-0 shrink-0 truncate text-[13px] font-semibold">
        {cast.name || t('ui.unnamed')}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
        {charNames && <span title={charNames}>👤 {charNames}</span>}
        {cast.charRefIds.length > 0 && (
          <span className="ml-2">{t('ui.refsValue', cast.charRefIds.length)}</span>
        )}
        {cast.vibeIds.length > 0 && (
          <span className="ml-2">{t('ui.vibesValue', cast.vibeIds.length)}</span>
        )}
        {!charNames && cast.charRefIds.length === 0 && cast.vibeIds.length === 0 && (
          <span className="text-faint">{t('ui.noComponents')}</span>
        )}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0 text-muted hover:text-fg"
        title={t('ui.editLoadIntoTheBuilderAbove')}
        onClick={onEdit}
      >
        <Pencil size={13} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0 text-danger hover:text-danger"
        title={t('ui.deleteCastItsQueuesAreAlsoExcludedFromRuns')}
        onClick={onRemove}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  )
}

/** 캐릭터 프롬프트 폴더 그룹 체크리스트 */
function CharacterChecklist({
  characters,
  folders,
  selectedIds,
  onToggle
}: {
  characters: CharacterCard[]
  folders: { id: number; name: string; color: string | null }[]
  selectedIds: number[]
  onToggle: (id: number) => void
}): React.JSX.Element {
  const t = useT()
  const groups: { name: string; color: string | null; items: CharacterCard[] }[] = [
    ...folders
      .map((f) => ({
        name: f.name,
        color: f.color,
        items: characters.filter((c) => c.folderId === f.id)
      }))
      .filter((g) => g.items.length > 0),
    {
      name: t('ui.uncategorized'),
      color: null,
      items: characters.filter(
        (c) => c.folderId == null || !folders.some((f) => f.id === c.folderId)
      )
    }
  ].filter((g) => g.items.length > 0)

  return (
    <>
      {groups.map((g) => (
        <div key={g.name}>
          {groups.length > 1 && (
            <p className="px-1 pb-0.5 pt-1.5 text-[10.5px] font-medium text-faint">
              {g.name} <span className="opacity-70">({g.items.length})</span>
            </p>
          )}
          {g.items.map((c) => {
            const checked = selectedIds.includes(c.id)
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c.id)}
                className={cn(
                  'flex w-full items-start gap-2 rounded px-1.5 py-1 text-left transition-colors',
                  checked ? 'bg-accent/10' : 'hover:bg-surface-2',
                  g.color && 'border-l-2 pl-2'
                )}
                style={g.color ? { borderLeftColor: g.color } : undefined}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded border-2',
                    checked ? 'border-accent bg-accent text-white' : 'border-line'
                  )}
                >
                  {checked && <span className="text-[8px] leading-none">✓</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-ink">
                    {c.name || t('ui.unnamed')}
                  </span>
                  {c.prompt && (
                    <span className="line-clamp-2 break-all font-mono text-[10px] leading-tight text-faint">
                      {c.prompt}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </>
  )
}

/** 캐릭레퍼/바이브 썸네일 2열 그리드 — 선택 시 링, 미선택은 흑백 반투명 */
function ThumbGrid({
  items,
  selectedIds,
  emptyText,
  onToggle
}: {
  items: { id: number; name: string; thumbnail: string }[]
  selectedIds: number[]
  emptyText: string
  onToggle: (id: number) => void
}): React.JSX.Element {
  return (
    <div className="h-52 overflow-y-auto rounded-md border border-line bg-paper p-1.5">
      {items.length === 0 ? (
        <EmptyNote text={emptyText} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item, i) => {
            const checked = selectedIds.includes(item.id)
            return (
              <button
                key={item.id}
                onClick={() => onToggle(item.id)}
                title={item.name}
                className={cn(
                  'relative aspect-square overflow-hidden rounded-md border transition',
                  checked ? 'border-accent ring-2 ring-accent/50' : 'border-line'
                )}
              >
                {item.thumbnail ? (
                  <img
                    src={`data:image/webp;base64,${item.thumbnail}`}
                    className={cn(
                      'h-full w-full object-cover transition',
                      !checked && 'opacity-55 grayscale hover:opacity-90 hover:grayscale-0'
                    )}
                    draggable={false}
                    alt=""
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-surface-2 text-faint">
                    <ImageIcon size={18} strokeWidth={1.4} />
                  </span>
                )}
                <span className="absolute left-1 top-1 rounded bg-black/55 px-1 font-mono text-[9px] text-white">
                  #{i + 1}
                </span>
                <span
                  className={cn(
                    'absolute bottom-1 right-1 grid size-4 place-items-center rounded border-2 bg-black/45',
                    checked ? 'border-accent bg-accent text-white' : 'border-white/70'
                  )}
                >
                  {checked && <span className="text-[9px] leading-none text-white">✓</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SectionTitle({
  icon: Icon,
  label,
  count
}: {
  icon: LucideIcon
  label: string
  count: number
}): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <Icon size={13} className="text-muted" />
      <span className="text-[12px] font-medium text-ink">{label}</span>
      {count > 0 && (
        <span className="rounded-full border border-line px-1.5 font-mono text-[10px] text-muted">
          {count}
        </span>
      )}
    </div>
  )
}

function EmptyNote({ text }: { text: string }): React.JSX.Element {
  return <p className="py-6 text-center text-[11.5px] text-faint">{text}</p>
}

const CHIP_COLORS = {
  sky: 'bg-sky-500/12 text-sky-500',
  emerald: 'bg-emerald-500/12 text-emerald-500',
  violet: 'bg-violet-500/12 text-violet-400'
} as const

function Chip({
  color,
  label,
  onRemove
}: {
  color: keyof typeof CHIP_COLORS
  label: string
  onRemove: () => void
}): React.JSX.Element {
  const t = useT()
  return (
    <button
      className={cn(
        'max-w-[180px] truncate rounded-md px-2 py-1 text-[11px] transition hover:opacity-70',
        CHIP_COLORS[color]
      )}
      title={t('ui.clickToDeselect')}
      onClick={onRemove}
    >
      {label}
    </button>
  )
}
