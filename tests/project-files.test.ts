import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
import { readFile } from 'node:fs/promises';
import { makeExample, parseDocument } from '../packages/pipeline/src/index';
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('createImageBitmap', async () => ({ width: 512, height: 480, close() {} }));
});
afterEach(() => vi.unstubAllGlobals());
async function fixture() {
  const storage = await import('../apps/web/src/persistence'),
    files = await import('../apps/web/src/projectFiles');
  const doc = makeExample();
  await storage.putAsset(
    doc.sources[0]!.id,
    new Blob([await readFile('apps/web/public/samples/fruits.jpg')], { type: 'image/jpeg' }),
  );
  return { storage, files, doc };
}
it('round-trips graph structure and images with independent project and asset IDs', async () => {
  const { files, doc } = await fixture(),
    backup = await files.createBackup(doc),
    result = await files.readBackup(backup);
  expect(result.document.id).not.toBe(doc.id);
  expect(result.document.sources[0]!.id).not.toBe(doc.sources[0]!.id);
  expect(result.document.nodes[0]!.sourceId).toBe(result.assets[0]!.id);
  expect(result.document.sources[0]!.builtin).toBeUndefined();
  expect(result.document.edges).toEqual(doc.edges);
  expect(() => parseDocument(result.document)).not.toThrow();
  expect(result.assets[0]!.blob.size).toBeGreaterThan(1000);
});
it('rejects a missing source without writing a partial imported experiment', async () => {
  const { files, storage, doc } = await fixture();
  const archive = unzipSync(new Uint8Array(await (await files.createBackup(doc)).arrayBuffer()));
  delete archive[Object.keys(archive).find((k) => k.startsWith('assets/'))!];
  await expect(files.readBackup(new Blob([zipSync(archive)]))).rejects.toThrow(/missing/);
  expect(await storage.listLocal()).toEqual([]);
});
it('imports backups created before the app was renamed', async () => {
  const { files, doc } = await fixture();
  const archive = unzipSync(new Uint8Array(await (await files.createBackup(doc)).arrayBuffer()));
  const manifest = JSON.parse(strFromU8(archive['manifest.json']!));
  expect(manifest.format).toBe('opencv-weblab-project');
  manifest.format = 'roveran-project';
  archive['manifest.json'] = strToU8(JSON.stringify(manifest));
  const imported = await files.readBackup(new Blob([zipSync(archive)]));
  expect(imported.document.edges).toEqual(doc.edges);
  expect(imported.assets).toHaveLength(doc.sources.length);
});
it('rejects unsafe paths, excess expanded sizes and unsupported versions before loading images', async () => {
  const { files, doc } = await fixture();
  const archive = unzipSync(new Uint8Array(await (await files.createBackup(doc)).arrayBuffer()));
  await expect(
    files.readBackup(new Blob([zipSync({ ...archive, '../outside': strToU8('x') })])),
  ).rejects.toThrow(/unsafe/);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']!));
  manifest.version = 99;
  archive['manifest.json'] = strToU8(JSON.stringify(manifest));
  await expect(files.readBackup(new Blob([zipSync(archive)]))).rejects.toThrow(/Unsupported/);
  const huge = {
    'project.json': new Uint8Array(2 * 1024 * 1024 + 1),
    'manifest.json': strToU8('{}'),
  };
  await expect(files.readBackup(new Blob([zipSync(huge)]))).rejects.toThrow(/oversized/);
});
it('allows graph-only export but refuses an incomplete portable backup', async () => {
  const { files, doc } = await fixture();
  doc.sources[0]!.id = 'missing';
  delete doc.sources[0]!.builtin;
  await expect(files.createBackup(doc)).rejects.toThrow(/Reconnect/);
});
it('checks image signatures instead of trusting MIME metadata', async () => {
  const { files } = await fixture();
  await expect(
    files.validateImage(new Blob(['not a picture'], { type: 'image/png' })),
  ).rejects.toThrow(/contents/);
});
it.each([
  'counting',
  'shape-area',
  'isolate-objects',
  'local-contrast',
  'details',
  'rectify',
  'geometry',
  'distances',
] as const)('round-trips the %s object-analysis recipe and original fixture', async (kind) => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 192, height: 192, close() {} }));
  const storage = await import('../apps/web/src/persistence'),
    files = await import('../apps/web/src/projectFiles');
  const doc = makeExample(kind),
    source = doc.sources[0]!;
  await storage.putAsset(
    source.id,
    new Blob([await readFile(`apps/web/public${source.builtin}`)], { type: 'image/png' }),
  );
  const result = await files.readBackup(await files.createBackup(doc));
  expect(result.document.lessonId).toBe(kind);
  expect(result.document.nodes.map((n) => n.operation)).toEqual(doc.nodes.map((n) => n.operation));
  expect(result.document.nodes.map((n) => n.parameters)).toEqual(
    doc.nodes.map((n) => n.parameters),
  );
  expect(() => parseDocument(result.document)).not.toThrow();
  expect(JSON.stringify(result.document)).not.toContain('measurements');
});
