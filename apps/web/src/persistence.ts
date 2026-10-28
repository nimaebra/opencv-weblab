import { openDB } from 'idb';
import { parseDocument, type PipelineDocument } from '@roveran/pipeline';
type StoredAsset = { bytes: ArrayBuffer; type: string };
const transientAssets = new Map<string, Blob>();
const transientProjects = new Map<string, PipelineDocument & { updatedAt: number }>();
const transientSettings = new Map<string, unknown>();
function storageWarning() {
  window.dispatchEvent(
    new CustomEvent('roveran-storage-warning', {
      detail:
        'This browser cannot persist all local data. Keep this tab open and export your project before closing.',
    }),
  );
}
const database = openDB('roveran', 1, {
  upgrade(db) {
    db.createObjectStore('projects', { keyPath: 'id' });
    db.createObjectStore('assets');
    db.createObjectStore('settings');
  },
}).catch(() => null);
export async function saveLocal(document: PipelineDocument) {
  const record = { ...document, updatedAt: Date.now() };
  transientProjects.set(document.id, record);
  transientSettings.set('lastProject', document.id);
  const db = await database;
  if (!db) throw new Error('Device storage is unavailable.');
  const tx = db.transaction(['projects', 'settings'], 'readwrite');
  await tx.objectStore('projects').put(record);
  await tx.objectStore('settings').put(document.id, 'lastProject');
  await tx.done;
}
export async function readLocal(id?: string): Promise<PipelineDocument | null> {
  const db = await database;
  const key =
    id ?? (db ? await db.get('settings', 'lastProject') : transientSettings.get('lastProject'));
  if (!key) return null;
  const value = db ? await db.get('projects', String(key)) : transientProjects.get(String(key));
  if (!value) return null;
  const { updatedAt: _updatedAt, ...doc } = value;
  return parseDocument(doc);
}
export async function listLocal(): Promise<{ id: string; name: string; updatedAt: number }[]> {
  const db = await database;
  const records = db ? await db.getAll('projects') : [...transientProjects.values()];
  return records
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function deleteLocal(id: string) {
  const db = await database;
  transientProjects.delete(id);
  if (db) {
    await db.delete('projects', id);
    if ((await db.get('settings', 'lastProject')) === id)
      await db.delete('settings', 'lastProject');
  }
  if (transientSettings.get('lastProject') === id) transientSettings.delete('lastProject');
}
async function storeAsset(id: string, blob: Blob) {
  try {
    const db = await database;
    if (!db) throw new Error('Device storage is unavailable.');
    const record: StoredAsset = { bytes: await blob.arrayBuffer(), type: blob.type };
    await db.put('assets', record, id);
    transientAssets.delete(id);
  } catch {
    transientAssets.set(id, blob);
    storageWarning();
  }
}
export async function putAsset(id: string, blob: Blob) {
  await storeAsset(id, blob);
  window.dispatchEvent(new Event('roveran-assets'));
}
export async function getAsset(id: string): Promise<Blob | undefined> {
  const transient = transientAssets.get(id);
  if (transient) return transient;
  const db = await database;
  if (!db) return;
  const value: StoredAsset | Blob | undefined = await db.get('assets', id);
  if (!value) return;
  return value instanceof Blob ? value : new Blob([value.bytes], { type: value.type });
}
export async function resolveAssets(document: PipelineDocument) {
  return Promise.all(
    document.sources.map(async (source) => {
      try {
        let blob = await getAsset(source.id);
        if (!blob && source.builtin) {
          const response = await fetch(source.builtin);
          if (response.ok) {
            blob = await response.blob();
            await storeAsset(source.id, blob);
          }
        }
        return blob ? { id: source.id, blob } : null;
      } catch {
        return null;
      }
    }),
  ).then((items) => items.filter((v): v is { id: string; blob: Blob } => v !== null));
}
export function download(name: string, data: Blob | string, type = 'text/plain') {
  const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function getCloudBinding(id: string) {
  const db = await database;
  return db ? db.get('settings', `cloud:${id}`) : transientSettings.get(`cloud:${id}`);
}
export async function putCloudBinding(id: string, value: unknown) {
  transientSettings.set(`cloud:${id}`, value);
  const db = await database;
  if (db)
    try {
      await db.put('settings', value, `cloud:${id}`);
    } catch {
      storageWarning();
    }
}
