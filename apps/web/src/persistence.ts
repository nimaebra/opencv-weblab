import { openDB } from 'idb';
import { parseDocument, type PipelineDocument } from '@roveran/pipeline';
import { assetUrl } from './paths';
type StoredAsset = { bytes: ArrayBuffer; type: string };
type StoredProject = PipelineDocument & { updatedAt: number };
export type StorageState = 'available' | 'temporary' | 'failed';
const transientAssets = new Map<string, Blob>();
const transientProjects = new Map<string, StoredProject>();
const pendingAssets = new Set<string>();
const deletedProjects = new Set<string>();
let lastProject: string | undefined;
let storageState: StorageState = 'available';
function report(state: StorageState) {
  storageState = state;
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('roveran-storage', { detail: state }));
}
export function getStorageState() {
  return storageState;
}
const database = Promise.resolve()
  .then(() =>
    openDB('roveran', 2, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore('projects', { keyPath: 'id' });
          db.createObjectStore('assets');
          db.createObjectStore('settings');
        }
        if (oldVersion < 2) {
          let cursor = await tx.objectStore('settings').openCursor();
          while (cursor) {
            if (String(cursor.key).startsWith('cloud:')) await cursor.delete();
            cursor = await cursor.continue();
          }
        }
      },
      blocked() {
        report('temporary');
      },
      blocking() {
        void database.then((db) => db?.close());
        report('temporary');
      },
    }),
  )
  .catch(() => {
    report('temporary');
    return null;
  });
let writes: Promise<unknown> = Promise.resolve();
function serialize<T>(write: () => Promise<T>): Promise<T> {
  const next = writes.then(write, write);
  writes = next.catch(() => {});
  return next;
}
function withoutMetadata(value: StoredProject): PipelineDocument {
  const { updatedAt: _updatedAt, ...document } = value;
  return parseDocument(document);
}
export async function saveLocal(
  document: PipelineDocument,
  assets: { id: string; blob: Blob }[] = [],
) {
  if (deletedProjects.has(document.id)) throw new Error('This experiment was deleted.');
  const record = { ...structuredClone(document), updatedAt: Date.now() };
  transientProjects.set(document.id, record);
  lastProject = document.id;
  for (const asset of assets) {
    transientAssets.set(asset.id, asset.blob);
    pendingAssets.add(asset.id);
  }
  return serialize(async () => {
    const db = await database;
    if (!db)
      throw new Error(
        'Storage is unavailable. This experiment is temporary; download a portable backup.',
      );
    let abort: (() => void) | undefined;
    try {
      const originals = await Promise.all(
        document.sources.map(async (s) => {
          const blob = transientAssets.get(s.id);
          return blob
            ? { id: s.id, record: { bytes: await blob.arrayBuffer(), type: blob.type } }
            : null;
        }),
      );
      const tx = db.transaction(['projects', 'assets', 'settings'], 'readwrite');
      abort = () => {
        void tx.done.catch(() => {});
        try {
          tx.abort();
        } catch {
          /* Already completed. */
        }
      };
      await Promise.all(
        originals.flatMap((item) =>
          item ? [tx.objectStore('assets').put(item.record, item.id)] : [],
        ),
      );
      await tx.objectStore('projects').put(record);
      await tx.objectStore('settings').put(document.id, 'lastProject');
      await tx.done;
      abort = undefined;
      for (const item of originals) if (item) transientAssets.delete(item.id);
      for (const source of document.sources) pendingAssets.delete(source.id);
      report('available');
    } catch (error) {
      abort?.();
      report('failed');
      throw new Error(
        `Could not save this experiment on your device. Download a portable backup. ${error instanceof Error ? error.message : ''}`,
      );
    }
  });
}
export async function readLocal(id?: string): Promise<PipelineDocument | null> {
  await writes;
  const db = await database;
  const key = id ?? lastProject ?? (db ? await db.get('settings', 'lastProject') : undefined);
  if (!key) return null;
  const value =
    transientProjects.get(String(key)) ?? (db ? await db.get('projects', String(key)) : undefined);
  return value ? withoutMetadata(value) : null;
}
export async function listLocal(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  await writes;
  const db = await database;
  const records = new Map<string, StoredProject>(
    (db ? await db.getAll('projects') : []).map((p) => [p.id, p]),
  );
  for (const [id, record] of transientProjects) records.set(id, record);
  return [...records.values()]
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function deleteLocal(id: string) {
  deletedProjects.add(id);
  return serialize(async () => {
    try {
      const db = await database;
      if (db) {
        const tx = db.transaction(['projects', 'settings'], 'readwrite');
        await tx.objectStore('projects').delete(id);
        if ((await tx.objectStore('settings').get('lastProject')) === id)
          await tx.objectStore('settings').delete('lastProject');
        await tx.done;
      }
      transientProjects.delete(id);
      if (lastProject === id) lastProject = undefined;
    } catch (error) {
      deletedProjects.delete(id);
      throw error;
    }
  });
}
export async function collectUnusedAssets(history: PipelineDocument[]) {
  return serialize(async () => {
    const db = await database;
    const stored: StoredProject[] = db ? await db.getAll('projects') : [];
    const refs = new Set(
      [...stored, ...transientProjects.values(), ...history].flatMap((d) =>
        d.sources.map((s) => s.id),
      ),
    );
    for (const id of pendingAssets) refs.add(id);
    if (db) {
      const tx = db.transaction('assets', 'readwrite');
      const keys = await tx.store.getAllKeys();
      await Promise.all(
        keys
          .filter((key) => !refs.has(String(key)) && !pendingAssets.has(String(key)))
          .map((key) => tx.store.delete(key)),
      );
      await tx.done;
    }
    for (const id of transientAssets.keys())
      if (!refs.has(id) && !pendingAssets.has(id)) transientAssets.delete(id);
  });
}
export async function putAsset(id: string, blob: Blob) {
  // An identifier always denotes immutable bytes. Reconnection gets a new identifier.
  if (await getAsset(id)) return;
  transientAssets.set(id, blob);
  pendingAssets.add(id);
  try {
    const record: StoredAsset = { bytes: await blob.arrayBuffer(), type: blob.type };
    await serialize(async () => {
      const db = await database;
      if (!db) throw new Error('Storage unavailable');
      if (!(await db.getKey('assets', id))) await db.put('assets', record, id);
      transientAssets.delete(id);
    });
  } catch {
    report(storageState === 'temporary' ? 'temporary' : 'failed');
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('roveran-assets'));
}
export async function getAsset(id: string): Promise<Blob | undefined> {
  const transient = transientAssets.get(id);
  if (transient) return transient;
  const db = await database;
  const value: StoredAsset | Blob | undefined = db ? await db.get('assets', id) : undefined;
  return !value
    ? undefined
    : value instanceof Blob
      ? value
      : new Blob([value.bytes], { type: value.type });
}
export async function resolveAssets(document: PipelineDocument) {
  const items = await Promise.all(
    document.sources.map(async (source) => {
      let blob = await getAsset(source.id);
      if (!blob && source.builtin) {
        const response = await fetch(assetUrl(source.builtin));
        if (response.ok) {
          blob = await response.blob();
          // No asset event: the caller is already resolving the new generation.
          transientAssets.set(source.id, blob);
        }
      }
      return blob ? { id: source.id, blob } : null;
    }),
  );
  return items.filter((item): item is { id: string; blob: Blob } => item !== null);
}
export function download(name: string, data: Blob | string, type = 'text/plain') {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
