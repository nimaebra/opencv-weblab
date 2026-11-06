import { OperationControls } from './OperationControls';
import { ComparisonButton } from './ParameterComparison';
import { memo, useState } from 'react';
import {
  Copy,
  Trash2,
  Pin,
  BookOpen,
  SlidersHorizontal,
  ArrowRight,
  Link,
  ArrowUpRight,
  Plus,
  X,
} from 'lucide-react';
import {
  registry,
  connect,
  defaults,
  generateNodePython,
  inputContract,
  inferModes,
} from '@opencv-weblab/pipeline';
import { Button } from '@opencv-weblab/ui';
import { useLab, insertGrayscale } from './store';
import { useRuntime } from './runtime';
export const Inspector = memo(function Inspector({
  onCompare,
  onClose,
}: {
  onCompare: () => void;
  onClose: () => void;
}) {
  const doc = useLab((s) => s.document);
  const selected = useLab((s) => s.selected);
  const node = doc.nodes.find((n) => n.id === selected);
  const error = useRuntime((s) => (selected ? s.errors[selected] : undefined));
  const result = useRuntime((s) => (selected ? s.nodes[selected] : undefined));
  const [fromState, setFromState] = useState({ nodeId: '', value: '' });
  const from = fromState.nodeId === selected ? fromState.value : '';
  const setFrom = (value: string) => setFromState({ nodeId: selected ?? '', value });
  const [input, setInput] = useState(0);
  const output = doc.nodes.find((n) => n.id === doc.preview.b);
  if (!node)
    return (
      <aside
        id="inspector-panel"
        className="inspector panel"
        aria-label="Node inspector"
        tabIndex={-1}
      >
        <div className="panel-heading">
          <h2>Inspector</h2>
          <Button
            className="panel-close"
            aria-label="Close inspector panel"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </div>
        <div className="inspector-empty">
          <div className="inspector-empty-icon">
            <SlidersHorizontal size={22} aria-hidden="true" />
          </div>
          <h3>Select a pipeline node</h3>
          <p>Adjust its parameters, inspect its output, and see the equivalent OpenCV code.</p>
          {output && (
            <Button
              icon={<ArrowRight size={15} />}
              onClick={(event) => {
                event.currentTarget.closest('aside')?.focus({ preventScroll: true });
                useLab.getState().select(output.id);
              }}
            >
              Inspect output B
            </Button>
          )}
        </div>
      </aside>
    );
  const def = registry[node.operation]!;
  const incoming = doc.edges.filter((e) => e.target === node.id);
  const modes = inferModes(doc);
  const grayscalePorts = Array.from({ length: def.inputs }, (_, input) => input).filter(
    (input) =>
      inputContract(def, input).accepts === 'gray' &&
      modes.get(incoming.find((e) => e.input === input)?.source ?? '') !== 'gray',
  );
  let python = '';
  try {
    python = generateNodePython(doc, node.id);
  } catch {
    python = '# Connect valid inputs to see executable Python for this step.';
  }
  return (
    <aside
      id="inspector-panel"
      className="inspector panel"
      aria-label="Node inspector"
      tabIndex={-1}
    >
      <div className="panel-heading">
        <h2>Inspector</h2>
        <div className="row">
          <Button
            aria-label="Duplicate node"
            title="Duplicate node"
            icon={<Copy size={15} />}
            onClick={() => useLab.getState().duplicate(node.id)}
          />
          <Button
            variant="danger"
            aria-label="Delete node"
            title="Delete node"
            icon={<Trash2 size={15} />}
            onClick={() => useLab.getState().remove(node.id)}
          />
          <Button
            className="panel-close"
            aria-label="Close inspector panel"
            icon={<X size={16} />}
            onClick={onClose}
          />
        </div>
      </div>
      <div className="inspector-scroll">
        <div className="selected-operation">
          <div className="operation-title">
            <h3>{def.label}</h3>
            <span className={`operation-category category-${def.category.toLowerCase()}`}>
              {def.category}
            </span>
          </div>
          <code>{def.fn}</code>
        </div>
        <label className="field">
          Node name
          <input
            aria-label="Node name"
            maxLength={100}
            value={node.label}
            onChange={(e) =>
              useLab.getState().update(node.id, { label: e.target.value }, `label:${node.id}`)
            }
          />
        </label>
        {node.operation !== 'source' && (
          <label className="toggle-row">
            <span>Enable operation</span>
            <input
              type="checkbox"
              role="switch"
              checked={node.enabled}
              onChange={(e) => useLab.getState().update(node.id, { enabled: e.target.checked })}
            />
          </label>
        )}
        {error && (
          <div className="inline-error" role="alert">
            <p>{error}</p>
            {grayscalePorts.map((port) => (
              <Button
                key={port}
                onClick={() => insertGrayscale(node.id, port)}
                icon={<Plus size={14} />}
              >
                Insert Grayscale for {inputContract(def, port).label}
              </Button>
            ))}
          </div>
        )}
        <OperationControls node={node} />
        <ComparisonButton node={node} onOpen={onCompare} />
        {def.parameters.length > 0 && (
          <Button
            onClick={() =>
              useLab.getState().update(node.id, { parameters: defaults(node.operation) })
            }
          >
            Reset parameters
          </Button>
        )}
        <section className="explanation">
          <h4>
            <BookOpen size={15} />
            What’s happening?
          </h4>
          <p>{def.description}</p>
          <p>
            <strong>Input:</strong> {def.inputHelp}
            <br />
            <strong>Output:</strong> {def.outputHelp}
          </p>
          <p>{def.experiment}</p>
          <a
            className="documentation-link"
            href={def.documentationUrl}
            target="_blank"
            rel="noreferrer"
          >
            Read the OpenCV explanation <ArrowUpRight size={12} />
          </a>
          <details className="node-python">
            <summary>Python for this step</summary>
            <pre>
              <code>{python}</code>
            </pre>
            <p>
              Variables refer to upstream steps. Export the full Python script for its helpers and
              image loading.
            </p>
          </details>
          {def.accepts === 'gray' && (
            <span className="requirement">Requires an 8-bit grayscale image</span>
          )}
        </section>
        {def.inputs > 0 && (
          <section className="connection-editor">
            <h4>
              <Link size={14} />
              Connect an input
            </h4>
            <label className="field">
              From node
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Choose an upstream node</option>
                {doc.nodes
                  .filter((n) => n.id !== node.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
              </select>
            </label>
            {def.inputs === 2 && (
              <label className="field">
                To input
                <select value={input} onChange={(e) => setInput(Number(e.target.value))}>
                  <option value={0}>A · {inputContract(def, 0).label}</option>
                  <option value={1}>B · {inputContract(def, 1).label}</option>
                </select>
              </label>
            )}
            <Button
              disabled={!from}
              icon={<ArrowRight size={14} />}
              onClick={() => {
                try {
                  useLab.getState().edit((doc) => connect(doc, from, node.id, input));
                } catch (error) {
                  useLab.getState().notify((error as Error).message);
                }
              }}
            >
              Connect
            </Button>
            {incoming.map((edge) => (
              <Button
                key={edge.id}
                onClick={() =>
                  useLab
                    .getState()
                    .edit((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== edge.id) }))
                }
              >
                Disconnect input {edge.input === 0 ? 'A' : 'B'}
              </Button>
            ))}
          </section>
        )}
        <section className="output-details">
          <h4>Output</h4>
          <div>
            <span>Dimensions</span>
            <code>{result ? `${result.width} × ${result.height}` : '—'}</code>
          </div>
          <div>
            <span>Color mode</span>
            <code>{result?.mode.toUpperCase() ?? '—'}</code>
          </div>
          <div>
            <span>Processing</span>
            <code>
              {result ? `${result.elapsed.toFixed(1)} ms${result.cached ? ' · cached' : ''}` : '—'}
            </code>
          </div>
        </section>
        <div className="pin-actions">
          <Button
            icon={<Pin size={14} />}
            onClick={() =>
              useLab
                .getState()
                .edit((doc) => ({ ...doc, preview: { ...doc.preview, a: node.id } }), false)
            }
          >
            Pin to A
          </Button>
          <Button
            icon={<Pin size={14} />}
            onClick={() => {
              useLab.getState().setFollowSelection(false);
              useLab
                .getState()
                .edit((doc) => ({ ...doc, preview: { ...doc.preview, b: node.id } }), false);
            }}
          >
            Pin to B
          </Button>
        </div>
      </div>
    </aside>
  );
});
