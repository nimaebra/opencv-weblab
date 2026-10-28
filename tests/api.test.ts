import { afterEach, describe, it, expect } from 'vitest';
import { createApp } from '../apps/api/src/app';
import type { ProjectRepository, Project, Asset } from '../apps/api/src/repository';
import { makeExample } from '../packages/pipeline/src/index';
import type { PipelineDocument } from '../packages/pipeline/src/index';
import { readFile } from 'node:fs/promises';
class MemoryRepository implements ProjectRepository {
  projects = new Map<string, Project>();
  assets = new Map<string, Asset>();
  async list(ownerId: string) {
    return [...this.projects.values()].filter((p) => p.ownerId === ownerId);
  }
  async get(id: string, ownerId: string) {
    const p = this.projects.get(id);
    return p?.ownerId === ownerId ? p : undefined;
  }
  async create(document: PipelineDocument, ownerId: string, syncImages: boolean) {
    if (this.projects.has(document.id)) return;
    const p = {
      id: document.id,
      ownerId,
      document,
      revision: 1,
      syncImages,
      updatedAt: new Date(),
    };
    this.projects.set(p.id, p);
    return p;
  }
  async update(
    id: string,
    ownerId: string,
    revision: number,
    document: PipelineDocument,
    syncImages: boolean,
  ) {
    const p = await this.get(id, ownerId);
    if (!p || p.revision !== revision) return;
    const next = { ...p, document, syncImages, revision: revision + 1 };
    this.projects.set(id, next);
    return next;
  }
  async delete(id: string, ownerId: string) {
    if (!(await this.get(id, ownerId))) return false;
    this.projects.delete(id);
    await this.removeAssets(id);
    return true;
  }
  async getAsset(projectId: string, sourceId: string) {
    return this.assets.get(`${projectId}:${sourceId}`);
  }
  async listAssets(projectId: string) {
    return [...this.assets.values()].filter((a) => a.projectId === projectId);
  }
  async saveAsset(asset: Asset, ownerId: string) {
    const p = await this.get(asset.projectId, ownerId);
    if (!p?.syncImages) return false;
    this.assets.set(`${asset.projectId}:${asset.sourceId}`, asset);
    return true;
  }
  async removeAssets(projectId: string) {
    for (const [key, a] of this.assets) if (a.projectId === projectId) this.assets.delete(key);
  }
}
const apps: Awaited<ReturnType<typeof createApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
async function setup() {
  const repository = new MemoryRepository();
  const objects = new Map<string, Buffer>();
  const storage = {
    put: async (key: string, bytes: Buffer) => {
      objects.set(key, bytes);
    },
    get: async (key: string) => objects.get(key)!,
    delete: async (key: string) => {
      objects.delete(key);
    },
  };
  const auth = {
    session: async (headers: Record<string, unknown>) =>
      headers['x-test-user'] ? { user: { id: String(headers['x-test-user']) } } : null,
    handler: async () => new Response('{}'),
  };
  const app = await createApp({ repository, storage, auth });
  apps.push(app);
  return { app, repository, objects };
}
const headers = { 'x-test-user': 'alice' };
describe('project API', () => {
  it('supports guest startup without a database or auth secrets', async () => {
    const app = await createApp();
    apps.push(app);
    expect((await app.inject('/api/health')).json().status).toBe('ok');
    expect((await app.inject('/api/auth/get-session')).json()).toBe(null);
    expect((await app.inject('/api/v1/projects')).statusCode).toBe(503);
  });
  it('requires authentication and isolates owner data', async () => {
    const { app } = await setup();
    expect((await app.inject('/api/v1/projects')).statusCode).toBe(401);
    const document = makeExample();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers,
      payload: { document, syncImages: false },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().ownerId).toBeUndefined();
    expect((await app.inject({ url: '/api/v1/projects', headers })).json()).toHaveLength(1);
    for (const method of ['GET', 'DELETE'] as const)
      expect(
        (
          await app.inject({
            method,
            url: `/api/v1/projects/${document.id}`,
            headers: { 'x-test-user': 'bob' },
          })
        ).statusCode,
      ).toBe(404);
  });
  it('uses compare-and-swap revisions and retains the winning document', async () => {
    const { app } = await setup();
    const document = makeExample();
    await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers,
      payload: { document, syncImages: false },
    });
    const payload = {
      document: { ...document, name: 'First writer' },
      syncImages: false,
      revision: 1,
    };
    const first = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${document.id}`,
      headers,
      payload,
    });
    expect(first.json().revision).toBe(2);
    const second = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${document.id}`,
      headers,
      payload: { ...payload, document: { ...document, name: 'Stale writer' } },
    });
    expect(second.statusCode).toBe(409);
    expect(
      (await app.inject({ url: `/api/v1/projects/${document.id}`, headers })).json().document.name,
    ).toBe('First writer');
  });
  it('rejects untrusted origins and invalid documents', async () => {
    const { app } = await setup();
    const document = makeExample();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/projects',
          headers: { ...headers, origin: 'https://elsewhere.invalid' },
          payload: { document, syncImages: false },
        })
      ).statusCode,
    ).toBe(403);
    document.nodes[0]!.operation = 'unknown';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/projects',
          headers,
          payload: { document, syncImages: false },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('requires image opt-in, validates bytes, authorizes downloads, and removes cloud copies when disabled', async () => {
    const { app, objects } = await setup();
    const document = makeExample();
    await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers,
      payload: { document, syncImages: false },
    });
    const url = `/api/v1/projects/${document.id}/assets/${document.sources[0]!.id}`;
    const bytes = await readFile('apps/web/public/samples/fruits.jpg');
    const upload = () =>
      app.inject({
        method: 'PUT',
        url,
        headers: { ...headers, 'content-type': 'image/jpeg' },
        payload: bytes,
      });
    expect((await upload()).statusCode).toBe(403);
    await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${document.id}`,
      headers,
      payload: { document, syncImages: true, revision: 1 },
    });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          headers: { ...headers, 'content-type': 'image/jpeg' },
          payload: Buffer.from('not an image'),
        })
      ).statusCode,
    ).toBe(400);
    expect((await upload()).statusCode).toBe(201);
    expect(objects.size).toBe(1);
    expect((await app.inject({ url, headers: { 'x-test-user': 'bob' } })).statusCode).toBe(404);
    const downloaded = await app.inject({ url, headers });
    expect(downloaded.rawPayload).toEqual(bytes);
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${document.id}`,
      headers,
      payload: { document, syncImages: false, revision: 2 },
    });
    expect(objects.size).toBe(0);
    expect((await app.inject({ url, headers })).statusCode).toBe(404);
  });
  it('deletes owned projects', async () => {
    const { app } = await setup();
    const document = makeExample();
    await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers,
      payload: { document, syncImages: false },
    });
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/v1/projects/${document.id}`, headers }))
        .statusCode,
    ).toBe(204);
    expect((await app.inject({ url: `/api/v1/projects/${document.id}`, headers })).statusCode).toBe(
      404,
    );
  });
});
