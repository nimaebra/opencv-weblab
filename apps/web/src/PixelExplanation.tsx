import { useState } from 'react';
import { Lightbulb } from 'lucide-react';
import {
  explanationKernel,
  previewScale,
  type PixelExplanation as Explanation,
} from '@roveran/engine';
import { Button } from '@roveran/ui';
import { registry, type PipelineDocument } from '@roveran/pipeline';
import { useLab } from './store';
import { useStudy } from './learningRuntime';
const number = (value: number) =>
  Math.abs(value) < 0.000001 ? '0' : Number(value.toFixed(4)).toString();
export function PixelExplanation({
  doc,
  point,
}: {
  doc: PipelineDocument;
  point: { x: number; y: number } | null;
}) {
  const explanation = useStudy((s) => s.explanation),
    error = useStudy((s) => s.explanationError);
  const node = doc.nodes.find((n) => n.id === doc.preview.b);
  let unavailable = '';
  try {
    if (!node) throw new Error('Choose an operation for output B.');
    explanationKernel(node, previewScale(doc));
  } catch (error) {
    unavailable = (error as Error).message;
  }
  const current =
    explanation &&
    explanation.nodeId === node?.id &&
    explanation.x === point?.x &&
    explanation.y === point?.y
      ? explanation
      : null;
  return (
    <section className="pixel-explanation" aria-label="Explain this pixel">
      <h3>
        <Lightbulb size={16} /> Why did this pixel change?
      </h3>
      {unavailable || error ? (
        <p role="status">{unavailable || error}</p>
      ) : current ? (
        <Calculation
          key={`${current.nodeId}:${current.x}:${current.y}:${current.kernel}`}
          data={current}
          doc={doc}
        />
      ) : (
        <p role="status">
          {point
            ? 'Reading the input neighborhood…'
            : 'Point at output B, or focus B and use the arrow keys. Grayscale inputs reveal one intensity calculation at a time.'}
        </p>
      )}
    </section>
  );
}
function Calculation({ data, doc }: { data: Explanation; doc: PipelineDocument }) {
  const [selected, setSelected] = useState(() => Math.floor(data.cells.length / 2));
  const cell = data.cells[selected]!,
    node = doc.nodes.find((n) => n.id === data.nodeId)!;
  const input = doc.edges.find((e) => e.target === node.id && e.input === 0)?.source;
  const clamp = Math.max(0, Math.min(255, data.sum));
  return (
    <>
      <div className="calculation-layout">
        <div>
          <p className="study-note">
            Input neighborhood · each cell shows intensity × weight. Focus a cell to inspect its
            contribution.
          </p>
          <div
            className="kernel-grid"
            role="group"
            aria-label="Input neighborhood and kernel weights"
            style={{ gridTemplateColumns: `repeat(${data.kernel}, minmax(0, 1fr))` }}
          >
            {data.cells.map((c, index) => (
              <button
                key={`${c.dx}:${c.dy}`}
                className={`${index === selected ? 'active' : ''} ${c.reflected ? 'reflected' : ''}`}
                aria-pressed={selected === index}
                aria-label={`Input ${c.x}, ${c.y}: ${c.value} times ${number(c.weight)}${c.reflected ? ', reflected at border' : ''}`}
                onFocus={() => setSelected(index)}
                onClick={() => setSelected(index)}
              >
                <strong>{c.value}</strong>
                <span>× {number(c.weight)}</span>
                {c.reflected && <small>mirror</small>}
              </button>
            ))}
          </div>
          <p className="cell-contribution" aria-live="polite">
            Input ({cell.x}, {cell.y}):{' '}
            <code>
              {cell.value} × {number(cell.weight)} = {number(cell.value * cell.weight)}
            </code>
          </p>
        </div>
        <div className="calculation-result">
          <p>
            <strong>{registry[node.operation]!.label}</strong> · output ({data.x}, {data.y})
          </p>
          <dl>
            <div>
              <dt>Sum of all contributions</dt>
              <dd>{number(data.sum)}</dd>
            </div>
            <div>
              <dt>After clipping to 0–255</dt>
              <dd>{number(clamp)}</dd>
            </div>
            <div>
              <dt>OpenCV 8-bit output</dt>
              <dd>{data.output}</dd>
            </div>
          </dl>
          <p>
            {data.sum < 0 || data.sum > 255
              ? 'This calculation clips: values outside 0–255 cannot be represented in an 8-bit image.'
              : 'The weighted sum is rounded to an integer intensity. Gaussian weights model the pinned runtime’s optimized 8-bit coefficients (multiples of 1/256 per axis).'}
          </p>
          {input && (
            <Button
              onClick={() =>
                useLab
                  .getState()
                  .edit((d) => ({ ...d, preview: { ...d.preview, a: input } }), false)
              }
            >
              Show this input in A
            </Button>
          )}
        </div>
      </div>
      <p className="study-note">
        {data.kernel} × {data.kernel} kernel used at this preview resolution
        {data.sigma !== undefined
          ? ` · sigma ${number(data.sigma)}${data.sigma === 0 ? ' (OpenCV chooses weights from kernel size)' : ''}`
          : ''}
        .{' '}
        {data.scale < 1
          ? `Spatial parameters scaled by ${number(data.scale)}; these are approximate preview pixels, not original-resolution pixels.`
          : 'These are original-resolution pixels.'}{' '}
        Border: reflect without repeating the edge pixel (BORDER_REFLECT_101). “Mirror” marks reused
        input pixels. Weights are rounded for display; calculations use full precision.
      </p>
    </>
  );
}
