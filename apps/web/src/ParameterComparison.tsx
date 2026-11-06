import { useEffect, useState, useRef } from 'react';
import { X, Columns3 } from 'lucide-react';
import {
  comparisonValues,
  parameterSchema,
  registry,
  type PipelineNode,
} from '@opencv-weblab/pipeline';
import { Button, Select, TextInput } from '@opencv-weblab/ui';
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
        <Select
          aria-label="Comparison parameter"
          value={key}
          options={parameters.map((parameter) => ({
            value: parameter.key,
            label: parameter.label,
          }))}
          onValueChange={(value) => {
            cancelComparison();
            setKey(value);
          }}
        />
      </label>
      <ComparisonForm key={key} node={node} parameterKey={key} />
    </section>
  );
}
function validComparisonValues(node: PipelineNode, parameterKey: string, values: string[]) {
  if (values.length !== 3 || new Set(values.map(Number)).size !== 3) return false;
  const schema = parameterSchema(node.operation);
  return values.every(
    (value) =>
      value.trim() !== '' &&
      schema.safeParse({ ...node.parameters, [parameterKey]: Number(value) }).success,
  );
}

function ComparisonForm({ node, parameterKey }: { node: PipelineNode; parameterKey: string }) {
  const [values, setValues] = useState(() => comparisonValues(node, parameterKey).map(String));
  const comparison = useStudy((s) => s.comparison),
    status = useStudy((s) => s.comparisonStatus),
    error = useStudy((s) => s.comparisonError);
  const runtimeStatus = useRuntime((s) => s.status);
  const parameter = registry[node.operation]!.parameters.find((p) => p.key === parameterKey)!;
  const running = status === 'running';
  const results =
    comparison?.nodeId === node.id && comparison.parameter === parameterKey
      ? comparison.variants
      : undefined;
  const valid = validComparisonValues(node, parameterKey, values);
  return (
    <>
      <div className="comparison-controls">
        {(['first', 'second', 'third'] as const).map((slot, index) => (
          <label key={slot}>
            Value {index + 1}
            <TextInput
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
          className="comparison-run"
          variant={running ? undefined : 'primary'}
          disabled={!running && (!valid || !node.enabled || runtimeStatus !== 'ready')}
          onClick={() => {
            if (running) {
              cancelComparison();
              return;
            }
            void requestComparison(
              useLab.getState().document,
              node.id,
              parameterKey,
              values.map(Number),
            );
          }}
        >
          {running ? 'Cancel comparison' : 'Generate comparisons'}
        </Button>
      </div>
      {!valid && (
        <p className="comparison-feedback">
          Enter three distinct values within this parameter’s valid range and input requirements.
        </p>
      )}
      <div role="status" className="comparison-feedback">
        {running && 'Rendering three previews… Editing the graph cancels this comparison.'}
        {status === 'error' && error}
        {status === 'idle' && 'Choose values, then generate three previews.'}
        {results && 'Three previews ready. Choose a value to apply it.'}
      </div>
      {(running || results) && (
        <ComparisonResults
          nodeId={node.id}
          parameterKey={parameterKey}
          parameterLabel={parameter.label}
          values={values}
          results={results}
        />
      )}
    </>
  );
}
function ComparisonResults({
  nodeId,
  parameterKey,
  parameterLabel,
  values,
  results,
}: {
  nodeId: string;
  parameterKey: string;
  parameterLabel: string;
  values: string[];
  results?: NonNullable<ReturnType<typeof useStudy.getState>['comparison']>['variants'];
}) {
  function apply(value: number) {
    const lab = useLab.getState();
    if (!lab.document.nodes.some((node) => node.id === nodeId)) return;
    lab.edit((doc) => ({
      ...doc,
      nodes: doc.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, parameters: { ...node.parameters, [parameterKey]: value } }
          : node,
      ),
    }));
    lab.notify(
      `Applied ${parameterLabel.toLowerCase()} ${value}. Undo restores the previous setting.`,
    );
    cancelComparison();
  }

  return (
    <>
      <div className="comparison-results" aria-busy={!results}>
        {values.map((value, index) => {
          const variant = results?.[index];
          return (
            <figure key={value}>
              <figcaption>
                {parameterLabel} <strong>{Number(value)}</strong>
              </figcaption>
              <div className="variant-image" data-pending={variant ? undefined : ''}>
                {variant && (
                  <CanvasView nodeId={`variant-${index}`} frameStore={comparisonFrames} />
                )}
              </div>
              <span>
                {variant ? `${variant.width} × ${variant.height} preview px` : 'Rendering…'}
              </span>
              {variant && (
                <Button onClick={() => apply(variant.value)}>Apply {variant.value}</Button>
              )}
            </figure>
          );
        })}
      </div>
      <p className="study-note">
        Approximate previews, input capped at 1,024 px. Spatial parameters scale with the preview.
        Full-resolution export uses your original parameters. No result is automatically ranked
        best.
      </p>
    </>
  );
}
