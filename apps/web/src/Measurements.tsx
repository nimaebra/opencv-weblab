import { useRef, useState } from 'react';
import { Download, ScanSearch } from 'lucide-react';
import { Button, Modal } from '@opencv-weblab/ui';
import { measurementsCsv, type Measurements as Data, type Bounds } from '@opencv-weblab/engine';
import type { PipelineDocument } from '@opencv-weblab/pipeline';
import { CanvasView } from './CanvasView';
import { origin, zoomAtPoint, type View } from './viewGeometry';
import { download } from './persistence';
import {
  closeMeasurements,
  measurementFrames,
  requestMeasurements,
  useMeasurements,
} from './measurementRuntime';
const format = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
export function usePreviewMeasurements(
  doc: PipelineDocument,
  data: Data | undefined,
  revision: number,
  ready: boolean,
) {
  const [selection, setSelection] = useState<{ key: string; bounds?: Bounds }>();
  const key = `${doc.id}:${doc.preview.b}:${revision}`;
  return {
    bounds: ready && selection?.key === key ? selection.bounds : undefined,
    panel:
      data && doc.preview.b ? (
        <PreviewMeasurements
          doc={doc}
          nodeId={doc.preview.b}
          data={data}
          revision={revision}
          ready={ready}
          onSelect={(bounds) => setSelection({ key, bounds })}
        />
      ) : null,
  };
}
export function MeasurementTable({
  data,
  full = false,
  onSelect,
}: {
  data: Data;
  full?: boolean;
  onSelect: (bounds: Bounds) => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(data.rows.length / 50));
  const current = Math.min(page, pages - 1);
  return (
    <>
      <div
        className="measurement-table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scrollable object measurements"
      >
        <table className="measurement-table">
          <caption>
            {data.rows.length} {data.kind === 'components' ? 'objects' : 'external contours'} ·{' '}
            {full ? 'full-resolution' : 'approximate preview'} · {data.width} × {data.height} px
          </caption>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">
                {data.kind === 'components' ? 'Pixel area' : 'Contour area'} (px²)
              </th>
              {data.kind === 'contours' && <th scope="col">Perimeter (px)</th>}
              <th scope="col">Centroid x, y (px)</th>
              <th scope="col">Bounds x, y, w, h (px)</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(current * 50, (current + 1) * 50).map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <button
                    className="object-select"
                    aria-label={`Select ${data.kind === 'components' ? 'object' : 'contour'} ${row.id}`}
                    onFocus={() => onSelect(row.bounds)}
                    onClick={() => onSelect(row.bounds)}
                  >
                    {row.id}
                  </button>
                </th>
                <td>{format('pixelArea' in row ? row.pixelArea : row.contourArea)}</td>
                {'perimeter' in row && <td>{format(row.perimeter)}</td>}
                <td>
                  {row.centroid
                    ? `${format(row.centroid.x)}, ${format(row.centroid.y)}`
                    : 'Unavailable'}
                </td>
                <td>
                  {[row.bounds.x, row.bounds.y, row.bounds.width, row.bounds.height].join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.rows.length && (
          <p className="empty-small">
            No foreground objects. Use a threshold or HSV mask with a black background.
          </p>
        )}
      </div>
      {pages > 1 && (
        <div className="measurement-pagination">
          <Button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <span aria-live="polite">
            Page {current + 1} of {pages}
          </span>
          <Button disabled={current === pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
      )}
    </>
  );
}
export function PreviewMeasurements({
  doc,
  nodeId,
  data,
  revision,
  ready,
  onSelect,
}: {
  doc: PipelineDocument;
  nodeId: string;
  data: Data;
  revision: number;
  ready: boolean;
  onSelect: (bounds?: Bounds) => void;
}) {
  return (
    <details
      className="measurements-panel"
      onToggle={(event) => {
        if (!event.currentTarget.open) onSelect(undefined);
      }}
    >
      <summary>
        Measurements{' '}
        <span>
          {ready ? data.rows.length : 'Updating'}{' '}
          {data.kind === 'components' ? 'objects' : 'contours'} · preview
        </span>
      </summary>
      <p>
        Preview measurements use displayed pixels and can miss or merge small objects. IDs are
        assigned again after edits. Focus an ID to highlight its bounds.
      </p>
      {data.kind === 'contours' && (
        <p>
          Contour area describes the outer polygon, including enclosed holes. It differs from
          foreground pixel area; a line or point has no area centroid.
        </p>
      )}
      <Button
        disabled={!ready}
        icon={<ScanSearch size={15} />}
        onClick={() => requestMeasurements(doc, nodeId)}
      >
        Measure full resolution / CSV
      </Button>
      {ready ? (
        <MeasurementTable key={`${nodeId}:${revision}`} data={data} onSelect={onSelect} />
      ) : (
        <p role="status">Updating measurements…</p>
      )}
    </details>
  );
}
function FullResults({ data, nodeId }: { data: Data; nodeId: string }) {
  const [bounds, setBounds] = useState<Bounds>();
  const [view, setView] = useState<View>(origin);
  const stage = useRef<HTMLDivElement>(null);
  function zoom(factor: number) {
    const rect = stage.current?.getBoundingClientRect();
    if (rect) setView((v) => zoomAtPoint(data, rect, v, factor, rect.width / 2, rect.height / 2));
  }
  return (
    <>
      <div className="measurement-actions">
        <Button onClick={() => setView(origin)}>Fit</Button>
        <Button onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>100%</Button>
        <Button onClick={() => zoom(0.8)} aria-label="Zoom out measurement image">
          −
        </Button>
        <Button onClick={() => zoom(1.25)} aria-label="Zoom in measurement image">
          +
        </Button>
        <Button
          variant="primary"
          icon={<Download size={15} />}
          onClick={() =>
            download(`measurements-${nodeId}.csv`, measurementsCsv(data), 'text/csv;charset=utf-8')
          }
        >
          Download full-resolution CSV
        </Button>
      </div>
      <div className="full-measurement-layout">
        <div
          ref={stage}
          className="full-measurement-image"
          tabIndex={0}
          role="group"
          aria-label="Full-resolution measurement image; arrow keys pan, plus and minus zoom, F fits"
          onKeyDown={(event) => {
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [30, 0],
              ArrowRight: [-30, 0],
              ArrowUp: [0, 30],
              ArrowDown: [0, -30],
            };
            const move = moves[event.key];
            if (move) {
              event.preventDefault();
              setView((v) => ({ ...v, x: v.x + move[0], y: v.y + move[1] }));
            } else if (event.key === '+' || event.key === '=') zoom(1.25);
            else if (event.key === '-') zoom(0.8);
            else if (event.key.toLowerCase() === 'f') setView(origin);
          }}
        >
          <CanvasView nodeId={nodeId} frameStore={measurementFrames} bounds={bounds} view={view} />
        </div>
        <div>
          <MeasurementTable data={data} full onSelect={setBounds} />
          <p className="measurement-note">
            Values use original-resolution pixels. Display values are rounded to two decimals; CSV
            retains precision. IDs can differ from preview IDs. Arrow keys pan the focused image.
          </p>
        </div>
      </div>
    </>
  );
}
export function FullMeasurements({ doc }: { doc: PipelineDocument }) {
  const { nodeId, status, result, error } = useMeasurements();
  return (
    <Modal
      open={nodeId !== null}
      onOpenChange={(open) => {
        if (!open) closeMeasurements();
      }}
      title="Full-resolution measurements"
      description="Recomputed from the original images for this step. The image and rows describe the same result."
      className="measurements-dialog"
    >
      {status === 'running' && (
        <p role="status" className="measurement-progress">
          Measuring original pixels… Close to cancel.
        </p>
      )}
      {status === 'error' && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <Button onClick={() => nodeId && requestMeasurements(doc, nodeId)}>Try again</Button>
        </div>
      )}
      {result && nodeId && status === 'ready' && (
        <FullResults key={nodeId} data={result} nodeId={nodeId} />
      )}
    </Modal>
  );
}
