import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext } from '@dnd-kit/sortable'
import { ImageOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Scene } from '@shared/types'
import { imageUrl, thumbnailFallback } from '../lib/constants'
import { CARD_ASPECT } from './scene-card-frame'

type GridScene = Pick<Scene, 'id' | 'name' | 'thumbnailPath'> & {
  thumbnailUrl?: string
  thumbnail?: string
}

export function SortableSceneGrid({
  scenes,
  columns,
  orientation,
  onReorder,
  children
}: {
  scenes: GridScene[]
  columns: number
  orientation: keyof typeof CARD_ASPECT
  onReorder: (ids: number[]) => void
  children: ReactNode
}): React.JSX.Element {
  // 5px 이동해야 드래그를 시작해 일반 클릭과 구분한다.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [dragId, setDragId] = useState<number | null>(null)
  const dragScene = scenes.find((scene) => scene.id === dragId)
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setDragId(null)
    if (!over || active.id === over.id) return
    const ids = scenes.map((scene) => `scene-${scene.id}`)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(scenes, from, to).map((scene) => scene.id))
  }
  const dragSrc =
    dragScene?.thumbnailUrl ||
    (dragScene?.thumbnail
      ? `data:image/webp;base64,${dragScene.thumbnail}`
      : dragScene?.thumbnailPath
        ? imageUrl(dragScene.thumbnailPath)
        : null)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) =>
        setDragId(scenes.find((scene) => `scene-${scene.id}` === active.id)?.id ?? null)
      }
      onDragCancel={() => setDragId(null)}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={scenes.map((scene) => `scene-${scene.id}`)}
        strategy={rectSortingStrategy}
      >
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {children}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {dragScene && (
          <div
            className="relative overflow-hidden rounded-lg border border-accent bg-surface-2 shadow-2xl"
            style={{ aspectRatio: CARD_ASPECT[orientation] }}
          >
            {dragSrc ? (
              <img
                src={dragSrc}
                className="h-full w-full object-cover"
                draggable={false}
                {...thumbnailFallback(dragScene.thumbnailPath)}
                alt=""
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-paper text-faint">
                <ImageOff size={26} strokeWidth={1.3} />
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6">
              <div className="truncate text-[13px] font-semibold text-white">{dragScene.name}</div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
