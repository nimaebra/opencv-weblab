import { z } from 'zod';
import { registry, parameterSchema, defaults, type ImageMode } from './registry';
export * from './registry';
export * from './python';
export const OPENCV_VERSION = '4.13.0';
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 4096 * 4096;
const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, underscores or hyphens for identifiers.')
  .refine((value) => !(value in Object.prototype), 'Reserved identifier.');
export const sourceSchema = z
  .object({
    id: identifier,
    name: z.string().max(255),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    builtin: z.enum(['/samples/fruits.jpg', '/samples/calibration.png']).optional(),
  })
  .strict()
  .refine((s) => s.width * s.height <= MAX_IMAGE_PIXELS, 'Image must be at most 16 megapixels.');
export const nodeSchema = z
  .object({
    id: identifier,
    operation: z.string().max(60),
    operationVersion: z.literal(1),
    label: z.string().max(100),
    parameters: z.record(z.string(), z.union([z.number().finite(), z.string().max(100)])),
    enabled: z.boolean(),
    sourceId: identifier.optional(),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  })
  .strict();
export const edgeSchema = z
  .object({
    id: identifier,
    source: identifier,
    target: identifier,
    input: z.number().int().min(0).max(1),
  })
  .strict();
export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifier,
    name: z.string().min(1).max(100),
    nodes: z.array(nodeSchema).max(100),
    edges: z.array(edgeSchema).max(250),
    sources: z.array(sourceSchema).max(20),
    preview: z.object({
      a: z.string().nullable(),
      b: z.string().nullable(),
      quality: z.enum(['auto', 'full']),
    }),
    viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number().positive() }),
  })
  .strict();
export type PipelineDocument = z.infer<typeof documentSchema>;
export type PipelineNode = z.infer<typeof nodeSchema>;
export type PipelineEdge = z.infer<typeof edgeSchema>;
export type SourceReference = z.infer<typeof sourceSchema>;
export type GraphIssue = {
  nodeId?: string;
  message: string;
  code: 'cycle' | 'input' | 'parameter' | 'operation' | 'source' | 'mode';
};
export function topologicalOrder(doc: Pick<PipelineDocument, 'nodes' | 'edges'>): PipelineNode[] {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const indegree = new Map(doc.nodes.map((n) => [n.id, 0]));
  const next = new Map<string, string[]>();
  for (const e of doc.edges) {
    if (!byId.has(e.source) || !byId.has(e.target))
      throw new Error('Connection references a missing node.');
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
    next.set(e.source, [...(next.get(e.source) ?? []), e.target]);
  }
  const queue = doc.nodes.filter((n) => indegree.get(n.id) === 0);
  const sorted: PipelineNode[] = [];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]!;
    sorted.push(n);
    for (const id of next.get(n.id) ?? []) {
      const d = indegree.get(id)! - 1;
      indegree.set(id, d);
      if (d === 0) queue.push(byId.get(id)!);
    }
  }
  if (sorted.length !== doc.nodes.length) throw new Error('Pipelines cannot contain cycles.');
  return sorted;
}
export function validateGraph(doc: PipelineDocument, requireInputs = true): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const ids = new Set<string>();
  const sourceIds = new Set(doc.sources.map((s) => s.id));
  const edgeIds = new Set<string>();
  const occupied = new Set<string>();
  for (const n of doc.nodes) {
    if (ids.has(n.id))
      issues.push({ nodeId: n.id, code: 'operation', message: 'Duplicate node identifier.' });
    ids.add(n.id);
    const def = registry[n.operation];
    if (!def) {
      issues.push({
        nodeId: n.id,
        code: 'operation',
        message: `Unsupported operation: ${n.operation}`,
      });
      continue;
    }
    const result = parameterSchema(n.operation).safeParse(n.parameters);
    if (!result.success)
      issues.push({
        nodeId: n.id,
        code: 'parameter',
        message: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    if (n.operation === 'source' && (!n.sourceId || !sourceIds.has(n.sourceId)))
      issues.push({
        nodeId: n.id,
        code: 'source',
        message: 'Choose or reconnect an image source.',
      });
    for (let input = 0; input < (n.enabled ? def.inputs : Math.min(def.inputs, 1)); input++) {
      if (requireInputs && !doc.edges.some((e) => e.target === n.id && e.input === input))
        issues.push({
          nodeId: n.id,
          code: 'input',
          message: `Connect input ${input === 0 ? 'A' : 'B'}.`,
        });
    }
  }
  for (const e of doc.edges) {
    const target = doc.nodes.find((n) => n.id === e.target);
    const key = `${e.target}:${e.input}`;
    if (edgeIds.has(e.id) || occupied.has(key))
      issues.push({
        nodeId: e.target,
        code: 'input',
        message: 'Each input accepts one connection.',
      });
    edgeIds.add(e.id);
    occupied.add(key);
    if (!ids.has(e.source) || !target || e.input >= (registry[target.operation]?.inputs ?? 0))
      issues.push({ nodeId: e.target, code: 'input', message: 'Invalid connection.' });
  }
  try {
    topologicalOrder(doc);
    if (requireInputs) {
      const modes = inferModes(doc);
      const sizes = inferDimensions(doc);
      for (const node of doc.nodes) {
        const def = registry[node.operation];
        if (!def || !node.enabled) continue;
        const inputs = doc.edges
          .filter((e) => e.target === node.id)
          .sort((a, b) => a.input - b.input);
        const first = inputs[0] ? modes.get(inputs[0].source) : undefined;
        if (first && def.accepts !== 'any' && first !== def.accepts)
          issues.push({
            nodeId: node.id,
            code: 'mode',
            message:
              def.accepts === 'gray'
                ? 'Grayscale input required. Insert a Grayscale node.'
                : 'Color input required. Connect a color source.',
          });
        if (def.inputs === 2 && inputs.length === 2) {
          const second = modes.get(inputs[1]!.source);
          const a = sizes.get(inputs[0]!.source),
            b = sizes.get(inputs[1]!.source);
          if (
            (first && second && first !== second) ||
            (a && b && (a.width !== b.width || a.height !== b.height))
          )
            issues.push({
              nodeId: node.id,
              code: 'mode',
              message: 'Inputs A and B must have identical dimensions and color mode.',
            });
        }
      }
    }
  } catch (error) {
    issues.push({ code: 'cycle', message: (error as Error).message });
  }
  return issues;
}
export function parseDocument(input: unknown): PipelineDocument {
  const doc = documentSchema.parse(input);
  const issues = validateGraph(doc, false).filter((i) => i.code !== 'source');
  if (issues.length) throw new Error(issues.map((i) => i.message).join('\n'));
  return doc;
}
export function inferModes(doc: PipelineDocument): Map<string, ImageMode> {
  const modes = new Map<string, ImageMode>();
  for (const n of topologicalOrder(doc)) {
    const def = registry[n.operation];
    if (!def) continue;
    const first = doc.edges.find((e) => e.target === n.id && e.input === 0);
    const upstream = first ? modes.get(first.source) : undefined;
    if (n.operation === 'source') modes.set(n.id, 'rgba');
    else if (!n.enabled && upstream) modes.set(n.id, upstream);
    else if (def.output !== 'same') modes.set(n.id, def.output);
    else if (upstream) modes.set(n.id, upstream);
  }
  return modes;
}
export function connect(
  doc: PipelineDocument,
  source: string,
  target: string,
  input = 0,
): PipelineDocument {
  const next = {
    ...doc,
    edges: [
      ...doc.edges.filter((e) => !(e.target === target && e.input === input)),
      { id: crypto.randomUUID(), source, target, input },
    ],
  };
  const issues = validateGraph(next, false).filter((i) => i.code !== 'source');
  if (issues.length) throw new Error(issues[0]!.message);
  const mode = inferModes(next).get(source);
  const node = doc.nodes.find((n) => n.id === target)!;
  const def = registry[node.operation]!;
  if (node.enabled && def.accepts !== 'any' && mode && mode !== def.accepts)
    throw new Error(
      `${def.label} requires ${def.accepts === 'gray' ? 'grayscale' : 'color'} input. Insert a ${def.accepts === 'gray' ? 'Grayscale' : 'color source'} node.`,
    );
  return next;
}
export function newNode(operation: string, x = 0, y = 0): PipelineNode {
  const def = registry[operation];
  if (!def) throw new Error('Unknown operation.');
  return {
    id: crypto.randomUUID(),
    operation,
    operationVersion: 1,
    label: def.label,
    parameters: defaults(operation),
    enabled: true,
    position: { x, y },
  };
}
export function emptyDocument(): PipelineDocument {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name: 'Untitled experiment',
    nodes: [],
    edges: [],
    sources: [],
    preview: { a: null, b: null, quality: 'auto' },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}
export function executionSignature(doc: PipelineDocument): string {
  return JSON.stringify({
    nodes: doc.nodes.map(({ id, operation, operationVersion, parameters, enabled, sourceId }) => ({
      id,
      operation,
      operationVersion,
      parameters,
      enabled,
      sourceId,
    })),
    edges: doc.edges,
    sources: doc.sources,
    quality: doc.preview.quality,
  });
}
export function descendants(doc: PipelineDocument, id: string): Set<string> {
  const result = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const e of doc.edges)
      if (result.has(e.source) && !result.has(e.target)) {
        result.add(e.target);
        changed = true;
      }
  }
  return result;
}
export function makeExample(kind: 'edges' | 'morphology' | 'branches' = 'edges'): PipelineDocument {
  const doc = emptyDocument();
  doc.name = {
    edges: 'Finding the edges',
    morphology: 'Shapes from light',
    branches: 'Two ways to see',
  }[kind];
  doc.sources = [
    {
      id: 'sample-fruit',
      name: 'Still life.jpg',
      mime: 'image/jpeg',
      width: 512,
      height: 480,
      builtin: '/samples/fruits.jpg',
    },
  ];
  const source = { ...newNode('source', 0, 45), sourceId: 'sample-fruit' };
  const gray = newNode('grayscale', 230, 45);
  const blur = newNode('gaussian', 460, 45);
  const end = newNode(kind === 'morphology' ? 'otsu' : 'canny', 690, 45);
  doc.nodes = [source, gray, blur, end];
  doc.edges = [
    { id: 'e1', source: source.id, target: gray.id, input: 0 },
    { id: 'e2', source: gray.id, target: blur.id, input: 0 },
    { id: 'e3', source: blur.id, target: end.id, input: 0 },
  ];
  if (kind === 'morphology') {
    const close = newNode('close', 920, 45);
    doc.nodes.push(close);
    doc.edges.push({ id: 'e4', source: end.id, target: close.id, input: 0 });
    doc.preview.b = close.id;
  } else if (kind === 'branches') {
    const median = newNode('median', 460, 250);
    doc.nodes.push(median);
    doc.edges.push({ id: 'e4', source: gray.id, target: median.id, input: 0 });
    doc.preview.b = median.id;
  } else doc.preview.b = end.id;
  doc.preview.a = source.id;
  return doc;
}

export function inferDimensions(
  doc: PipelineDocument,
): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of topologicalOrder(doc)) {
    if (node.operation === 'source') {
      const source = doc.sources.find((s) => s.id === node.sourceId);
      if (source) sizes.set(node.id, { width: source.width, height: source.height });
    } else if (node.enabled && node.operation === 'resize')
      sizes.set(node.id, {
        width: Number(node.parameters.width),
        height: Number(node.parameters.height),
      });
    else {
      const edge = doc.edges.find((e) => e.target === node.id && e.input === 0);
      const size = edge ? sizes.get(edge.source) : undefined;
      if (size) sizes.set(node.id, size);
    }
  }
  return sizes;
}
