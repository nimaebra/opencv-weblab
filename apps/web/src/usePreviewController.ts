import { inferDimensions } from '@roveran/pipeline';
import { useState, useRef, useEffect, useEffectEvent, useMemo } from 'react';
import { useLab } from './store';
import { useRuntime, analyzeOutput, clearPixel } from './runtime';
import { useStageInteractions } from './useStageInteractions';
import { origin, zoomAtPoint, type View } from './viewGeometry';
import { usePixelStudy } from './usePixelStudy';
export function usePreviewController() {
  const doc = useLab((s) => s.document),
    follow = useLab((s) => s.followSelection);
  const results = useRuntime((s) => s.nodes),
    status = useRuntime((s) => s.status),
    revision = useRuntime((s) => s.frameRevision),
    analysis = useRuntime((s) => s.analysis),
    pixel = useRuntime((s) => s.pixel);
  const [view, setView] = useState<View>(origin),
    [mode, setMode] = useState<'split' | 'wipe'>('split'),
    [wipe, setWipe] = useState(50),
    [expanded, setExpanded] = useState(false),
    [pixelated, setPixelated] = useState(false),
    [checker, setChecker] = useState(true),
    [inspect, setInspect] = useState(false),
    [explain, setExplain] = useState(false),
    [histogram, setHistogram] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    stageB = useRef<HTMLDivElement>(null);
  const a = doc.nodes.find((n) => n.id === doc.preview.a),
    b = doc.nodes.find((n) => n.id === doc.preview.b),
    ra = a ? results[a.id] : undefined,
    rb = b ? results[b.id] : undefined;
  const same = !!ra && !!rb && ra.width === rb.width && ra.height === rb.height,
    wiping = mode === 'wipe' && same;
  const originalSizes = useMemo(
    () => inferDimensions({ nodes: doc.nodes, edges: doc.edges, sources: doc.sources }),
    [doc.nodes, doc.edges, doc.sources],
  );
  const dimensionKey = `${doc.id}:${ra?.width}:${ra?.height}:${rb?.width}:${rb?.height}`;
  useEffect(() => {
    setView(origin);
    clearPixel();
  }, [dimensionKey]);
  useEffect(() => {
    void analyzeOutput(inspect || histogram || explain ? doc.preview.b : null);
  }, [doc.preview.b, revision, inspect, histogram, explain]);
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded]);
  const wheel = useEffectEvent((event: WheelEvent) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('.image-stage');
    if (!el) return;
    const result = el.dataset.slot === 'A' ? ra : rb;
    if (!result) return;
    event.preventDefault();
    const rect = el.getBoundingClientRect();
    setView((v) =>
      zoomAtPoint(
        result,
        rect,
        v,
        Math.exp(-event.deltaY * 0.003),
        event.clientX - rect.left,
        event.clientY - rect.top,
      ),
    );
  });
  useEffect(() => {
    const el = container.current!;
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  function zoom(factor: number) {
    const rect = stageB.current?.getBoundingClientRect();
    if (rect && rb)
      setView((v) => zoomAtPoint(rb, rect, v, factor, rect.width / 2, rect.height / 2));
  }
  const shownPixel = pixel && pixel.nodeId === b?.id && pixel.revision === revision ? pixel : null;
  const highlights = usePixelStudy(doc, shownPixel, explain, status);
  const stageHandlers = useStageInteractions(view, setView, inspect, shownPixel, zoom, revision);
  return {
    doc,
    follow,
    status,
    revision,
    analysis,
    view,
    setView,
    setMode,
    wipe,
    setWipe,
    expanded,
    setExpanded,
    pixelated,
    setPixelated,
    checker,
    setChecker,
    inspect,
    setInspect,
    explain,
    setExplain,
    ...highlights,
    histogram,
    setHistogram,
    container,
    stageB,
    a,
    b,
    ra,
    rb,
    same,
    wiping,
    originalSizes,
    shownPixel,
    stageHandlers,
    zoom,
  };
}
