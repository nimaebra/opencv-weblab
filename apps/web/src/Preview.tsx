import { useState, useRef } from 'react';
import {
  Columns2,
  SplitSquareHorizontal,
  Minus,
  Plus,
  Maximize2,
  ArrowDownToLine,
} from 'lucide-react';
import { Button } from '@roveran/ui';
import { useLab } from './store';
import { useRuntime, exportImage } from './runtime';
import { CanvasView, type View } from './CanvasView';
export function Preview() {
  const doc = useLab((s) => s.document);
  const results = useRuntime((s) => s.nodes);
  const status = useRuntime((s) => s.status);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [mode, setMode] = useState<'split' | 'wipe'>('split');
  const [wipe, setWipe] = useState(50);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const a = doc.nodes.find((n) => n.id === doc.preview.a),
    b = doc.nodes.find((n) => n.id === doc.preview.b);
  const ra = a ? results[a.id] : undefined,
    rb = b ? results[b.id] : undefined;
  const same = !!ra && !!rb && ra.width === rb.width && ra.height === rb.height;
  const wiping = mode === 'wipe' && same;
  return (
    <section className="preview-section" aria-label="Image comparison">
      <div className="preview-heading">
        <div>
          <h2>Image preview</h2>
          <span className="live-label">
            <i />
            Live
          </span>
        </div>
        <div className="row">
          <div className="segmented">
            <Button
              aria-label="Side-by-side comparison"
              aria-pressed={!wiping}
              icon={<Columns2 size={15} />}
              onClick={() => setMode('split')}
            />
            <Button
              aria-label="Wipe comparison"
              aria-pressed={wiping}
              disabled={!same}
              title={same ? 'Wipe comparison' : 'Wipe requires matching dimensions'}
              icon={<SplitSquareHorizontal size={15} />}
              onClick={() => setMode('wipe')}
            />
          </div>
          <select
            aria-label="Preview quality"
            className="quality-select"
            value={doc.preview.quality}
            onChange={(e) =>
              useLab.getState().edit(
                (doc) => ({
                  ...doc,
                  preview: { ...doc.preview, quality: e.target.value as 'auto' | 'full' },
                }),
                false,
              )
            }
          >
            <option value="auto">Auto · ≤1024 px</option>
            <option value="full">Full resolution</option>
          </select>
          <Button
            aria-label="Export full-resolution PNG"
            title="Export full-resolution PNG"
            disabled={status !== 'ready' || !rb}
            icon={<ArrowDownToLine size={16} />}
            onClick={() => exportImage(doc)}
          />
        </div>
      </div>
      <div
        className={`preview-images ${wiping ? 'wipe' : ''}`}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button,input,select')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setView((v) => ({
              ...v,
              x: drag.current!.vx + e.clientX - drag.current!.x,
              y: drag.current!.vy + e.clientY - drag.current!.y,
            }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setView((v) => ({
              ...v,
              zoom: Math.max(0.2, Math.min(8, v.zoom * (e.deltaY > 0 ? 0.9 : 1.1))),
            }));
          }
        }}
      >
        {[
          { node: a, slot: 'A', result: ra },
          { node: b, slot: 'B', result: rb },
        ].map(({ node, slot, result }, index) => (
          <div
            key={slot}
            className={`preview-frame frame-${slot.toLowerCase()}`}
            style={wiping && index === 1 ? { clipPath: `inset(0 0 0 ${wipe}%)` } : undefined}
          >
            <div className="frame-heading">
              <span className="slot">{slot}</span>
              <strong>{node?.label ?? 'Choose a node'}</strong>
              <span className="frame-mode">{result?.mode.toUpperCase() ?? 'NO OUTPUT'}</span>
            </div>
            <div className="image-stage">
              <CanvasView nodeId={node?.id ?? null} view={view} />
              {!result && (
                <div className="preview-placeholder">
                  {node
                    ? 'Connect a valid image to see this step'
                    : 'Select a node, or pin an output here.'}
                </div>
              )}
            </div>
            <div className="frame-caption">
              <span>{result ? `${result.width} × ${result.height} px` : 'Awaiting input'}</span>
              <span>
                {index === 0 ? 'Input / reference' : `${result?.elapsed.toFixed(1) ?? '—'} ms`}
              </span>
            </div>
          </div>
        ))}
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
        </span>
        <div className="zoom-controls">
          <Button
            aria-label="Zoom out images"
            icon={<Minus size={13} />}
            onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.2) }))}
          />
          <span>{Math.round(view.zoom * 100)}%</span>
          <Button
            aria-label="Zoom in images"
            icon={<Plus size={13} />}
            onClick={() => setView((v) => ({ ...v, zoom: Math.min(8, v.zoom * 1.2) }))}
          />
          <Button
            aria-label="Fit images"
            icon={<Maximize2 size={13} />}
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          />
        </div>
      </div>
    </section>
  );
}
