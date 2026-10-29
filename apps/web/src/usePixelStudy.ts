import { useEffect, useEffectEvent } from 'react';
import type { PipelineDocument } from '@opencv-weblab/pipeline';
import { useRuntime } from './runtime';
import { useStudy, clearExplanation, requestExplanation } from './learningRuntime';
type Runtime = ReturnType<typeof useRuntime.getState>;
type Highlight = { x: number; y: number; radius: number };
export function usePixelStudy(
  doc: PipelineDocument,
  pixel: Runtime['pixel'],
  enabled: boolean,
  status: Runtime['status'],
): { inputHighlight?: Highlight; outputHighlight?: Highlight } {
  const current = useEffectEvent(() => {
    if (enabled && pixel && doc.preview.b)
      void requestExplanation(doc, doc.preview.b, pixel.x, pixel.y);
    else clearExplanation();
  });
  useEffect(() => {
    current();
  }, [enabled, pixel, doc.preview.b, status]);
  const explanation = useStudy((s) => s.explanation);
  if (!enabled || !pixel) return {};
  const outputHighlight = { x: pixel.x, y: pixel.y, radius: 0 };
  const inputId = doc.edges.find((e) => e.target === doc.preview.b && e.input === 0)?.source;
  if (
    !explanation ||
    explanation.nodeId !== doc.preview.b ||
    explanation.x !== pixel.x ||
    explanation.y !== pixel.y ||
    doc.preview.a !== inputId
  )
    return { outputHighlight };
  return {
    outputHighlight,
    inputHighlight: { x: explanation.x, y: explanation.y, radius: (explanation.kernel - 1) / 2 },
  };
}
