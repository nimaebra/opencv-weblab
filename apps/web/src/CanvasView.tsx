import { useEffect, useRef, memo } from 'react';
import { frames } from './runtime';
import { imageTransform, origin, type View } from './viewGeometry';
export type { View } from './viewGeometry';
export const CanvasView = memo(function CanvasView({
  nodeId,
  view = origin,
  thumbnail = false,
  pixelated = false,
  checkerboard = false,
}: {
  nodeId: string | null;
  view?: View;
  thumbnail?: boolean;
  pixelated?: boolean;
  checkerboard?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const bitmap = frames.get(nodeId),
        rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = devicePixelRatio || 1,
        width = Math.round(rect.width * dpr),
        height = Math.round(rect.height * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      if (!bitmap) return;
      const t = imageTransform(bitmap, rect, thumbnail ? origin : view);
      if (checkerboard && !thumbnail) {
        const tile = new OffscreenCanvas(16, 16),
          pattern = tile.getContext('2d')!;
        pattern.fillStyle = '#343c36';
        pattern.fillRect(0, 0, 16, 16);
        pattern.fillStyle = '#29312b';
        pattern.fillRect(0, 0, 8, 8);
        pattern.fillRect(8, 8, 8, 8);
        ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
        ctx.fillRect(t.left, t.top, bitmap.width * t.scale, bitmap.height * t.scale);
      }
      ctx.imageSmoothingEnabled = !pixelated;
      ctx.drawImage(bitmap, t.left, t.top, bitmap.width * t.scale, bitmap.height * t.scale);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const unsubscribe = frames.subscribe(draw);
    draw();
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [nodeId, view, thumbnail, pixelated, checkerboard]);
  return (
    <canvas
      ref={ref}
      className={thumbnail ? 'node-canvas' : 'image-canvas'}
      aria-label={thumbnail ? 'Operation thumbnail' : 'Image preview'}
    />
  );
});
