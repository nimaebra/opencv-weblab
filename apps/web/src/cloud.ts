import { createAuthClient } from 'better-auth/react';
import type { PipelineDocument } from '@roveran/pipeline';
import { getAsset, putAsset } from './persistence';
export const authClient = createAuthClient();
export type CloudProject = {
  id: string;
  document: PipelineDocument;
  revision: number;
  syncImages: boolean;
  updatedAt: string;
};
export class ConflictError extends Error {
  constructor() {
    super('A newer cloud revision exists. Save your changes as a copy.');
  }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(30000),
    headers: {
      ...(options.body instanceof Blob ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  if (response.status === 409) throw new ConflictError();
  if (!response.ok) {
    const body = await response.json().catch(() => ({
      message: 'Cloud saving is unavailable. Your work is saved on this device.',
    }));
    throw new Error(body.message ?? 'Cloud request failed.');
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
const uploaded = new Map<string, string>();
async function fingerprint(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export const cloud = {
  config: () => request<{ providers: ('google' | 'github')[]; cloud: boolean }>('/config'),
  session: () =>
    request<{ user: { id: string; name: string; email: string } } | null>('/auth/get-session'),
  list: () => request<CloudProject[]>('/v1/projects'),
  get: (id: string) => request<CloudProject>(`/v1/projects/${encodeURIComponent(id)}`),
  async save(document: PipelineDocument, current: CloudProject | null, syncImages: boolean) {
    const saved = await request<CloudProject>(
      current ? `/v1/projects/${encodeURIComponent(current.id)}` : '/v1/projects',
      {
        method: current ? 'PUT' : 'POST',
        body: JSON.stringify({
          document,
          syncImages,
          ...(current ? { revision: current.revision } : {}),
        }),
      },
    );
    if (!syncImages)
      for (const key of uploaded.keys()) if (key.startsWith(`${saved.id}:`)) uploaded.delete(key);
    return saved;
  },
  async syncImages(project: CloudProject) {
    if (!project.syncImages) return;
    for (const source of project.document.sources) {
      const blob = await getAsset(source.id);
      if (!blob) continue;
      const hash = await fingerprint(blob),
        key = `${project.id}:${source.id}`;
      if (uploaded.get(key) === hash) continue;
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(source.id)}`,
        { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } },
      );
      if (!response.ok)
        throw new Error('The graph was saved, but an image upload failed. Retry cloud save.');
      uploaded.set(key, hash);
    }
  },
  async restoreImages(project: CloudProject) {
    if (!project.syncImages) return;
    for (const source of project.document.sources) {
      const response = await fetch(
        `/api/v1/projects/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(source.id)}`,
      );
      if (response.ok) {
        const blob = await response.blob();
        await putAsset(source.id, blob);
        uploaded.set(`${project.id}:${source.id}`, await fingerprint(blob));
      }
    }
  },
  remove: (id: string) =>
    request<void>(`/v1/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
