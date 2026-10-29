import { readLocal } from './persistence';
import { GraphTools } from './GraphTools';
import { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
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
import { Image, SlidersHorizontal, AlertCircle, EyeOff, Plus } from 'lucide-react';
import { registry, connect, inputContract, type PipelineNode } from '@roveran/pipeline';
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
          aria-label={`Input ${port}: ${inputContract(def, port === 'A' ? 0 : 1).label}`}
        />
      ))}
      <Handle type="source" position={Position.Right} id="output" aria-label="Output" />
      {def.inputs === 2 && (
        <>
          <span className="port-label port-a">{def.inputContracts ? 'A · Image' : 'A'}</span>
          <span className="port-label port-b">{def.inputContracts ? 'B · Mask' : 'B'}</span>
        </>
      )}
    </div>
  );
});
const nodeTypes = { operation: OperationNode };
export function Graph() {
  const doc = useLab((s) => s.document);
  const selected = useLab((s) => s.selected);
  const selectedIds = useLab((s) => s.selectedIds);
  const [connectionHint, setConnectionHint] = useState('');
  const select = useLab((s) => s.select);
  const flow = useReactFlow();
  const canvas = useRef<HTMLDivElement>(null);
  const previousSelection = useRef({ selected, count: doc.nodes.length });
  const { zoom } = useViewport();
  useEffect(() => {
    let cancelled = false;
    const initial = useLab.getState().document;
    if (
      initial.viewport.x === 0 &&
      initial.viewport.y === 0 &&
      initial.viewport.zoom === 1 &&
      initial.nodes.length
    )
      void readLocal(initial.id).then((saved) => {
        if (!saved && !cancelled)
          requestAnimationFrame(() => {
            if (!cancelled && useLab.getState().document.id === initial.id)
              void flow.fitView({ padding: 0.18, maxZoom: 0.95 });
          });
      });
    return () => {
      cancelled = true;
    };
  }, [flow]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const nodes = useMemo(
    () =>
      doc.nodes.map((node) => ({
        id: node.id,
        type: 'operation' as const,
        position: node.position,
        selected: selectedSet.has(node.id),
        ariaLabel: node.label,
        data: { node },
      })),
    [doc.nodes, selectedSet],
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
    const changed =
      previousSelection.current.selected !== selected ||
      previousSelection.current.count !== doc.nodes.length;
    previousSelection.current = { selected, count: doc.nodes.length };
    if (!changed || !selected) return;
    const id = selected;
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
  useEffect(() => {
    if (!flow.viewportInitialized) return;
    const current = flow.getViewport(),
      desired = doc.viewport;
    if (current.x !== desired.x || current.y !== desired.y || current.zoom !== desired.zoom)
      void flow.setViewport(desired, { duration: 0 });
  }, [doc.viewport, flow]);
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
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) {
      useLab.getState().setSelection(removed);
      useLab.getState().removeSelection();
      return;
    }
    const positions = new Map(
      changes.flatMap((c) =>
        c.type === 'position' && c.position ? [[c.id, c.position] as const] : [],
      ),
    );
    if (positions.size)
      useLab.getState().edit(
        (doc) => ({
          ...doc,
          nodes: doc.nodes.map((n) =>
            positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
          ),
        }),
        false,
      );
    const selection = changes.filter((c) => c.type === 'select');
    if (selection.length) {
      const ids = new Set(useLab.getState().selectedIds);
      for (const c of selection)
        if (c.type === 'select') {
          if (c.selected) ids.add(c.id);
          else ids.delete(c.id);
        }
      useLab.getState().setSelection([...ids]);
    }
  }, []);
  async function arrange() {
    const projectId = doc.id;
    const { default: dagre } = await import('@dagrejs/dagre');
    if (useLab.getState().document.id !== projectId) return;
    const current = useLab.getState().document;
    const graph = new dagre.graphlib.Graph({ multigraph: true })
      .setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 70 })
      .setDefaultEdgeLabel(() => ({}));
    for (const node of current.nodes) graph.setNode(node.id, { width: 180, height: 160 });
    for (const edge of current.edges) graph.setEdge(edge.source, edge.target, {}, edge.id);
    dagre.layout(graph);
    useLab.getState().edit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => ({
        ...n,
        position: { x: graph.node(n.id).x - 90, y: graph.node(n.id).y - 80 },
      })),
    }));
    requestAnimationFrame(() => void flow.fitView({ padding: 0.18, maxZoom: 0.95 }));
  }
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
    if (removed.size)
      useLab
        .getState()
        .edit((doc) => ({ ...doc, edges: doc.edges.filter((e) => !removed.has(e.id)) }));
  }, []);
  return (
    <section
      tabIndex={0}
      className={`graph-section ${zoom < 0.6 ? 'zoomed-out' : ''}`}
      style={{ '--graph-zoom': Math.max(0.6, Math.min(1, zoom)) } as React.CSSProperties}
      aria-label="Pipeline graph"
    >
      <GraphTools
        doc={doc}
        selectedCount={selectedIds.length}
        arrange={arrange}
        connectionHint={connectionHint}
      />
      <div
        ref={canvas}
        className="graph-canvas"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const edge = (e.target as Element).closest('.react-flow__edge');
          setConnectionHint(
            edge ? 'Drop to insert a single-input tool' : 'Drop to create an unconnected tool',
          );
        }}
        onDrop={(e) => {
          e.preventDefault();
          const operation = e.dataTransfer.getData('application/roveran-operation');
          setConnectionHint('');
          if (!registry[operation]) return;
          const position = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const edge = (e.target as Element).closest('.react-flow__edge')?.getAttribute('data-id');
          if (edge) useLab.getState().insert(operation, edge, position);
          else useLab.getState().add(operation, position);
        }}
      >
        <ReactFlow<LabNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onPaneClick={() => select(null)}
          onNodeDragStart={() => useLab.getState().checkpoint()}
          onMoveEnd={(_, viewport) =>
            useLab.getState().edit((doc) => ({ ...doc, viewport }), false)
          }
          defaultViewport={doc.viewport}
          isValidConnection={(connection) => {
            try {
              connect(
                doc,
                connection.source!,
                connection.target!,
                Number(connection.targetHandle ?? 0),
              );
              setConnectionHint('');
              return true;
            } catch (error) {
              setConnectionHint((error as Error).message);
              return false;
            }
          }}
          onConnectStart={() => setConnectionHint('Connect to an input on another node')}
          onConnectEnd={() => setTimeout(() => setConnectionHint(''), 2500)}
          fitViewOptions={{ padding: 0.18, maxZoom: 0.95 }}
          minZoom={0.2}
          maxZoom={2}
          multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
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
