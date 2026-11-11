import { useState } from 'react';
import { Copy, GitBranch, Redo2, Trash2, Undo2, Workflow } from 'lucide-react';
import { Button, Select } from '@opencv-weblab/ui';
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
        <div className="graph-toolbar">
          <div className="graph-actions" role="group" aria-label="Pipeline actions">
            <Button
              aria-label="Auto arrange"
              title="Auto arrange"
              icon={<Workflow size={15} />}
              onClick={arrange}
              disabled={!doc.nodes.length}
            >
              <span>Auto arrange</span>
            </Button>
            <Button
              aria-label="Duplicate selection"
              title="Duplicate selection"
              icon={<Copy size={15} />}
              disabled={!selectedCount}
              onClick={() => useLab.getState().duplicateSelection()}
            >
              <span>Duplicate selection</span>
            </Button>
            <Button
              variant="danger"
              aria-label="Delete selection"
              title="Delete selection"
              icon={<Trash2 size={15} />}
              disabled={!selectedCount}
              onClick={() => useLab.getState().removeSelection()}
            >
              <span>Delete selection</span>
            </Button>
          </div>
          <div className="compact-history" role="group" aria-label="Edit history">
            <Button
              aria-label="Undo"
              title="Undo"
              icon={<Undo2 size={15} />}
              disabled={!past}
              onClick={() => useLab.getState().undo()}
            />
            <Button
              aria-label="Redo"
              title="Redo"
              icon={<Redo2 size={15} />}
              disabled={!future}
              onClick={() => useLab.getState().redo()}
            />
          </div>
        </div>
      </div>
      <details className="connection-tools">
        <summary>Edit a connection {connectionHint ? `· ${connectionHint}` : ''}</summary>
        <div className="row">
          <label>
            Connection
            <Select
              aria-label="Connection to edit"
              value={connectionId}
              placeholder="Choose a connection"
              options={[
                { value: '', label: 'Choose a connection' },
                ...doc.edges.map((edge) => ({
                  value: edge.id,
                  label: `${labels.get(edge.source)} → ${labels.get(edge.target)} (${edge.input === 0 ? 'A' : 'B'})`,
                })),
              ]}
              onValueChange={setConnectionId}
            />
          </label>
          <label>
            Insert tool
            <Select
              aria-label="Tool to insert"
              value={insertTool}
              options={operations
                .filter((operation) => operation.inputs === 1)
                .map((operation) => ({ value: operation.id, label: operation.label }))}
              onValueChange={setInsertTool}
            />
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
