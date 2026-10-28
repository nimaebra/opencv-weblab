import { connect, newNode, registry, type PipelineDocument } from './index';
/** Both replacement connections validate before the caller commits this document. */
export function insertOperation(
  doc: PipelineDocument,
  operation: string,
  edgeId: string,
  position?: { x: number; y: number },
): PipelineDocument {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) throw new Error('Choose an existing connection.');
  if (registry[operation]?.inputs !== 1)
    throw new Error('Only a single-input tool can be inserted on a connection.');
  if (doc.nodes.length >= 100) throw new Error('This experiment supports up to 100 nodes.');
  const source = doc.nodes.find((n) => n.id === edge.source)!,
    target = doc.nodes.find((n) => n.id === edge.target)!;
  const node = newNode(
    operation,
    position?.x ?? (source.position.x + target.position.x) / 2,
    position?.y ?? (source.position.y + target.position.y) / 2,
  );
  let next = {
    ...doc,
    nodes: [...doc.nodes, node],
    edges: doc.edges.filter((e) => e.id !== edgeId),
  };
  next = connect(next, edge.source, node.id);
  return connect(next, node.id, edge.target, edge.input);
}
export function duplicateNodes(
  doc: PipelineDocument,
  ids: string[],
): { document: PipelineDocument; ids: string[] } {
  const originals = doc.nodes.filter((n) => ids.includes(n.id));
  if (doc.nodes.length + originals.length > 100)
    throw new Error('This experiment supports up to 100 nodes.');
  const remap = new Map(originals.map((n) => [n.id, crypto.randomUUID()]));
  const nodes = originals.map((n) => ({
    ...structuredClone(n),
    id: remap.get(n.id)!,
    label: `${n.label.slice(0, 95)} copy`,
    position: { x: n.position.x + 35, y: n.position.y + 190 },
  }));
  const edges = doc.edges
    .filter((e) => remap.has(e.target))
    .map((e) => ({
      ...e,
      id: crypto.randomUUID(),
      source: remap.get(e.source) ?? e.source,
      target: remap.get(e.target)!,
    }));
  if (doc.edges.length + edges.length > 250)
    throw new Error('This experiment supports up to 250 connections.');
  return {
    document: { ...doc, nodes: [...doc.nodes, ...nodes], edges: [...doc.edges, ...edges] },
    ids: nodes.map((n) => n.id),
  };
}
export function removeNodes(doc: PipelineDocument, ids: string[]): PipelineDocument {
  const removed = new Set(ids),
    nodes = doc.nodes.filter((n) => !removed.has(n.id));
  const sources = new Set(nodes.map((n) => n.sourceId));
  return {
    ...doc,
    nodes,
    edges: doc.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
    sources: doc.sources.filter((s) => sources.has(s.id)),
    preview: {
      ...doc.preview,
      a: doc.preview.a && removed.has(doc.preview.a) ? null : doc.preview.a,
      b: doc.preview.b && removed.has(doc.preview.b) ? null : doc.preview.b,
    },
  };
}
