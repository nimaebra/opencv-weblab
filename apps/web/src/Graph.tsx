import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  useReactFlow,
  useViewport,
  type NodeProps,
  type Node,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import { Image, SlidersHorizontal, AlertCircle, EyeOff, GitBranch, Plus } from 'lucide-react';
import { registry, connect, type PipelineNode } from '@roveran/pipeline';
import { useLab } from './store';
import { useRuntime } from './runtime';
import { CanvasView } from './CanvasView';
type LabNode = Node<{ node: PipelineNode }, 'operation'>;
const OperationNode = memo(function OperationNode({ data, selected }: NodeProps<LabNode>) {
  const node = data.node;
  const def = registry[node.operation]!;
  const result = useRuntime((s) => s.nodes[node.id]);
  const error = useRuntime((s) => s.errors[node.id]);
  return (
    <div
      className={`operation-node ${selected ? 'selected' : ''} ${error ? 'has-error' : ''} ${!node.enabled ? 'bypassed' : ''}`}
    >
      <div className="node-heading">
        {node.operation === 'source' ? <Image size={14} /> : <SlidersHorizontal size={14} />}
        <strong>{node.label}</strong>
        {!node.enabled && <EyeOff size={13} />}
      </div>
      <div className="node-image">
        <CanvasView nodeId={node.id} thumbnail />
        {error && (
          <span className="node-error" title={error}>
            <AlertCircle size={16} />
          </span>
        )}
      </div>
      <div className="node-meta">
        <span>
          {result
            ? `${result.width} × ${result.height}`
            : error
              ? 'Needs attention'
              : 'Awaiting input'}
        </span>
        <span>{result?.mode === 'gray' ? 'GRAY' : result ? 'RGBA' : ''}</span>
      </div>
      {(['A', 'B'] as const).slice(0, def.inputs).map((port) => (
        <Handle
          key={port}
          type="target"
          position={Position.Left}
          id={port === 'A' ? '0' : '1'}
          style={{ top: def.inputs === 2 ? `${port === 'A' ? 38 : 70}%` : '50%' }}
          aria-label={`Input ${port}`}
        />
      ))}
      <Handle type="source" position={Position.Right} id="output" aria-label="Output" />
      {def.inputs === 2 && (
        <>
          <span className="port-label port-a">A</span>
          <span className="port-label port-b">B</span>
        </>
      )}
    </div>
  );
});
const nodeTypes = { operation: OperationNode };
export function Graph() {
  const doc = useLab((s) => s.document);
  const selected = useLab((s) => s.selected);
  const select = useLab((s) => s.select);
  const flow = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const { zoom } = useViewport();
  const past = useLab((s) => s.past.length),
    future = useLab((s) => s.future.length);
  const nodes = useMemo(
    () =>
      doc.nodes.map((node) => ({
        id: node.id,
        type: 'operation' as const,
        position: node.position,
        selected: node.id === selected,
        ariaLabel: node.label,
        data: { node },
      })),
    [doc.nodes, selected],
  );
  const edges = useMemo(
    () =>
      doc.edges.map((e) => ({
        ...e,
        targetHandle: String(e.input),
        sourceHandle: 'output',
        type: 'smoothstep',
        style: { stroke: '#90a39a', strokeWidth: 1.7 },
      })),
    [doc.edges],
  );
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = selected ?? useLab.getState().document.preview.b;
    const node = useLab.getState().document.nodes.find((n) => n.id === id);
    if (!node || !canvas.current) return;
    const bounds = canvas.current.getBoundingClientRect();
    const position = flow.flowToScreenPosition(node.position);
    const zoom = flow.getZoom();
    if (
      position.x < bounds.left + 12 ||
      position.x + 180 * zoom > bounds.right - 12 ||
      position.y < bounds.top + 12 ||
      position.y + 160 * zoom > bounds.bottom - 12
    ) {
      void flow.setCenter(node.position.x + 90, node.position.y + 80, { zoom, duration: 0 });
    }
  }, [selected, doc.nodes.length, flow]);
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    try {
      useLab
        .getState()
        .edit((doc) =>
          connect(doc, connection.source, connection.target, Number(connection.targetHandle ?? 0)),
        );
    } catch (error) {
      useLab.getState().notify((error as Error).message);
    }
  }, []);
  const onNodesChange = useCallback((changes: NodeChange<LabNode>[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position)
        useLab.getState().edit(
          (doc) => ({
            ...doc,
            nodes: doc.nodes.map((n) => (n.id === c.id ? { ...n, position: c.position! } : n)),
          }),
          false,
        );
      if (c.type === 'select' && c.selected) useLab.getState().select(c.id);
      if (c.type === 'remove') useLab.getState().remove(c.id);
    }
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
    if (removed.size)
      useLab
        .getState()
        .edit((doc) => ({ ...doc, edges: doc.edges.filter((e) => !removed.has(e.id)) }));
  }, []);
  return (
    <section
      className={`graph-section ${zoom < 0.6 ? 'zoomed-out' : ''}`}
      style={{ '--graph-zoom': Math.max(0.6, Math.min(1, zoom)) } as React.CSSProperties}
      aria-label="Pipeline graph"
    >
      <div className="graph-heading">
        <div>
          <GitBranch size={15} />
          <h2>Pipeline</h2>
          <span className="muted">
            {doc.nodes.length} nodes · {doc.edges.length} connections
          </span>
        </div>
        <span className="graph-hint">Drag tools here. Connect to explore.</span>
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
      <div
        ref={canvas}
        className="graph-canvas"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          e.preventDefault();
          const operation = e.dataTransfer.getData('application/roveran-operation');
          if (registry[operation])
            useLab
              .getState()
              .add(operation, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
      >
        <ReactFlow<LabNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => select(node.id)}
          onPaneClick={() => select(null)}
          onNodeDragStart={() => useLab.getState().checkpoint()}
          onMoveEnd={(_, viewport) =>
            useLab.getState().edit((doc) => ({ ...doc, viewport }), false)
          }
          defaultViewport={doc.viewport}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 0.95 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: false }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cdd4cc" />
          <Controls showInteractive={false} />
          {doc.nodes.length === 0 && (
            <div className="graph-empty">
              <Plus size={28} />
              <h3>Your experiment starts here</h3>
              <p>Add an image, then choose a tool from the library.</p>
              <button
                className="button primary"
                onClick={() => document.getElementById('image-input')?.click()}
              >
                Add an image
              </button>
            </div>
          )}
        </ReactFlow>
      </div>
    </section>
  );
}
