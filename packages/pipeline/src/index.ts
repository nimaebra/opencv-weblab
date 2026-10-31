import { lessons, type LessonKind } from './lessons';
import { cropBounds } from './geometry';
import { z } from 'zod';
import { registry, parameterSchema, defaults, inputContract, type ImageMode } from './registry';
export * from './registry';
export * from './python';
export * from './editing';
export * from './lessons';
export * from './comparisons';
export * from './geometry';
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
    builtin: z
      .enum([
        '/samples/fruits.jpg',
        '/samples/calibration.png',
        '/samples/learning-noise.png',
        '/samples/learning-illumination.png',
        '/samples/learning-gaps.png',
        '/samples/learning-contrast.png',
        '/samples/learning-objects.png',
        '/samples/learning-shapes.png',
        '/samples/learning-particles.png',
        '/samples/learning-details.png',
        '/samples/learning-geometry.png',
        '/samples/learning-perspective.png',
      ])
      .optional(),
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
    lessonId: z.enum(lessons.map((lesson) => lesson.id)).optional(),
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
  if (sourceIds.size !== doc.sources.length)
    issues.push({ code: 'source', message: 'Duplicate source identifier.' });
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
        for (const edge of inputs) {
          const contract = inputContract(def, edge.input);
          const mode = modes.get(edge.source);
          if (mode && contract.accepts !== 'any' && mode !== contract.accepts)
            issues.push({
              nodeId: node.id,
              code: 'mode',
              message: `${contract.accepts === 'gray' ? 'Grayscale' : 'Color'} input required for ${contract.label}. ${contract.accepts === 'gray' ? 'Insert a Grayscale node.' : 'Connect a color source.'}`,
            });
        }
        if (def.inputs === 2 && inputs.length === 2) {
          const second = modes.get(inputs[1]!.source);
          const a = sizes.get(inputs[0]!.source),
            b = sizes.get(inputs[1]!.source);
          if (
            (def.matchingModes !== false && first && second && first !== second) ||
            (a && b && (a.width !== b.width || a.height !== b.height))
          )
            issues.push({
              nodeId: node.id,
              code: 'mode',
              message:
                def.matchingModes === false
                  ? 'Image and mask must have identical dimensions.'
                  : 'Inputs A and B must have identical dimensions and color mode.',
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
  const issues = validateGraph(doc, false).filter((i) => i.code !== 'source' || !i.nodeId);
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
  const contract = inputContract(def, input);
  if (
    node.enabled &&
    (input === 0 || def.inputs > 1) &&
    contract.accepts !== 'any' &&
    mode &&
    mode !== contract.accepts
  )
    throw new Error(
      `${def.label}: ${contract.label} requires ${contract.accepts === 'gray' ? 'grayscale' : 'color'} input. Insert a ${contract.accepts === 'gray' ? 'Grayscale' : 'color source'} node.`,
    );
  if (node.enabled && def.inputs === 2) {
    const inputs = next.edges.filter((e) => e.target === target).sort((a, b) => a.input - b.input);
    if (inputs.length === 2) {
      const sizes = inferDimensions(next),
        modes = inferModes(next);
      const first = sizes.get(inputs[0]!.source),
        second = sizes.get(inputs[1]!.source);
      if (
        (def.matchingModes !== false &&
          modes.get(inputs[0]!.source) &&
          modes.get(inputs[1]!.source) &&
          modes.get(inputs[0]!.source) !== modes.get(inputs[1]!.source)) ||
        (first && second && (first.width !== second.width || first.height !== second.height))
      )
        throw new Error(
          def.matchingModes === false
            ? 'Image and mask must have identical dimensions.'
            : 'Inputs A and B must have identical dimensions and color mode.',
        );
    }
  }
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
export function makeExample(kind: LessonKind = 'edges'): PipelineDocument {
  const doc = emptyDocument();
  doc.name = lessons.find((l) => l.id === kind)!.title;
  doc.lessonId = kind;
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
  doc.nodes = [source];
  doc.preview.a = source.id;
  function add(operation: string, parent: string, x: number, y = 45) {
    const node = newNode(operation, x, y);
    doc.nodes.push(node);
    doc.edges.push({ id: crypto.randomUUID(), source: parent, target: node.id, input: 0 });
    return node;
  }
  if (['local-contrast', 'details', 'rectify', 'geometry', 'distances'].includes(kind)) {
    const fixture = (
      {
        'local-contrast': 'illumination',
        details: 'details',
        rectify: 'perspective',
        geometry: 'geometry',
        distances: 'shapes',
      } as Record<string, string>
    )[kind]!;
    source.sourceId = `learning-${fixture}`;
    doc.sources = [
      {
        id: source.sourceId,
        name: `learning-${fixture}.png`,
        mime: 'image/png',
        width: 192,
        height: 192,
        builtin: `/samples/learning-${fixture}.png` as SourceReference['builtin'],
      },
    ];
    const gray = add('grayscale', source.id, 230);
    doc.preview.a = gray.id;
    if (kind === 'local-contrast') {
      doc.preview.a = add('equalize', gray.id, 460).id;
      doc.preview.b = add('clahe', gray.id, 460, 250).id;
    } else if (kind === 'details') {
      const top = add('top-hat', gray.id, 460),
        black = add('black-hat', gray.id, 460, 250);
      top.parameters.kernel = black.parameters.kernel = 15;
      doc.preview.a = top.id;
      doc.preview.b = black.id;
    } else if (kind === 'rectify') {
      const crop = add('crop', source.id, 460),
        perspective = add('perspective', source.id, 460, 250);
      crop.parameters = { left: 8, top: 7, right: 92, bottom: 90 };
      perspective.parameters = {
        tlX: 19.9,
        tlY: 15.7,
        trX: 80.1,
        trY: 15.7,
        brX: 91.1,
        brY: 88.5,
        blX: 8.9,
        blY: 88.5,
        width: 160,
        height: 160,
        interpolation: 'linear',
      };
      doc.preview.a = crop.id;
      doc.preview.b = perspective.id;
    } else if (kind === 'geometry') {
      const edges = add('canny', gray.id, 460),
        lines = add('hough-lines', edges.id, 690);
      lines.parameters = { votes: 25, minLength: 30, maxGap: 8 };
      const smooth = add('median', gray.id, 460, 250);
      smooth.parameters.kernel = 3;
      const circles = add('hough-circles', smooth.id, 690, 250);
      circles.parameters = {
        minDistance: 30,
        edgeThreshold: 100,
        accumulator: 20,
        minRadius: 15,
        maxRadius: 35,
      };
      add('shi-tomasi', gray.id, 690, 455);
      doc.preview.b = lines.id;
    } else {
      const distance = add('distance-transform', gray.id, 460);
      doc.preview.b = add('color-map', distance.id, 690).id;
    }
  } else if (['counting', 'shape-area', 'isolate-objects'].includes(kind)) {
    const fixture =
      kind === 'counting' ? 'objects' : kind === 'shape-area' ? 'shapes' : 'particles';
    doc.sources = [
      {
        id: `objects-${fixture}`,
        name: `learning-${fixture}.png`,
        mime: 'image/png',
        width: 192,
        height: 192,
        builtin: `/samples/learning-${fixture}.png` as SourceReference['builtin'],
      },
    ];
    source.sourceId = `objects-${fixture}`;
    const gray = add('grayscale', source.id, 230);
    if (kind === 'counting') {
      doc.preview.a = gray.id;
      doc.preview.b = add('components', gray.id, 460).id;
    } else if (kind === 'shape-area') {
      doc.preview.a = add('components', gray.id, 460).id;
      doc.preview.b = add('contours', gray.id, 460, 250).id;
    } else {
      const mask = add('threshold', gray.id, 460);
      const filtered = add('filter-objects', mask.id, 690);
      const isolated = add('apply-mask', source.id, 920);
      doc.edges.push({
        id: crypto.randomUUID(),
        source: filtered.id,
        target: isolated.id,
        input: 1,
      });
      add('components', filtered.id, 920, 250);
      doc.preview.a = mask.id;
      doc.preview.b = isolated.id;
    }
  } else if (['noise', 'illumination', 'gaps', 'low-contrast'].includes(kind)) {
    const fixture = {
      noise: 'noise',
      illumination: 'illumination',
      gaps: 'gaps',
      'low-contrast': 'contrast',
    }[kind as 'noise' | 'illumination' | 'gaps' | 'low-contrast']!;
    doc.sources = [
      {
        id: `learning-${fixture}`,
        name: `learning-${fixture}.png`,
        mime: 'image/png',
        width: 192,
        height: 192,
        builtin: `/samples/learning-${fixture}.png` as SourceReference['builtin'],
      },
    ];
    source.sourceId = `learning-${fixture}`;
    const gray = add('grayscale', source.id, 230);
    if (kind === 'noise') {
      const blur = add('gaussian', gray.id, 460);
      blur.parameters.kernel = 3;
      const median = add('median', gray.id, 460, 250);
      median.parameters.kernel = 3;
      doc.preview.a = gray.id;
      doc.preview.b = blur.id;
    } else if (kind === 'illumination') {
      const threshold = add('threshold', gray.id, 460);
      threshold.parameters.threshold = 110;
      const adaptive = add('adaptive', gray.id, 460, 250);
      adaptive.parameters.kernel = 15;
      adaptive.parameters.constant = 5;
      doc.preview.a = threshold.id;
      doc.preview.b = adaptive.id;
    } else if (kind === 'gaps') {
      const threshold = add('threshold', gray.id, 460);
      const close = add('close', threshold.id, 690);
      close.parameters.kernel = 7;
      doc.preview.a = threshold.id;
      doc.preview.b = close.id;
    } else {
      const equal = add('equalize', gray.id, 460);
      add('normalize', gray.id, 460, 250);
      doc.preview.a = gray.id;
      doc.preview.b = equal.id;
    }
  } else if (kind === 'color-mask') {
    const mask = add('hsv-mask', source.id, 240);
    mask.parameters = { hMin: 0, hMax: 25, sMin: 100, sMax: 255, vMin: 50, vMax: 255 };
    const close = add('close', mask.id, 480);
    doc.preview.b = close.id;
  } else if (kind === 'sharpen') {
    const sharp = add('sharpen', source.id, 240);
    const diff = add('absdiff', source.id, 480);
    doc.edges.push({ id: crypto.randomUUID(), source: sharp.id, target: diff.id, input: 1 });
    doc.preview.b = diff.id;
  } else {
    const gray = add('grayscale', source.id, 230);
    if (kind === 'contrast') {
      const equal = add('equalize', gray.id, 460);
      add('normalize', gray.id, 460, 250);
      doc.preview.a = gray.id;
      doc.preview.b = equal.id;
    } else {
      const blur = add('gaussian', gray.id, 460);
      const end = add(kind === 'morphology' ? 'otsu' : 'canny', blur.id, 690);
      if (kind === 'morphology') doc.preview.b = add('close', end.id, 920).id;
      else if (kind === 'branches') {
        const median = add('median', gray.id, 460, 250);
        doc.preview.a = blur.id;
        doc.preview.b = median.id;
      } else doc.preview.b = end.id;
    }
  }
  return doc;
}

export function inferDimensions(
  doc: Pick<PipelineDocument, 'nodes' | 'edges' | 'sources'>,
): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of topologicalOrder(doc)) {
    if (node.operation === 'source') {
      const source = doc.sources.find((s) => s.id === node.sourceId);
      if (source) sizes.set(node.id, { width: source.width, height: source.height });
    } else if (node.enabled && ['resize', 'perspective'].includes(node.operation))
      sizes.set(node.id, {
        width: Number(node.parameters.width),
        height: Number(node.parameters.height),
      });
    else {
      const edge = doc.edges.find((e) => e.target === node.id && e.input === 0);
      const size = edge ? sizes.get(edge.source) : undefined;
      if (size) {
        const { width, height } =
          node.enabled && node.operation === 'crop'
            ? cropBounds(node.parameters, size.width, size.height)
            : size;
        sizes.set(node.id, { width, height });
      }
    }
  }
  return sizes;
}
