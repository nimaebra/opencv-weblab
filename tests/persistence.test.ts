import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { makeExample, emptyDocument } from '../packages/pipeline/src/index';
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('keeps each synthetic fixture distinct when experiments are switched in one session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(url, { headers: { 'content-type': 'image/png' } })),
  );
  const { resolveAssets } = await import('../apps/web/src/persistence');
  const ids = new Set<string>();
  for (const kind of [
    'noise',
    'illumination',
    'gaps',
    'low-contrast',
    'counting',
    'shape-area',
    'isolate-objects',
  ] as const) {
    const doc = makeExample(kind);
    const assets = await resolveAssets(doc);
    expect(await assets[0]!.blob.text()).toContain(doc.sources[0]!.builtin);
    ids.add(doc.sources[0]!.id);
  }
  expect(ids.size).toBe(7);
});
it('upgrades a v1 database without losing its project, original or last-opened setting', async () => {
  const doc = makeExample(),
    db = await openDB('roveran', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('assets');
        db.createObjectStore('settings');
      },
    });
  await db.put('projects', { ...doc, updatedAt: 123 });
  await db.put(
    'assets',
    { bytes: new Uint8Array([1, 2, 3]).buffer, type: 'image/png' },
    'original',
  );
  await db.put('settings', doc.id, 'lastProject');
  await db.put('settings', { revision: 2 }, `cloud:${doc.id}`);
  db.close();
  const storage = await import('../apps/web/src/persistence');
  expect(await storage.readLocal()).toEqual(doc);
  expect(await (await storage.getAsset('original'))!.arrayBuffer()).toEqual(
    new Uint8Array([1, 2, 3]).buffer,
  );
  const upgraded = await openDB('roveran', 2);
  expect(await upgraded.get('settings', `cloud:${doc.id}`)).toBeUndefined();
  upgraded.close();
});
it('keeps edits and originals in a temporary session when IndexedDB is denied', async () => {
  vi.stubGlobal('indexedDB', {
    open() {
      throw new DOMException('Blocked', 'SecurityError');
    },
  });
  const storage = await import('../apps/web/src/persistence'),
    doc = makeExample(),
    blob = new Blob(['original'], { type: 'image/png' });
  await storage.putAsset(doc.sources[0]!.id, blob);
  await expect(storage.saveLocal(doc)).rejects.toThrow(/temporary/);
  expect(storage.getStorageState()).toBe('temporary');
  expect(await storage.readLocal()).toEqual(doc);
  expect(await storage.getAsset(doc.sources[0]!.id)).toBe(blob);
});
it('aborts all import writes on quota failure while retaining a recoverable session', async () => {
  const storage = await import('../apps/web/src/persistence'),
    doc = makeExample(),
    original = IDBObjectStore.prototype.put;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    ...args: Parameters<typeof original>
  ) {
    if (this.name === 'projects') throw new DOMException('Full', 'QuotaExceededError');
    return original.apply(this, args);
  });
  await expect(
    storage.saveLocal(doc, [
      { id: doc.sources[0]!.id, blob: new Blob(['bytes'], { type: 'image/png' }) },
    ]),
  ).rejects.toThrow(/backup/);
  expect(storage.getStorageState()).toBe('failed');
  expect(await storage.readLocal()).toEqual(doc);
  const db = await openDB('roveran', 2);
  expect(await db.getAll('projects')).toEqual([]);
  expect(await db.getAll('assets')).toEqual([]);
  db.close();
});
it('never overwrites shared asset bytes and collects only unreferenced assets outside undo history', async () => {
  const storage = await import('../apps/web/src/persistence'),
    doc = makeExample(),
    id = doc.sources[0]!.id;
  await storage.putAsset(id, new Blob(['first'], { type: 'image/png' }));
  await storage.putAsset(id, new Blob(['second'], { type: 'image/png' }));
  expect(await (await storage.getAsset(id))!.text()).toBe('first');
  await storage.saveLocal(doc);
  const copy = { ...doc, id: crypto.randomUUID() };
  await storage.saveLocal(copy);
  await storage.deleteLocal(doc.id);
  await storage.collectUnusedAssets([]);
  expect(await storage.getAsset(id)).toBeDefined();
  await storage.deleteLocal(copy.id);
  await storage.saveLocal(emptyDocument());
  await storage.collectUnusedAssets([doc]);
  expect(await storage.getAsset(id)).toBeDefined();
  await storage.collectUnusedAssets([]);
  expect(await storage.getAsset(id)).toBeUndefined();
});
it('serializes rapid saves and returns the latest experiment and edits', async () => {
  const storage = await import('../apps/web/src/persistence'),
    a = makeExample(),
    b = makeExample('color-mask');
  await Promise.all([
    storage.saveLocal(a),
    storage.saveLocal(b),
    storage.saveLocal({ ...a, name: 'Latest edit' }),
  ]);
  expect((await storage.readLocal())?.name).toBe('Latest edit');
  expect((await storage.listLocal()).length).toBe(2);
});

it('does not resurrect a deleted project when an old autosave arrives late', async () => {
  const storage = await import('../apps/web/src/persistence'),
    doc = makeExample();
  await storage.saveLocal(doc);
  const deleted = storage.deleteLocal(doc.id);
  await expect(storage.saveLocal(doc)).rejects.toThrow(/deleted/);
  await deleted;
  expect(await storage.listLocal()).toEqual([]);
});
it('stores learning progress per project and deletes it without removing another experiment’s notes', async () => {
  const storage = await import('../apps/web/src/persistence');
  const a = makeExample('noise'),
    b = makeExample('noise');
  await storage.saveLocal(a);
  await storage.saveLocal(b);
  const notes = {
    version: 1,
    prediction: 'Median rejects isolated noise.',
    reflection: '',
    completed: [0],
  };
  await storage.writeLearningProgress(`${a.id}:noise`, notes);
  await storage.writeLearningProgress(`${b.id}:noise`, notes);
  expect(await storage.readLearningProgress(`${a.id}:noise`)).toEqual(notes);
  await storage.deleteLocal(a.id);
  expect(await storage.readLearningProgress(`${a.id}:noise`)).toBeUndefined();
  expect(await storage.readLearningProgress(`${b.id}:noise`)).toEqual(notes);
  await expect(storage.writeLearningProgress(`${a.id}:noise`, notes)).rejects.toThrow(/deleted/);
});
