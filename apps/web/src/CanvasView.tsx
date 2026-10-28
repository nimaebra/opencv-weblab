import { useEffect, useRef, memo } from 'react';
import { frames } from './runtime';
export type View = { zoom: number; x: number; y: number };
const origin: View = { zoom: 1, x: 0, y: 0 };
export const CanvasView = memo(function CanvasView({
  nodeId,
  view = origin,
  thumbnail = false,
}: {
  nodeId: string | null;
  view?: View;
  thumbnail?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const bitmap = frames.get(nodeId);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!bitmap) return;
      const fit =
        Math.min(rect.width / bitmap.width, rect.height / bitmap.height) * (thumbnail ? 1 : 0.92);
      const width = bitmap.width * fit * view.zoom,
        height = bitmap.height * fit * view.zoom;
      ctx.imageSmoothingEnabled = view.zoom < 3;
      ctx.drawImage(
        bitmap,
        (rect.width - width) / 2 + view.x,
        (rect.height - height) / 2 + view.y,
        width,
        height,
      );
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const unsubscribe = frames.subscribe(draw);
    draw();
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [nodeId, view, thumbnail]);
  return (
    <canvas
      ref={ref}
      className={thumbnail ? 'node-canvas' : 'image-canvas'}
      aria-label={thumbnail ? 'Operation thumbnail' : 'Image preview'}
    />
  );
});
