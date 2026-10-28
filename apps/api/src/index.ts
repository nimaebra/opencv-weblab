import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { fromNodeHeaders } from 'better-auth/node';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';
import { PgRepository } from './repository';
import { S3Storage } from './storage';
import { createApp, type AuthService } from './app';
const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL) : undefined;
const db = sql ? drizzle(sql, { schema }) : undefined;
const providers: Record<string, { clientId: string; clientSecret: string }> = {};
for (const provider of ['google', 'github']) {
  const key = provider.toUpperCase();
  if (process.env[`${key}_CLIENT_ID`] && process.env[`${key}_CLIENT_SECRET`])
    providers[provider] = {
      clientId: process.env[`${key}_CLIENT_ID`]!,
      clientSecret: process.env[`${key}_CLIENT_SECRET`]!,
    };
}
if (
  process.env.NODE_ENV === 'production' &&
  db &&
  (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32)
)
  throw new Error('Set a high-entropy BETTER_AUTH_SECRET of at least 32 characters.');
const auth =
  db && process.env.BETTER_AUTH_SECRET
    ? betterAuth({
        database: drizzleAdapter(db, { provider: 'pg', schema }),
        baseURL: origin,
        secret: process.env.BETTER_AUTH_SECRET,
        trustedOrigins: [origin],
        socialProviders: providers,
        advanced: { useSecureCookies: process.env.NODE_ENV === 'production' },
        session: { expiresIn: 60 * 60 * 24 * 7 },
      })
    : undefined;
const authService: AuthService | undefined = auth
  ? {
      session: (headers) =>
        auth.api.getSession({ headers: fromNodeHeaders(headers) }) as Promise<{
          user: { id: string };
        } | null>,
      handler: (request) => auth.handler(request),
    }
  : undefined;
const storage =
  process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? new S3Storage(process.env.S3_BUCKET, {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'us-east-1',
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      })
    : undefined;
if (storage && process.env.S3_CREATE_BUCKET === 'true') await storage.ensureBucket();
const app = await createApp({
  repository: db ? new PgRepository(db) : undefined,
  storage,
  auth: authService,
  origin,
  providers: Object.keys(providers),
  logger: true,
});
const webRoot = resolve(
  process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
);
if (existsSync(webRoot)) {
  await app.register(fastifyStatic, { root: webRoot });
  app.setNotFoundHandler((request, reply) =>
    request.url.startsWith('/api/')
      ? reply.code(404).send({ message: 'Endpoint not found.' })
      : reply.sendFile('index.html'),
  );
}
await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? '0.0.0.0' });
async function close() {
  await app.close();
  await sql?.end();
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
