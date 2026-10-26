import { useSortable } from '@dnd-kit/sortable'
import { MoreVertical } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { cn } from '../lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from './ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export const CARD_ASPECT = {
  portrait: '832 / 1216',
  landscape: '1216 / 832',
  square: '1 / 1'
} as const

export interface SceneCardAction {
  id: string
  icon: ReactNode
  label: string
  danger?: boolean
  onSelect: () => void
}

/** 두 씬 모드의 드래그, 선택 표시, 우클릭/3점 메뉴를 함께 관리한다. */
/* eslint-disable react-hooks/refs */
export function SceneCardFrame({
  id,
  name,
  orientation,
  editMode,
  selected,
  actions,
  onClick,
  children
}: {
  id: number
  name: string
  orientation: keyof typeof CARD_ASPECT
  editMode: boolean
  selected: boolean
  actions: SceneCardAction[]
  onClick: (event: MouseEvent<HTMLDivElement>) => void
  children: ReactNode
}): React.JSX.Element {
  const sortable = useSortable({ id: `scene-${id}` })
  const transform = sortable.transform
  const t = useT()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={sortable.setNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          className={cn(
            'group relative touch-none overflow-hidden rounded-lg border bg-surface-2 transition',
            editMode && selected ? 'border-accent ring-2 ring-accent/40' : 'border-line',
            sortable.isDragging && 'shadow-xl'
          )}
          style={{
            aspectRatio: CARD_ASPECT[orientation],
            transform: transform
              ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
              : undefined,
            transition: sortable.transition,
            opacity: sortable.isDragging ? 0 : undefined
          }}
          onClick={onClick}
        >
          {children}
          {editMode ? (
            <span
              className={cn(
                'absolute right-1.5 top-1.5 grid size-5 place-items-center rounded border-2 transition',
                selected ? 'border-accent bg-accent text-on-accent' : 'border-white/80 bg-black/30'
              )}
            >
              {selected && <span className="text-[11px] leading-none">✓</span>}
            </span>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/70 group-hover:opacity-100"
                  aria-label={t('ui.namedMenu', name)}
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <MoreVertical size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-40 p-1"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {actions.map((action) => (
                  <button
                    key={action.id}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2',
                      action.danger && 'text-danger'
                    )}
                    onClick={action.onSelect}
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {actions.map((action) => (
          <div key={action.id}>
            {action.danger && <ContextMenuSeparator />}
            <ContextMenuItem danger={action.danger} onSelect={action.onSelect}>
              {action.icon}
              {action.label}
            </ContextMenuItem>
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}
/* eslint-enable react-hooks/refs */
