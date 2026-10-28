import { beforeEach, it, expect } from 'vitest';
import {
  makeExample,
  newNode,
  connect,
  insertOperation,
  parseDocument,
  duplicateNodes,
} from '../packages/pipeline/src/index';
import { useLab } from '../apps/web/src/store';
beforeEach(() => {
  useLab.getState().replace(makeExample());
  useLab.getState().setFollowSelection(true);
});
it('inserts a tool on exactly one edge and undoes it as one operation', () => {
  const before = useLab.getState().document,
    edge = before.edges[1]!;
  useLab.getState().insert('invert', edge.id);
  const next = useLab.getState().document;
  expect(next.nodes).toHaveLength(5);
  expect(next.edges).toHaveLength(4);
  expect(next.edges.some((e) => e.id === edge.id)).toBe(false);
  expect(next.edges.filter((e) => e.target === edge.target)).toHaveLength(1);
  expect(() => parseDocument(next)).not.toThrow();
  expect(useLab.getState().past).toHaveLength(1);
  useLab.getState().undo();
  expect(useLab.getState().document).toEqual(before);
});
it('leaves every node and edge unchanged when insertion is incompatible', () => {
  const before = useLab.getState().document;
  expect(() => insertOperation(before, 'threshold', before.edges[0]!.id)).toThrow(/grayscale/);
  useLab.getState().insert('blend', before.edges[0]!.id);
  expect(useLab.getState().document).toBe(before);
  expect(useLab.getState().past).toHaveLength(0);
});
it('drops an unconnected tool and appends a clicked tool to the selection', () => {
  const selected = useLab.getState().document.nodes[1]!.id;
  useLab.getState().select(selected);
  useLab.getState().add('invert', { x: 700, y: 300 });
  const dropped = useLab.getState().selected!;
  expect(useLab.getState().document.edges.some((e) => e.target === dropped)).toBe(false);
  useLab.getState().select(selected);
  useLab.getState().add('invert');
  expect(useLab.getState().document.edges.at(-1)?.source).toBe(selected);
});
it('duplicates a selection with internal edges remapped and deletes atomically', () => {
  const before = useLab.getState().document,
    ids = before.nodes.slice(1, 3).map((n) => n.id),
    result = duplicateNodes(before, ids);
  const copied = result.document.edges.filter((e) => result.ids.includes(e.target));
  expect(copied).toHaveLength(2);
  expect(copied[1]!.source).toBe(result.ids[0]);
  useLab.getState().setFollowSelection(false);
  useLab.getState().setSelection(ids);
  useLab.getState().removeSelection();
  expect(useLab.getState().document.nodes).toHaveLength(2);
  expect(useLab.getState().past).toHaveLength(1);
  useLab.getState().undo();
  expect(useLab.getState().document).toEqual(before);
});
it('keeps an explicit B pin stable while selecting and honors follow mode', () => {
  const before = useLab.getState().document,
    first = before.nodes[0]!.id;
  useLab.getState().setFollowSelection(false);
  useLab.getState().select(first);
  expect(useLab.getState().document.preview.b).toBe(before.preview.b);
  useLab.getState().setFollowSelection(true);
  expect(useLab.getState().document.preview.b).toBe(first);
});
it('rejects mismatched merge dimensions before committing a replacement', () => {
  let doc = makeExample();
  const resize = newNode('resize'),
    blend = newNode('blend');
  doc.nodes.push(resize, blend);
  doc = connect(doc, doc.nodes[0]!.id, resize.id);
  doc = connect(doc, doc.nodes[0]!.id, blend.id);
  expect(() => connect(doc, resize.id, blend.id, 1)).toThrow(/identical/);
});
