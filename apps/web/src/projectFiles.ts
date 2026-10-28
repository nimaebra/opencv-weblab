import { zip, unzip, strToU8, strFromU8, type Unzipped } from 'fflate';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_PIXELS,
  parseDocument,
  type PipelineDocument,
  type SourceReference,
} from '@roveran/pipeline';
import { resolveAssets } from './persistence';
const MAX_JSON = 2 * 1024 * 1024;
const MAX_TOTAL = 20 * MAX_IMAGE_BYTES + MAX_JSON + 65536;
const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
type Manifest = { format: 'roveran-project'; version: 1; assets: { id: string; path: string }[] };
export async function validateImage(blob: Blob): Promise<{ width: number; height: number }> {
  if (!(blob.type in extension) || blob.size > MAX_IMAGE_BYTES || !blob.size)
    throw new Error('Choose a PNG, JPEG or still WebP image no larger than 20 MiB.');
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const png = head[0] === 137 && strFromU8(head.slice(1, 4)) === 'PNG';
  const jpg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  const webp = strFromU8(head.slice(0, 4)) === 'RIFF' && strFromU8(head.slice(8, 12)) === 'WEBP';
  if (!(blob.type === 'image/png' ? png : blob.type === 'image/jpeg' ? jpg : webp))
    throw new Error('Image contents do not match its file type.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const data = new DataView(bytes.buffer);
  for (let offset = png ? 8 : 12; (png || webp) && offset + 8 <= bytes.length;) {
    const length = data.getUint32(offset, webp);
    const name = strFromU8(bytes.slice(offset + (png ? 4 : 0), offset + (png ? 8 : 4)));
    if (
      name === 'acTL' ||
      name === 'ANIM' ||
      name === 'ANMF' ||
      (webp && name === 'VP8X' && bytes[offset + 8]! & 2)
    )
      throw new Error('Use a still image; animated PNG and WebP files are not supported.');
    const chunkLength = png ? length : data.getUint32(offset + 4, true);
    if (chunkLength > bytes.length) break;
    offset += png ? chunkLength + 12 : chunkLength + 8 + (chunkLength % 2);
  }
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  if (width * height > MAX_IMAGE_PIXELS || width > 16384 || height > 16384)
    throw new Error('Images must be at most 16 megapixels and 16,384 pixels per edge.');
  return { width, height };
}
export async function createBackup(document: PipelineDocument): Promise<Blob> {
  const assets = await resolveAssets(document);
  if (assets.length !== document.sources.length)
    throw new Error(
      'Reconnect missing source images before making a portable backup. You can still export graph-only JSON.',
    );
  const files: Unzipped = { 'project.json': strToU8(JSON.stringify(document)) };
  const manifest: Manifest = { format: 'roveran-project', version: 1, assets: [] };
  const sourcesById = new Map(document.sources.map((source) => [source.id, source]));
  await Promise.all(
    assets.map(async (asset) => {
      const source = sourcesById.get(asset.id)!;
      const path = `assets/${source.id}.${extension[source.mime]}`;
      manifest.assets.push({ id: source.id, path });
      files[path] = new Uint8Array(await asset.blob.arrayBuffer());
    }),
  );
  manifest.assets.sort((a, b) => a.id.localeCompare(b.id));
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  // Original images are already compressed; STORE avoids expensive recompression.
  const bytes = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (error, data) => (error ? reject(error) : resolve(data))),
  );
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
export function independentDocument(input: PipelineDocument): PipelineDocument {
  return { ...structuredClone(input), id: crypto.randomUUID() };
}
export async function readBackup(
  file: Blob,
): Promise<{ document: PipelineDocument; assets: { id: string; blob: Blob }[] }> {
  if (file.size > MAX_TOTAL) throw new Error('Backup exceeds the project size limit.');
  let total = 0,
    count = 0;
  const names = new Set<string>();
  let invalid = false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Unzipped>((resolve, reject) =>
    unzip(
      bytes,
      {
        filter(entry) {
          count++;
          total += entry.originalSize;
          const allowed =
            entry.name === 'manifest.json' ||
            entry.name === 'project.json' ||
            /^assets\/[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(entry.name);
          if (
            !allowed ||
            names.has(entry.name) ||
            count > 22 ||
            total > MAX_TOTAL ||
            entry.originalSize > (entry.name.startsWith('assets/') ? MAX_IMAGE_BYTES : MAX_JSON)
          ) {
            invalid = true;
            return false;
          }
          names.add(entry.name);
          return true;
        },
      },
      (error, data) =>
        error ? reject(new Error('This is not a readable Roveran backup.')) : resolve(data),
    ),
  );
  if (invalid || !files['project.json'] || !files['manifest.json'])
    throw new Error('Backup has duplicate, unsafe, oversized or unsupported entries.');
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
  const original = parseDocument(JSON.parse(strFromU8(files['project.json'])));
  if (
    manifest.format !== 'roveran-project' ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.assets) ||
    manifest.assets.length !== original.sources.length
  )
    throw new Error('Unsupported or incomplete backup manifest.');
  const assets: { id: string; blob: Blob }[] = [];
  const sources: SourceReference[] = [];
  const remap = new Map<string, string>();
  const paths = new Set<string>();
  const entriesById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  if (entriesById.size !== manifest.assets.length)
    throw new Error('Backup has duplicate source entries.');
  for (const source of original.sources) {
    const entry = entriesById.get(source.id);
    if (
      !entry ||
      entry.path !== `assets/${source.id}.${extension[source.mime]}` ||
      !files[entry.path] ||
      paths.has(entry.path)
    )
      throw new Error('Backup is missing an original image.');
    paths.add(entry.path);
    const blob = new Blob([files[entry.path]! as Uint8Array<ArrayBuffer>], { type: source.mime });
    const size = await validateImage(blob);
    if (size.width !== source.width || size.height !== source.height)
      throw new Error('Backup image dimensions do not match the project.');
    const id = crypto.randomUUID();
    remap.set(source.id, id);
    const { builtin: _builtin, ...reference } = source;
    sources.push({ ...reference, id });
    assets.push({ id, blob });
  }
  if (Object.keys(files).length !== paths.size + 2)
    throw new Error('Backup contains unreferenced files.');
  const document = independentDocument(original);
  document.sources = sources;
  document.nodes = document.nodes.map((n) =>
    n.sourceId ? { ...n, sourceId: remap.get(n.sourceId) } : n,
  );
  return { document: parseDocument(document), assets };
}
