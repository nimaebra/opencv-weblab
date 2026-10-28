import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { fromNodeHeaders } from 'better-auth/node';
import { randomUUID, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as schema from '../apps/api/src/schema';
import { PgRepository } from '../apps/api/src/repository';
import { S3Storage } from '../apps/api/src/storage';
import { createApp } from '../apps/api/src/app';
import { makeExample } from '../packages/pipeline/src/index';
const suite = process.env.ROVERAN_INTEGRATION ? describe : describe.skip;
suite('PostgreSQL, Better Auth sessions, and S3 integration', () => {
  const sql = postgres(
    process.env.ROVERAN_TEST_DATABASE_URL ?? 'postgres://roveran:roveran@127.0.0.1:54329/roveran',
    { max: 4 },
  );
  const db = drizzle(sql, { schema });
  const secret = 'roveran-integration-only-secret-6beaeeb8777a49ce';
  const owner = randomUUID(),
    other = randomUUID();
  let cookie = '';
  let app: Awaited<ReturnType<typeof createApp>>;
  const storage = new S3Storage('roveran-integration', {
    endpoint: process.env.ROVERAN_TEST_S3_ENDPOINT ?? 'http://127.0.0.1:9000',
    region: 'us-east-1',
    accessKeyId: 'roveran-local',
    secretAccessKey: 'roveran-local-secret',
  });
  const repository = new PgRepository(db);
  beforeAll(async () => {
    await sql.unsafe(await readFile('apps/api/migrations/0001_initial.sql', 'utf8'));
    await storage.ensureBucket();
    await db.insert(schema.user).values([
      { id: owner, name: 'Integration Alice', email: `${owner}@example.invalid` },
      { id: other, name: 'Integration Bob', email: `${other}@example.invalid` },
    ]);
    const auth = betterAuth({
      baseURL: 'http://localhost:5173',
      secret,
      database: drizzleAdapter(db, { provider: 'pg', schema }),
      socialProviders: {
        github: { clientId: 'integration-client', clientSecret: 'integration-secret' },
      },
    });
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(owner);
    const value = encodeURIComponent(
      `${session.token}.${createHmac('sha256', secret).update(session.token).digest('base64')}`,
    );
    cookie = `${context.authCookies.sessionToken.name}=${value}`;
    app = await createApp({
      repository,
      storage,
      auth: {
        session: (headers) => auth.api.getSession({ headers: fromNodeHeaders(headers) }),
        handler: (request) => auth.handler(request),
      },
      providers: ['github'],
    });
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
    for (const project of await repository.list(owner)) {
      for (const asset of await repository.listAssets(project.id)) await storage.delete(asset.key);
      await repository.delete(project.id, owner);
    }
    await db.delete(schema.user).where(inArray(schema.user.id, [owner, other]));
    await sql.end();
  });
  it('accepts a real signed session and rejects a tampered session', async () => {
    const response = await app.inject({ url: '/api/auth/get-session', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe(owner);
    expect(
      (await app.inject({ url: '/api/v1/projects', headers: { cookie: cookie + 'tampered' } }))
        .statusCode,
    ).toBe(401);
  });
  it('persists graphs and atomically rejects a concurrent stale revision', async () => {
    const document = makeExample();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/projects',
          headers: { cookie },
          payload: { document, syncImages: false },
        })
      ).statusCode,
    ).toBe(201);
    const results = await Promise.all(
      ['Writer one', 'Writer two'].map((name) =>
        app.inject({
          method: 'PUT',
          url: `/api/v1/projects/${document.id}`,
          headers: { cookie },
          payload: { document: { ...document, name }, syncImages: false, revision: 1 },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect((await repository.get(document.id, owner))?.revision).toBe(2);
    expect(await repository.get(document.id, other)).toBeUndefined();
  });
  it('stores originals privately only after opt-in and deletes object copies on opt-out', async () => {
    const document = makeExample();
    await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { cookie },
      payload: { document, syncImages: true },
    });
    const url = `/api/v1/projects/${document.id}/assets/${document.sources[0]!.id}`;
    const bytes = await readFile('apps/web/public/samples/fruits.jpg');
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          headers: { cookie, 'content-type': 'image/jpeg' },
          payload: bytes,
        })
      ).statusCode,
    ).toBe(201);
    const asset = await repository.getAsset(document.id, document.sources[0]!.id);
    expect(asset).toBeDefined();
    expect(Buffer.from(await storage.get(asset!.key))).toEqual(bytes);
    expect((await app.inject({ url, headers: { cookie } })).rawPayload).toEqual(bytes);
    expect((await app.inject(url)).statusCode).toBe(401);
    await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${document.id}`,
      headers: { cookie },
      payload: { document, revision: 1, syncImages: false },
    });
    expect(await repository.listAssets(document.id)).toEqual([]);
    await expect(storage.get(asset!.key)).rejects.toThrow();
  });
  it('does not allow replacement of another owner’s project', async () => {
    const document = makeExample();
    await repository.create(document, other, false);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${document.id}`,
      headers: { cookie },
      payload: { document, revision: 1, syncImages: false },
    });
    expect(response.statusCode).toBe(404);
    await db.delete(schema.projects).where(eq(schema.projects.id, document.id));
  });
});
