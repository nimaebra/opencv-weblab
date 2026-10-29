import { useRef, type Dispatch, type SetStateAction, type HTMLAttributes } from 'react';
import type { NodeResult } from '@roveran/engine';
import { samplePixel, clearPixel, useRuntime } from './runtime';
import { origin, screenToPixel, zoomAtPoint, type View } from './viewGeometry';
type Pixel = ReturnType<typeof useRuntime.getState>['pixel'];
const directions: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
export function useStageInteractions(
  view: View,
  setView: Dispatch<SetStateAction<View>>,
  inspect: boolean,
  pixel: Pixel,
  zoom: (factor: number) => void,
  revision: number,
) {
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null),
    pointers = useRef(new Map<number, { x: number; y: number }>());
  const cursor = useRef<{ nodeId: string; revision: number; x: number; y: number } | null>(null);
  return function stageHandlers(
    slot: string,
    result: NodeResult | undefined,
  ): HTMLAttributes<HTMLDivElement> {
    function sample(event: React.PointerEvent<HTMLDivElement>) {
      if (!result || slot !== 'B') return;
      const rect = event.currentTarget.getBoundingClientRect(),
        point = screenToPixel(
          result,
          rect,
          view,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      if (point) {
        cursor.current = { nodeId: result.nodeId, revision, ...point };
        samplePixel(point.x, point.y);
      } else {
        cursor.current = null;
        clearPixel();
      }
    }
    function release(event: React.PointerEvent<HTMLDivElement>) {
      pointers.current.delete(event.pointerId);
      drag.current = null;
    }
    return {
      onKeyDown(event) {
        const delta = directions[event.key];
        if (delta) {
          event.preventDefault();
          if (inspect && slot === 'B' && result) {
            const previous =
              cursor.current?.nodeId === result.nodeId && cursor.current.revision === revision
                ? cursor.current
                : pixel;
            const point = {
              x: Math.max(0, Math.min(result.width - 1, (previous?.x ?? 0) + delta[0])),
              y: Math.max(0, Math.min(result.height - 1, (previous?.y ?? 0) + delta[1])),
            };
            cursor.current = { nodeId: result.nodeId, revision, ...point };
            samplePixel(point.x, point.y);
          } else setView((v) => ({ ...v, x: v.x - delta[0] * 30, y: v.y - delta[1] * 30 }));
          return;
        }
        switch (event.key.toLowerCase()) {
          case '+':
          case '=':
            event.preventDefault();
            zoom(1.2);
            break;
          case '-':
            event.preventDefault();
            zoom(1 / 1.2);
            break;
          case 'f':
            event.preventDefault();
            setView(origin);
            break;
          case '1':
            event.preventDefault();
            setView({ zoom: 1, x: 0, y: 0 });
            break;
        }
      },
      onPointerDown(event) {
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (inspect) {
          sample(event);
          return;
        }
        drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
      },
      onPointerMove(event) {
        if (inspect) {
          sample(event);
          return;
        }
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2 && result) {
          const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
          if (!other) return;
          const before = Math.hypot(previous.x - other.x, previous.y - other.y),
            after = Math.hypot(event.clientX - other.x, event.clientY - other.y),
            rect = event.currentTarget.getBoundingClientRect();
          if (before > 0)
            setView((v) =>
              zoomAtPoint(
                result,
                rect,
                v,
                after / before,
                (event.clientX + other.x) / 2 - rect.left,
                (event.clientY + other.y) / 2 - rect.top,
              ),
            );
          drag.current = null;
        } else if (drag.current) {
          const start = drag.current;
          setView((v) => ({
            ...v,
            x: start.vx + event.clientX - start.x,
            y: start.vy + event.clientY - start.y,
          }));
        }
      },
      onPointerUp: release,
      onPointerCancel: release,
    };
  };
}
