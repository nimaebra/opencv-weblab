import { Minus, Plus, Maximize2, Hand, Scan, BarChart3, Lightbulb } from 'lucide-react';
import { Button } from '@opencv-weblab/ui';
import { useLab } from './store';
import { origin } from './viewGeometry';
import type { usePreviewController } from './usePreviewController';
type Controller = ReturnType<typeof usePreviewController>;
export function ViewerOptions({ controller }: { controller: Controller }) {
  const {
    follow,
    checker,
    setChecker,
    pixelated,
    setPixelated,
    inspect,
    setInspect,
    explain,
    setExplain,
    histogram,
    setHistogram,
  } = controller;
  return (
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
        onClick={() => {
          setInspect(false);
          setExplain(false);
        }}
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
      <Button
        aria-pressed={explain}
        icon={<Lightbulb size={14} />}
        onClick={() => {
          setExplain(!explain);
          setInspect(true);
        }}
      >
        Explain a pixel
      </Button>
    </div>
  );
}
export function PreviewFooter({ controller }: { controller: Controller }) {
  const { doc, same, ra, rb, zoom, view, setView } = controller;
  return (
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
  );
}
