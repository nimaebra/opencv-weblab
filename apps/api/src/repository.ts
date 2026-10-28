import { and, eq, desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PipelineDocument } from '@roveran/pipeline';
import * as schema from './schema';
export type Project = {
  id: string;
  ownerId: string;
  document: PipelineDocument;
  revision: number;
  syncImages: boolean;
  updatedAt: Date;
};
export type Asset = {
  id: string;
  projectId: string;
  sourceId: string;
  key: string;
  mime: string;
  bytes: number;
};
export interface ProjectRepository {
  list(ownerId: string): Promise<Project[]>;
  get(id: string, ownerId: string): Promise<Project | undefined>;
  create(
    document: PipelineDocument,
    ownerId: string,
    syncImages: boolean,
  ): Promise<Project | undefined>;
  update(
    id: string,
    ownerId: string,
    revision: number,
    document: PipelineDocument,
    syncImages: boolean,
  ): Promise<Project | undefined>;
  delete(id: string, ownerId: string): Promise<boolean>;
  getAsset(projectId: string, sourceId: string): Promise<Asset | undefined>;
  listAssets(projectId: string): Promise<Asset[]>;
  saveAsset(asset: Asset, ownerId: string): Promise<boolean>;
  removeAssets(projectId: string): Promise<void>;
}
export class PgRepository implements ProjectRepository {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}
  list(ownerId: string) {
    return this.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.ownerId, ownerId))
      .orderBy(desc(schema.projects.updatedAt));
  }
  async get(id: string, ownerId: string) {
    return (
      await this.db
        .select()
        .from(schema.projects)
        .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, ownerId)))
    )[0];
  }
  async create(document: PipelineDocument, ownerId: string, syncImages: boolean) {
    return (
      await this.db
        .insert(schema.projects)
        .values({ id: document.id, ownerId, document, syncImages })
        .onConflictDoNothing()
        .returning()
    )[0];
  }
  async update(
    id: string,
    ownerId: string,
    revision: number,
    document: PipelineDocument,
    syncImages: boolean,
  ) {
    return (
      await this.db
        .update(schema.projects)
        .set({ document, revision: revision + 1, syncImages, updatedAt: new Date() })
        .where(
          and(
            eq(schema.projects.id, id),
            eq(schema.projects.ownerId, ownerId),
            eq(schema.projects.revision, revision),
          ),
        )
        .returning()
    )[0];
  }
  async delete(id: string, ownerId: string) {
    return (
      (
        await this.db
          .delete(schema.projects)
          .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, ownerId)))
          .returning()
      ).length > 0
    );
  }
  async getAsset(projectId: string, sourceId: string) {
    return (
      await this.db
        .select()
        .from(schema.assets)
        .where(and(eq(schema.assets.projectId, projectId), eq(schema.assets.sourceId, sourceId)))
    )[0];
  }
  listAssets(projectId: string) {
    return this.db.select().from(schema.assets).where(eq(schema.assets.projectId, projectId));
  }
  async saveAsset(asset: Asset, ownerId: string) {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(schema.projects)
        .where(and(eq(schema.projects.id, asset.projectId), eq(schema.projects.ownerId, ownerId)))
        .for('update');
      if (!project?.syncImages || !project.document.sources.some((s) => s.id === asset.sourceId))
        return false;
      await tx
        .insert(schema.assets)
        .values(asset)
        .onConflictDoUpdate({
          target: [schema.assets.projectId, schema.assets.sourceId],
          set: { key: asset.key, mime: asset.mime, bytes: asset.bytes },
        });
      return true;
    });
  }
  async removeAssets(projectId: string) {
    await this.db.delete(schema.assets).where(eq(schema.assets.projectId, projectId));
  }
}
