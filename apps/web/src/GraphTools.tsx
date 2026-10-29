import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Button } from '@opencv-weblab/ui';
import { operations, type PipelineDocument } from '@opencv-weblab/pipeline';
import { useLab } from './store';
export function GraphTools({
  doc,
  selectedCount,
  arrange,
  connectionHint,
}: {
  doc: PipelineDocument;
  selectedCount: number;
  arrange: () => Promise<void>;
  connectionHint: string;
}) {
  const past = useLab((s) => s.past.length),
    future = useLab((s) => s.future.length);
  const [connectionId, setConnectionId] = useState(''),
    [insertTool, setInsertTool] = useState('gaussian');
  const labels = new Map(doc.nodes.map((n) => [n.id, n.label]));
  return (
    <>
      <div className="graph-heading">
        <div>
          <GitBranch size={15} />
          <h2>Pipeline</h2>
          <span className="muted">
            {doc.nodes.length} nodes · {doc.edges.length} connections
          </span>
        </div>
        <div className="graph-actions">
          <Button onClick={arrange} disabled={!doc.nodes.length}>
            Auto arrange
          </Button>
          <Button disabled={!selectedCount} onClick={() => useLab.getState().duplicateSelection()}>
            Duplicate selection
          </Button>
          <Button disabled={!selectedCount} onClick={() => useLab.getState().removeSelection()}>
            Delete selection
          </Button>
        </div>
        <div className="compact-history">
          <button
            className="button"
            aria-label="Undo"
            disabled={!past}
            onClick={() => useLab.getState().undo()}
          >
            Undo
          </button>
          <button
            className="button"
            aria-label="Redo"
            disabled={!future}
            onClick={() => useLab.getState().redo()}
          >
            Redo
          </button>
        </div>
      </div>
      <details className="connection-tools">
        <summary>Edit a connection {connectionHint ? `· ${connectionHint}` : ''}</summary>
        <div className="row">
          <label>
            Connection
            <select
              aria-label="Connection to edit"
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
            >
              <option value="">Choose a connection</option>
              {doc.edges.map((e) => (
                <option key={e.id} value={e.id}>
                  {labels.get(e.source)} → {labels.get(e.target)} ({e.input === 0 ? 'A' : 'B'})
                </option>
              ))}
            </select>
          </label>
          <label>
            Insert tool
            <select
              aria-label="Tool to insert"
              value={insertTool}
              onChange={(e) => setInsertTool(e.target.value)}
            >
              {operations
                .filter((o) => o.inputs === 1)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={!doc.edges.some((e) => e.id === connectionId)}
            onClick={() => useLab.getState().insert(insertTool, connectionId)}
          >
            Insert tool
          </Button>
          <Button
            disabled={!doc.edges.some((e) => e.id === connectionId)}
            onClick={() => {
              useLab
                .getState()
                .edit((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== connectionId) }));
              setConnectionId('');
            }}
          >
            Disconnect
          </Button>
        </div>
      </details>
    </>
  );
}
