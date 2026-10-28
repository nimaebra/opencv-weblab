import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
export interface ObjectStorage {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
export class S3Storage implements ObjectStorage {
  private client: S3Client;
  constructor(
    private bucket: string,
    options: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: !!options.endpoint,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }
  async ensureBucket() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      const status = (error as any).$metadata?.httpStatusCode;
      if (status !== 404) throw error;
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }
  async put(key: string, bytes: Buffer, mime: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: mime,
        CacheControl: 'private, no-store',
      }),
    );
  }
  async get(key: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error('Image object is missing.');
    return response.Body.transformToByteArray();
  }
  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
