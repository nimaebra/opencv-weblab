import { describe, it, expect } from 'vitest';
import {
  operations,
  registry,
  defaults,
  parameterSchema,
  makeExample,
  newNode,
  connect,
  topologicalOrder,
  validateGraph,
  parseDocument,
  inferModes,
  executionSignature,
  generatePython,
} from '../packages/pipeline/src/index';
import { scaledOdd } from '../packages/engine/src/operations';
describe('operation catalog', () => {
  it('defines all 47 processing operations with valid defaults', () => {
    expect(operations.filter((o) => o.id !== 'source')).toHaveLength(47);
    for (const op of operations) {
      expect(parameterSchema(op.id).safeParse(defaults(op.id)).success, op.id).toBe(true);
      expect(op.description.length).toBeGreaterThan(30);
    }
  });
  it('rejects even kernels, non-finite numbers, unknown parameters and reversed Canny thresholds', () => {
    expect(parameterSchema('gaussian').safeParse({ kernel: 4, sigma: 1 }).success).toBe(false);
    expect(parameterSchema('gamma').safeParse({ gamma: NaN }).success).toBe(false);
    expect(parameterSchema('invert').safeParse({ bad: 1 }).success).toBe(false);
    expect(parameterSchema('canny').safeParse({ low: 200, high: 10 }).success).toBe(false);
  });
  it('retains exact full-resolution kernels and odd scaled preview sizes', () => {
    expect(scaledOdd(5, 1)).toBe(5);
    expect(scaledOdd(11, 1)).toBe(11);
    expect(scaledOdd(11, 0.5)).toBe(5);
    expect(scaledOdd(3, 0.1, 3)).toBe(3);
  });
});
describe('graph contracts', () => {
  it.each(['edges', 'morphology', 'branches'] as const)('has a valid %s example', (kind) => {
    const doc = makeExample(kind);
    expect(validateGraph(doc)).toEqual([]);
    expect(topologicalOrder(doc)).toHaveLength(doc.nodes.length);
    expect(generatePython(doc)).toContain('save_image("output.png"');
  });
  it('rejects cyclic connections and malformed imports', () => {
    const doc = makeExample();
    expect(() => connect(doc, doc.nodes[3]!.id, doc.nodes[1]!.id)).toThrow(/cycle/);
    expect(() => parseDocument({ ...doc, schemaVersion: 2 })).toThrow();
    expect(() =>
      parseDocument({ ...doc, nodes: [{ ...doc.nodes[0], operation: 'invented' }] }),
    ).toThrow(/Unsupported/);
  });
  it('rejects color input to a grayscale-only operation', () => {
    const doc = makeExample();
    expect(() => connect(doc, doc.nodes[0]!.id, doc.nodes[3]!.id)).toThrow(/grayscale/);
  });
  it('reports missing inputs without silently editing the graph', () => {
    const doc = makeExample();
    doc.edges = [];
    expect(validateGraph(doc).filter((i) => i.code === 'input')).toHaveLength(3);
    expect(doc.edges).toEqual([]);
  });
  it('allows branching and two-input merges but only one edge per port', () => {
    let doc = makeExample('branches');
    const blend = newNode('blend');
    doc = { ...doc, nodes: [...doc.nodes, blend] };
    doc = connect(doc, doc.nodes[2]!.id, blend.id, 0);
    doc = connect(doc, doc.nodes[4]!.id, blend.id, 1);
    expect(validateGraph(doc)).toEqual([]);
    doc = connect(doc, doc.nodes[1]!.id, blend.id, 0);
    expect(doc.edges.filter((e) => e.target === blend.id && e.input === 0)).toHaveLength(1);
  });
  it('tracks bypassed color modes', () => {
    const doc = makeExample();
    doc.nodes[1]!.enabled = false;
    expect(inferModes(doc).get(doc.nodes[1]!.id)).toBe('rgba');
  });
  it('does not invalidate execution for positions, labels, name, or preview pins', () => {
    const doc = makeExample();
    const signature = executionSignature(doc);
    doc.nodes[0]!.position.x = 900;
    doc.nodes[1]!.label = 'Renamed';
    doc.name = 'New name';
    doc.preview.a = doc.nodes[2]!.id;
    expect(executionSignature(doc)).toBe(signature);
    doc.nodes[2]!.parameters.kernel = 7;
    expect(executionSignature(doc)).not.toBe(signature);
  });
  it('exports only validated expressions and safely quotes filenames', () => {
    const doc = makeExample();
    doc.sources[0]!.name = 'image"; import os; #.png';
    expect(generatePython(doc)).toContain('image\\"; import os; #.png');
    doc.nodes[2]!.parameters.kernel = '__import__("os")';
    expect(() => generatePython(doc)).toThrow();
  });
  it('rejects invalid edge ports and duplicate IDs', () => {
    const doc = makeExample();
    doc.edges[0]!.input = 1;
    expect(() => parseDocument(doc)).toThrow(/connection/i);
    const second = makeExample();
    second.nodes[1]!.id = second.nodes[0]!.id;
    expect(validateGraph(second).some((i) => i.message.includes('Duplicate'))).toBe(true);
  });
  it('generates Python for all registered operations', () => {
    for (const op of operations.filter((o) => o.id !== 'source')) {
      let doc = makeExample();
      doc.nodes = doc.nodes.slice(0, op.accepts === 'gray' ? 2 : 1);
      doc.edges = doc.edges.filter((e) => doc.nodes.some((n) => n.id === e.target));
      const node = newNode(op.id);
      doc.nodes.push(node);
      const parent = doc.nodes.at(-2)!;
      doc = connect(doc, parent.id, node.id);
      if (op.inputs === 2) {
        if (op.id === 'apply-mask') {
          const mask = newNode('grayscale');
          doc.nodes.push(mask);
          doc = connect(doc, parent.id, mask.id);
          doc = connect(doc, mask.id, node.id, 1);
        } else doc = connect(doc, parent.id, node.id, 1);
      }
      doc.preview.b = node.id;
      expect(generatePython(doc), op.id).toContain(registry[op.id]!.fn);
    }
  });
});
