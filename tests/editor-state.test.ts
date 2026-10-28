import { beforeEach, it, expect } from 'vitest';
import { useLab } from '../apps/web/src/store';
import { makeExample, parseDocument } from '../packages/pipeline/src/index';
beforeEach(() => {
  useLab.getState().replace(makeExample());
});
it('keeps the document recoverable when the node limit is reached', () => {
  while (useLab.getState().document.nodes.length < 100) useLab.getState().add('invert');
  const before = useLab.getState().document;
  useLab.getState().add('gaussian');
  expect(useLab.getState().document).toBe(before);
  expect(useLab.getState().document.nodes.some((n) => n.id === useLab.getState().selected)).toBe(
    true,
  );
  expect(() => parseDocument(useLab.getState().document)).not.toThrow();
  useLab.getState().undo();
  expect(useLab.getState().document.nodes).toHaveLength(99);
});
it('rejects an oversized source edit atomically', () => {
  const before = useLab.getState().document;
  useLab.getState().edit((doc) => ({
    ...doc,
    sources: Array.from({ length: 21 }, (_, i) => ({
      id: `image-${i}`,
      name: `${i}.png`,
      mime: 'image/png' as const,
      width: 1,
      height: 1,
    })),
  }));
  expect(useLab.getState().document).toBe(before);
  expect(useLab.getState().past).toHaveLength(0);
});
it('ignores a selection arriving after its node was deleted', () => {
  const id = useLab.getState().document.nodes.at(-1)!.id;
  useLab.getState().remove(id);
  useLab.getState().select(id);
  expect(useLab.getState().selected).toBeNull();
  expect(useLab.getState().document.preview.b).toBeNull();
});
