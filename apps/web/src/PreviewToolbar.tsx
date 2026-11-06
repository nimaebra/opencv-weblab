import {
  Columns2,
  SplitSquareHorizontal,
  Maximize2,
  Minimize2,
  ArrowDownToLine,
  ArrowLeftRight,
} from 'lucide-react';
import { Button, Select } from '@opencv-weblab/ui';
import { useLab } from './store';
import { exportImage } from './runtime';
import type { usePreviewController } from './usePreviewController';

const previewStatus = {
  loading: 'Loading',
  processing: 'Updating',
  exporting: 'Exporting',
  error: 'Engine error',
  ready: 'Live',
} as const;

export function PreviewToolbar({
  same,
  wiping,
  expanded,
  status,
  canExport,
  onCompareChange,
  onExpand,
}: {
  same: boolean;
  wiping: boolean;
  expanded: boolean;
  status: ReturnType<typeof usePreviewController>['status'];
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
          <span className="live-label" data-status={status}>
            <i aria-hidden="true" />
            {previewStatus[status]}
          </span>
        </div>
        <div className="row preview-actions">
          <div className="segmented" role="group" aria-label="Comparison mode">
            <Button
              static
              aria-label="Side-by-side comparison"
              title="Side-by-side comparison"
              aria-pressed={!wiping}
              icon={<Columns2 size={15} />}
              onClick={() => onCompareChange('split')}
            />
            <Button
              static
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
          <Select
            aria-label="Preview quality"
            className="quality-select"
            value={doc.preview.quality}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'full', label: 'Full' },
            ]}
            onValueChange={(value) =>
              useLab.getState().edit(
                (d) => ({
                  ...d,
                  preview: { ...d.preview, quality: value as 'auto' | 'full' },
                }),
                false,
              )
            }
          />
          <Button
            aria-label={expanded ? 'Collapse image viewer' : 'Expand image viewer'}
            title={expanded ? 'Collapse viewer (Esc)' : 'Expand viewer'}
            icon={
              <span className="icon-swap">
                <Maximize2 size={15} data-hidden={expanded ? '' : undefined} />
                <Minimize2 size={15} data-hidden={expanded ? undefined : ''} />
              </span>
            }
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
