import {
  Columns2,
  SplitSquareHorizontal,
  Maximize2,
  Minimize2,
  ArrowDownToLine,
  ArrowLeftRight,
} from 'lucide-react';
import { Button } from '@roveran/ui';
import { useLab } from './store';
import { exportImage } from './runtime';
export function PreviewToolbar({
  same,
  wiping,
  expanded,
  canExport,
  onCompareChange,
  onExpand,
}: {
  same: boolean;
  wiping: boolean;
  expanded: boolean;
  canExport: boolean;
  onCompareChange: (mode: 'split' | 'wipe') => void;
  onExpand: () => void;
}) {
  const doc = useLab((s) => s.document);
  return (
    <>
      <div className="preview-heading">
        <div>
          <h2>Image preview</h2>
          <span className="live-label">
            <i />
            Live
          </span>
        </div>
        <div className="row preview-actions">
          <div className="segmented">
            <Button
              aria-label="Side-by-side comparison"
              aria-pressed={!wiping}
              icon={<Columns2 size={15} />}
              onClick={() => onCompareChange('split')}
            />
            <Button
              aria-label="Wipe comparison"
              aria-pressed={wiping}
              disabled={!same}
              title={same ? 'Wipe comparison' : 'Wipe requires matching preview dimensions'}
              icon={<SplitSquareHorizontal size={15} />}
              onClick={() => onCompareChange('wipe')}
            />
          </div>
          <Button
            aria-label="Swap A and B"
            title="Swap A and B"
            icon={<ArrowLeftRight size={15} />}
            onClick={() => {
              useLab.getState().setFollowSelection(false);
              useLab
                .getState()
                .edit(
                  (d) => ({ ...d, preview: { ...d.preview, a: d.preview.b, b: d.preview.a } }),
                  false,
                );
            }}
          />
          <select
            aria-label="Preview quality"
            className="quality-select"
            value={doc.preview.quality}
            onChange={(e) =>
              useLab.getState().edit(
                (d) => ({
                  ...d,
                  preview: { ...d.preview, quality: e.target.value as 'auto' | 'full' },
                }),
                false,
              )
            }
          >
            <option value="auto">Auto · ≤1024 px</option>
            <option value="full">Full resolution</option>
          </select>
          <Button
            aria-label={expanded ? 'Collapse image viewer' : 'Expand image viewer'}
            title={expanded ? 'Collapse viewer (Esc)' : 'Expand viewer'}
            icon={expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            onClick={() => onExpand()}
          />
          <Button
            aria-label="Export full-resolution PNG"
            title="Export full-resolution PNG"
            disabled={!canExport}
            icon={<ArrowDownToLine size={16} />}
            onClick={() => exportImage(doc)}
          />
        </div>
      </div>
    </>
  );
}
