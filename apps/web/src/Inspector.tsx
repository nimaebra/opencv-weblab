import { OperationControls } from './OperationControls';
import { memo, useState } from 'react';
import { Copy, Trash2, Pin, BookOpen, ArrowRight, Link, ArrowUpRight, Plus } from 'lucide-react';
import { registry, connect } from '@roveran/pipeline';
import { Button } from '@roveran/ui';
import { useLab, insertGrayscale } from './store';
import { useRuntime } from './runtime';
export const Inspector = memo(function Inspector() {
  const doc = useLab((s) => s.document);
  const selected = useLab((s) => s.selected);
  const node = doc.nodes.find((n) => n.id === selected);
  const error = useRuntime((s) => (selected ? s.errors[selected] : undefined));
  const result = useRuntime((s) => (selected ? s.nodes[selected] : undefined));
  const [from, setFrom] = useState('');
  const [input, setInput] = useState(0);
  if (!node)
    return (
      <aside className="inspector panel">
        <div className="panel-heading">
          <h2>Inspector</h2>
          <ArrowUpRight className="shortcut" size={15} />
        </div>
        <div className="inspector-empty">
          <div className="inspector-empty-icon">
            <Sliders />
          </div>
          <h3>A closer look</h3>
          <p>
            Select a node to inspect its result, change parameters, and understand what happens to
            each pixel.
          </p>
          <div className="instruction">
            <span>1</span> Choose a tool
          </div>
          <div className="instruction">
            <span>2</span> Adjust its parameters
          </div>
          <div className="instruction">
            <span>3</span> See the difference
          </div>
        </div>
        <div className="local-note">
          <BookOpen size={17} />
          <p>
            A small lab for big ideas.
            <br />
            <span>Every change is a chance to learn.</span>
          </p>
        </div>
      </aside>
    );
  const def = registry[node.operation]!;
  return (
    <aside className="inspector panel" aria-label="Node inspector">
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
            aria-label="Delete node"
            title="Delete node"
            icon={<Trash2 size={15} />}
            onClick={() => useLab.getState().remove(node.id)}
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
            {def.accepts === 'gray' && (
              <Button onClick={() => insertGrayscale(node.id)} icon={<Plus size={14} />}>
                Insert Grayscale
              </Button>
            )}
          </div>
        )}
        <OperationControls node={node} />
        <section className="explanation">
          <h4>
            <BookOpen size={15} />
            What’s happening?
          </h4>
          <p>{def.description}</p>
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
                  <option value={0}>A</option>
                  <option value={1}>B</option>
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
            onClick={() =>
              useLab
                .getState()
                .edit((doc) => ({ ...doc, preview: { ...doc.preview, b: node.id } }), false)
            }
          >
            Pin to B
          </Button>
        </div>
      </div>
    </aside>
  );
});
function Sliders() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" fill="var(--surface)" />
      <circle cx="15" cy="17" r="3" fill="var(--surface)" />
    </svg>
  );
}
