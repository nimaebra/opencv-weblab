import { useEffect, useRef, memo } from 'react';
import { frames } from './runtime';
import type { FrameStore } from '@opencv-weblab/engine';
import { imageTransform, origin, type View } from './viewGeometry';
import type { Bounds } from '@opencv-weblab/engine';
export type { View } from './viewGeometry';
export const CanvasView = memo(function CanvasView({
  nodeId,
  view = origin,
  thumbnail = false,
  pixelated = false,
  checkerboard = false,
  frameStore = frames,
  highlight,
  bounds,
}: {
  nodeId: string | null;
  view?: View;
  thumbnail?: boolean;
  pixelated?: boolean;
  checkerboard?: boolean;
  frameStore?: FrameStore;
  highlight?: { x: number; y: number; radius: number };
  bounds?: Bounds;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const draw = () => {
      const bitmap = frameStore.get(nodeId),
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
      if (bounds) {
        const x = t.left + bounds.x * t.scale,
          y = t.top + bounds.y * t.scale;
        ctx.strokeStyle = '#141e18';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, bounds.width * t.scale, bounds.height * t.scale);
        ctx.strokeStyle = '#f3d584';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, bounds.width * t.scale, bounds.height * t.scale);
      }
      if (highlight) {
        const left = Math.max(0, highlight.x - highlight.radius),
          top = Math.max(0, highlight.y - highlight.radius);
        const right = Math.min(bitmap.width, highlight.x + highlight.radius + 1),
          bottom = Math.min(bitmap.height, highlight.y + highlight.radius + 1);
        ctx.strokeStyle = '#f3d584';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          t.left + left * t.scale,
          t.top + top * t.scale,
          (right - left) * t.scale,
          (bottom - top) * t.scale,
        );
        ctx.strokeStyle = '#141e18';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          t.left + left * t.scale - 2,
          t.top + top * t.scale - 2,
          (right - left) * t.scale + 4,
          (bottom - top) * t.scale + 4,
        );
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const unsubscribe = frameStore.subscribe(draw);
    draw();
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [nodeId, view, thumbnail, pixelated, checkerboard, frameStore, highlight, bounds]);
  return (
    <canvas
      ref={ref}
      className={thumbnail ? 'node-canvas' : 'image-canvas'}
      aria-label={thumbnail ? 'Operation thumbnail' : 'Image preview'}
    />
  );
});
