import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { parseDocument, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from '@roveran/pipeline';
import type { ProjectRepository, Project } from './repository';
import type { ObjectStorage } from './storage';
export type AuthService = {
  session: (
    headers: Record<string, string | string[] | undefined>,
  ) => Promise<{ user: { id: string } } | null>;
  handler: (request: Request) => Promise<Response>;
};
type Options = {
  repository?: ProjectRepository;
  storage?: ObjectStorage;
  auth?: AuthService;
  origin?: string;
  providers?: string[];
  logger?: boolean;
};
const params = z.object({ id: z.string().min(1).max(100) });
const assetParams = params.extend({ sourceId: z.string().min(1).max(100) });
const writeSchema = z
  .object({
    document: z.unknown(),
    syncImages: z.boolean(),
    revision: z.number().int().positive().optional(),
  })
  .strict();
function publicProject(p: Project) {
  const { ownerId: _ownerId, ...result } = p;
  return result;
}
export async function createApp(options: Options = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: MAX_IMAGE_BYTES,
    trustProxy: false,
  });
  const { repository: repo, storage, auth } = options;
  const origin = options.origin ?? 'http://localhost:5173';
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  app.addContentTypeParser(
    ['image/png', 'image/jpeg', 'image/webp'],
    { parseAs: 'buffer', bodyLimit: MAX_IMAGE_BYTES },
    (_request, body, done) => done(null, body),
  );
  app.addHook('onRequest', async (request, reply) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      request.headers.origin &&
      request.headers.origin !== origin
    )
      return reply.code(403).send({ message: 'Origin is not allowed.' });
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({ message: error.issues.map((i) => i.message).join('; ') });
    if ((error as any).statusCode && Number((error as any).statusCode) < 500)
      return reply
        .code(Number((error as any).statusCode))
        .send({ message: (error as Error).message });
    request.log.error(error);
    return reply
      .code(500)
      .send({ message: 'The cloud request failed. Your local project is safe.' });
  });
  app.get('/api/health', async () => ({ status: 'ok', cloud: !!repo && !!auth }));
  app.get('/api/config', async () => ({
    providers: auth ? (options.providers ?? []) : [],
    cloud: !!repo && !!auth,
  }));
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      if (!auth) {
        if (request.url.split('?')[0] === '/api/auth/get-session') return null;
        return reply
          .code(503)
          .send({ message: 'Cloud accounts are unavailable on this deployment.' });
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
      const response = await auth.handler(
        new Request(new URL(request.url, origin), {
          method: request.method,
          headers,
          ...(request.method === 'POST' ? { body: JSON.stringify(request.body) } : {}),
        }),
      );
      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      if (response.headers.getSetCookie().length)
        reply.header('set-cookie', response.headers.getSetCookie());
      return reply.send(await response.text());
    },
  });
  app.register(async (routes) => {
    routes.addHook('preHandler', async (request, reply) => {
      if (!repo || !auth)
        return reply
          .code(503)
          .send({ message: 'Cloud saving is unavailable. Continue using local projects.' });
      const session = await auth.session(request.headers);
      if (!session) return reply.code(401).send({ message: 'Sign in to access cloud projects.' });
      (request as any).ownerId = session.user.id;
    });
    const owner = (request: any) => request.ownerId as string;
    routes.get('/api/v1/projects', async (request) =>
      (await repo!.list(owner(request))).map(publicProject),
    );
    routes.post('/api/v1/projects', async (request, reply) => {
      const input = writeSchema.parse(request.body);
      let document;
      try {
        document = parseDocument(input.document);
      } catch (error) {
        return reply.code(400).send({ message: (error as Error).message });
      }
      if (input.syncImages && !storage)
        return reply
          .code(503)
          .send({ message: 'Image storage is unavailable. Save the graph without images.' });
      const created = await repo!.create(document, owner(request), input.syncImages);
      if (!created)
        return reply
          .code(409)
          .send({ message: 'A project with this identifier exists. Save a copy.' });
      return reply.code(201).send(publicProject(created));
    });
    routes.get('/api/v1/projects/:id', async (request, reply) => {
      const { id } = params.parse(request.params);
      const project = await repo!.get(id, owner(request));
      return project
        ? publicProject(project)
        : reply.code(404).send({ message: 'Project not found.' });
    });
    routes.put('/api/v1/projects/:id', async (request, reply) => {
      const { id } = params.parse(request.params);
      const input = writeSchema.parse(request.body);
      if (!input.revision) return reply.code(400).send({ message: 'A revision is required.' });
      let document;
      try {
        document = parseDocument(input.document);
      } catch (error) {
        return reply.code(400).send({ message: (error as Error).message });
      }
      if (document.id !== id)
        return reply.code(400).send({ message: 'Project identifier cannot change.' });
      const existing = await repo!.get(id, owner(request));
      if (!existing) return reply.code(404).send({ message: 'Project not found.' });
      if (input.syncImages && !storage)
        return reply.code(503).send({ message: 'Image storage is unavailable.' });
      const updated = await repo!.update(
        id,
        owner(request),
        input.revision,
        document,
        input.syncImages,
      );
      if (!updated)
        return reply
          .code(409)
          .send({ message: 'A newer cloud revision exists. Save your changes as a copy.' });
      if (!input.syncImages) {
        const assets = await repo!.listAssets(id);
        await repo!.removeAssets(id);
        await Promise.all(
          assets.map((a) => storage?.delete(a.key).catch((error) => request.log.error(error))),
        );
      }
      return publicProject(updated);
    });
    routes.delete('/api/v1/projects/:id', async (request, reply) => {
      const { id } = params.parse(request.params);
      if (!(await repo!.get(id, owner(request))))
        return reply.code(404).send({ message: 'Project not found.' });
      const assets = await repo!.listAssets(id);
      await repo!.delete(id, owner(request));
      await Promise.all(
        assets.map((a) => storage?.delete(a.key).catch((error) => request.log.error(error))),
      );
      return reply.code(204).send();
    });
    routes.put('/api/v1/projects/:id/assets/:sourceId', async (request, reply) => {
      const { id, sourceId } = assetParams.parse(request.params);
      const project = await repo!.get(id, owner(request));
      if (!project) return reply.code(404).send({ message: 'Project not found.' });
      if (!project.syncImages)
        return reply
          .code(403)
          .send({ message: 'Enable image inclusion before uploading an image.' });
      const source = project.document.sources.find((s) => s.id === sourceId);
      if (!source)
        return reply.code(400).send({ message: 'Image source is not part of this graph.' });
      if (!storage) return reply.code(503).send({ message: 'Image storage is unavailable.' });
      if (!Buffer.isBuffer(request.body) || request.body.length === 0)
        return reply.code(400).send({ message: 'Send a PNG, JPEG, or WebP image.' });
      const bytes = request.body;
      let metadata;
      try {
        metadata = await sharp(bytes, {
          limitInputPixels: MAX_IMAGE_PIXELS,
          animated: false,
        }).metadata();
      } catch {
        return reply.code(400).send({ message: 'Invalid image or image exceeds 16 megapixels.' });
      }
      const mime = (
        { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>
      )[metadata.format ?? ''];
      if (
        !mime ||
        mime !== request.headers['content-type']?.split(';')[0] ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
        metadata.width > 16384 ||
        metadata.height > 16384 ||
        (metadata.pages ?? 1) > 1
      )
        return reply
          .code(400)
          .send({ message: 'Upload a still PNG, JPEG, or WebP image of at most 16 megapixels.' });
      const rotated = metadata.orientation && metadata.orientation >= 5;
      const width = rotated ? metadata.height : metadata.width,
        height = rotated ? metadata.width : metadata.height;
      if (width !== source.width || height !== source.height || mime !== source.mime)
        return reply
          .code(400)
          .send({ message: 'Image dimensions or format do not match the source manifest.' });
      const key = `projects/${id}/${randomUUID()}`;
      const previous = await repo!.getAsset(id, sourceId);
      await storage.put(key, bytes, mime);
      try {
        const saved = await repo!.saveAsset(
          { id: randomUUID(), projectId: id, sourceId, key, mime, bytes: bytes.length },
          owner(request),
        );
        if (!saved) {
          await storage.delete(key);
          return reply
            .code(409)
            .send({ message: 'Image inclusion changed during upload. Retry after saving.' });
        }
      } catch (error) {
        await storage.delete(key);
        throw error;
      }
      if (previous) await storage.delete(previous.key).catch((error) => request.log.error(error));
      return reply.code(201).send({ sourceId, bytes: bytes.length });
    });
    routes.get('/api/v1/projects/:id/assets/:sourceId', async (request, reply) => {
      const { id, sourceId } = assetParams.parse(request.params);
      const project = await repo!.get(id, owner(request));
      if (!project || !project.syncImages)
        return reply.code(404).send({ message: 'Image not found.' });
      const asset = await repo!.getAsset(id, sourceId);
      if (!asset || !storage)
        return reply.code(404).send({ message: 'Reconnect the original image.' });
      reply
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .type(asset.mime);
      return Buffer.from(await storage.get(asset.key));
    });
  });
  return app;
}
