import { useEffect, useState, useRef } from 'react';
import { X, Columns3 } from 'lucide-react';
import {
  comparisonValues,
  parameterSchema,
  registry,
  type PipelineNode,
} from '@opencv-weblab/pipeline';
import { Button } from '@opencv-weblab/ui';
import { useLab } from './store';
import { useRuntime } from './runtime';
import {
  comparisonFrames,
  useStudy,
  cancelComparison,
  closeComparison,
  requestComparison,
} from './learningRuntime';
import { CanvasView } from './CanvasView';
export function ComparisonButton({ node, onOpen }: { node: PipelineNode; onOpen: () => void }) {
  const def = registry[node.operation]!;
  if (def.inputs !== 1 || def.changesDimensions || !def.parameters.some((p) => !p.options))
    return null;
  return (
    <Button
      icon={<Columns3 size={14} />}
      disabled={!node.enabled}
      onClick={() => {
        cancelComparison();
        useStudy.setState((s) => ({
          comparisonTarget: node.id,
          comparisonReveal: s.comparisonReveal + 1,
        }));
        onOpen();
      }}
    >
      Compare three values
    </Button>
  );
}
export function ParameterComparison() {
  const target = useStudy((s) => s.comparisonTarget),
    doc = useLab((s) => s.document);
  useEffect(() => {
    closeComparison();
  }, [doc.id]);
  const node = doc.nodes.find((n) => n.id === target);
  return node ? <ComparisonPanel key={`${doc.id}:${node.id}`} node={node} /> : null;
}
function ComparisonPanel({ node }: { node: PipelineNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const reveal = useStudy((s) => s.comparisonReveal);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      heading.current?.scrollIntoView({ block: 'start' });
      heading.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [reveal]);
  const parameters = registry[node.operation]!.parameters.filter((p) => !p.options);
  const [key, setKey] = useState(parameters[0]!.key);
  useEffect(() => () => cancelComparison(), []);
  return (
    <section className="parameter-comparison" aria-label="Parameter comparison">
      <div className="study-heading">
        <h3 ref={heading} tabIndex={-1}>
          <Columns3 size={16} /> Compare {node.label}
        </h3>
        <Button
          aria-label="Close parameter comparison"
          icon={<X size={15} />}
          onClick={closeComparison}
        />
      </div>
      <p>
        One input, one changing parameter. These are this operation’s outputs; the graph stays
        unchanged until you apply a value.
      </p>
      <label className="comparison-parameter">
        Parameter{' '}
        <select
          aria-label="Comparison parameter"
          value={key}
          onChange={(e) => {
            cancelComparison();
            setKey(e.target.value);
          }}
        >
          {parameters.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <ComparisonForm key={key} node={node} parameterKey={key} />
    </section>
  );
}
function ComparisonForm({ node, parameterKey }: { node: PipelineNode; parameterKey: string }) {
  const [values, setValues] = useState(() => comparisonValues(node, parameterKey).map(String));
  const comparison = useStudy((s) => s.comparison),
    status = useStudy((s) => s.comparisonStatus),
    error = useStudy((s) => s.comparisonError);
  const runtimeStatus = useRuntime((s) => s.status);
  const parameter = registry[node.operation]!.parameters.find((p) => p.key === parameterKey)!;
  const valid =
    values.length === 3 &&
    new Set(values.map(Number)).size === 3 &&
    values.every(
      (v) =>
        v.trim() !== '' &&
        parameterSchema(node.operation).safeParse({ ...node.parameters, [parameterKey]: Number(v) })
          .success,
    );
  return (
    <>
      <div className="comparison-controls">
        {(['first', 'second', 'third'] as const).map((slot, index) => (
          <label key={slot}>
            Value {index + 1}
            <input
              aria-label={`Comparison value ${index + 1}`}
              type="number"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step ?? 1}
              value={values[index] ?? ''}
              onChange={(e) => {
                cancelComparison();
                setValues(values.map((v, i) => (i === index ? e.target.value : v)));
              }}
            />
          </label>
        ))}
        <Button
          variant="primary"
          disabled={!valid || !node.enabled || runtimeStatus !== 'ready' || status === 'running'}
          onClick={() =>
            void requestComparison(
              useLab.getState().document,
              node.id,
              parameterKey,
              values.map(Number),
            )
          }
        >
          Generate comparisons
        </Button>
        {status === 'running' && <Button onClick={cancelComparison}>Cancel comparison</Button>}
      </div>
      {!valid && (
        <p className="comparison-feedback">
          Enter three distinct values within this parameter’s valid range and input requirements.
        </p>
      )}
      <div role="status" className="comparison-feedback">
        {status === 'running'
          ? 'Comparing sequentially… Editing the graph cancels this comparison.'
          : error || (status === 'idle' ? 'Choose values, then generate three previews.' : '')}
      </div>
      {comparison && comparison.nodeId === node.id && comparison.parameter === parameterKey && (
        <>
          <div className="comparison-results">
            {comparison.variants.map((variant, index) => (
              <figure key={variant.value}>
                <figcaption>
                  {parameter.label} <strong>{variant.value}</strong>
                </figcaption>
                <div className="variant-image">
                  <CanvasView nodeId={`variant-${index}`} frameStore={comparisonFrames} />
                </div>
                <span>
                  {variant.width} × {variant.height} preview px
                </span>
                <Button
                  onClick={() => {
                    const current = useLab.getState().document.nodes.find((n) => n.id === node.id);
                    if (!current) return;
                    useLab.getState().edit((doc) => ({
                      ...doc,
                      nodes: doc.nodes.map((n) =>
                        n.id === current.id
                          ? {
                              ...n,
                              parameters: { ...n.parameters, [parameterKey]: variant.value },
                            }
                          : n,
                      ),
                    }));
                    useLab
                      .getState()
                      .notify(
                        `Applied ${parameter.label.toLowerCase()} ${variant.value}. Undo restores the previous setting.`,
                      );
                    cancelComparison();
                  }}
                >
                  Apply {variant.value}
                </Button>
              </figure>
            ))}
          </div>
          <p className="study-note">
            Approximate previews, input capped at 1,024 px. Spatial parameters scale with the
            preview. Full-resolution export uses your original parameters. No result is
            automatically ranked best.
          </p>
        </>
      )}
    </>
  );
}
