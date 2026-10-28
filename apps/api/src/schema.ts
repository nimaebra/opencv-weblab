import {
  pgTable,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { PipelineDocument } from '@roveran/pipeline';
const date = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: date('created_at').notNull().defaultNow(),
  updatedAt: date('updated_at').notNull().defaultNow(),
});
export const session = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: date('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: date('created_at').notNull().defaultNow(),
  updatedAt: date('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});
export const account = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: date('access_token_expires_at'),
  refreshTokenExpiresAt: date('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: date('created_at').notNull().defaultNow(),
  updatedAt: date('updated_at').notNull().defaultNow(),
});
export const verification = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: date('expires_at').notNull(),
  createdAt: date('created_at').notNull().defaultNow(),
  updatedAt: date('updated_at').notNull().defaultNow(),
});
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  document: jsonb('document').$type<PipelineDocument>().notNull(),
  revision: integer('revision').notNull().default(1),
  syncImages: boolean('sync_images').notNull().default(false),
  updatedAt: date('updated_at').notNull().defaultNow(),
});
export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    key: text('object_key').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
  },
  (table) => [uniqueIndex('assets_project_source_idx').on(table.projectId, table.sourceId)],
);
