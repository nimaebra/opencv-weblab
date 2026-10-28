import { PreviewToolbar } from './PreviewToolbar';
import { Minus, Plus, Maximize2, Hand, Scan, BarChart3 } from 'lucide-react';
import { Button } from '@roveran/ui';
import { useLab } from './store';
import { PreviewFrame } from './PreviewFrame';
import { OutputAnalysis } from './OutputAnalysis';
import { origin } from './viewGeometry';
import { usePreviewController } from './usePreviewController';
export function Preview() {
  const {
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
  } = usePreviewController();

  return (
    <section
      className={`preview-section ${expanded ? 'preview-expanded' : ''}`}
      aria-label="Image comparison"
    >
      <PreviewToolbar
        same={same}
        wiping={wiping}
        expanded={expanded}
        canExport={status === 'ready' && !!rb}
        onCompareChange={setMode}
        onExpand={() => setExpanded(!expanded)}
      />
      <div className="viewer-options">
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => useLab.getState().setFollowSelection(e.target.checked)}
          />{' '}
          B follows selection
        </label>
        <label>
          <input type="checkbox" checked={checker} onChange={(e) => setChecker(e.target.checked)} />{' '}
          Transparency
        </label>
        <label>
          <input
            type="checkbox"
            checked={pixelated}
            onChange={(e) => setPixelated(e.target.checked)}
          />{' '}
          Crisp pixels
        </label>
        <Button
          aria-label="Pan images"
          aria-pressed={!inspect}
          icon={<Hand size={14} />}
          onClick={() => setInspect(false)}
        >
          Pan
        </Button>
        <Button
          aria-label="Inspect output pixels"
          aria-pressed={inspect}
          icon={<Scan size={14} />}
          onClick={() => setInspect(true)}
        >
          Inspect B
        </Button>
        <Button
          aria-label="Toggle output histogram"
          aria-pressed={histogram}
          icon={<BarChart3 size={14} />}
          onClick={() => setHistogram(!histogram)}
        >
          Histogram
        </Button>
      </div>
      <div
        ref={container}
        className={`preview-images ${wiping ? 'wipe' : ''} ${checker ? 'checkerboard' : ''} ${inspect ? 'inspecting' : ''}`}
      >
        <PreviewFrame
          node={a}
          slot="A"
          result={ra}
          view={view}
          pixelated={pixelated}
          checker={checker}
          inspect={inspect}
          events={stageHandlers('A', ra)}
          original={a ? originalSizes.get(a.id) : undefined}
        />
        <PreviewFrame
          node={b}
          slot="B"
          result={rb}
          view={view}
          pixelated={pixelated}
          checker={checker}
          inspect={inspect}
          events={stageHandlers('B', rb)}
          original={b ? originalSizes.get(b.id) : undefined}
          stageRef={stageB}
          clip={wiping ? wipe : undefined}
        />
        {wiping && (
          <>
            <div className="wipe-line" style={{ left: `${wipe}%` }} />
            <input
              className="wipe-slider"
              type="range"
              aria-label="Comparison wipe position"
              min={0}
              max={100}
              value={wipe}
              onChange={(e) => setWipe(Number(e.target.value))}
            />
          </>
        )}
      </div>
      <div className="preview-bottom">
        <span>
          {doc.preview.quality === 'auto'
            ? 'Approximate preview · export uses original resolution'
            : 'Full-resolution preview · exact parameters'}
          {!same && ra && rb ? ' · Wipe needs matching dimensions' : ''}
        </span>
        <div className="zoom-controls">
          <Button
            aria-label="Zoom out images"
            icon={<Minus size={13} />}
            onClick={() => zoom(1 / 1.2)}
          />
          <span>{view.zoom === 'fit' ? 'Fit' : `${Math.round(view.zoom * 100)}%`}</span>
          <Button aria-label="Zoom in images" icon={<Plus size={13} />} onClick={() => zoom(1.2)} />
          <Button aria-label="Actual size images" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
            100%
          </Button>
          <Button
            aria-label="Fit images"
            icon={<Maximize2 size={13} />}
            onClick={() => setView(origin)}
          />
        </div>
      </div>
      <OutputAnalysis
        inspect={inspect}
        histogram={histogram}
        shownPixel={shownPixel}
        analysis={analysis}
        nodeId={b?.id}
        revision={revision}
        mode={rb?.mode}
      />
    </section>
  );
}
