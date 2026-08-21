import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  allowedExtensionsForPurpose,
  extensionOf,
  isAllowedExtension,
  mimeForExtension,
  normalizeUploadContentType,
} from './utils/upload-file.util';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly baseUrl: string;
  private readonly enabled: boolean;
  private readonly localUploadDir: string;
  private readonly apiPrefix: string;
  private readonly port: number;

  constructor(private config: ConfigService) {
    const accessKeyId = this.config.get<string>('storage.accessKeyId');
    const secretAccessKey = this.config.get<string>('storage.secretAccessKey');
    const endpoint = this.config.get<string>('storage.endpoint');
    this.bucket = this.config.get<string>('storage.bucket') || 'brt';
    this.baseUrl = this.config.get<string>('storage.baseUrl') || '';
    this.enabled = !!(accessKeyId && secretAccessKey && endpoint);
    this.apiPrefix = this.config.get<string>('app.apiPrefix') || 'api/v1';
    this.port = this.config.get<number>('port') || 9091;
    this.localUploadDir = path.join(process.cwd(), 'uploads');

    if (this.enabled && accessKeyId && secretAccessKey && endpoint) {
      this.client = new S3Client({
        region: this.config.get<string>('storage.region') || 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
    } else {
      this.client = null;
    }
  }

  isEnabled() {
    return this.enabled;
  }

  private buildKey(userId: string, filename: string, purpose: string) {
    const ext = extensionOf(filename) || 'jpg';
    if (!isAllowedExtension(purpose, ext)) {
      const allowed = allowedExtensionsForPurpose(purpose)
        .map((e) => e.toUpperCase())
        .join(', ');
      throw new BadRequestException(`Only ${allowed} files allowed`);
    }
    return `p2p/${purpose}/${userId}/${Date.now()}-${uuidv4().slice(0, 8)}.${ext}`;
  }

  private publicUrlForKey(key: string) {
    if (this.baseUrl) {
      return `${this.baseUrl.replace(/\/$/, '')}/${key}`;
    }
    return `http://localhost:${this.port}/${this.apiPrefix}/uploads/files/${key}`;
  }

  async createPresignedUpload(
    userId: string,
    filename: string,
    contentType: string,
    purpose = 'withdrawal-payment-proof',
  ) {
    if (!this.client) {
      throw new BadRequestException('File storage is not configured');
    }

    const key = this.buildKey(userId, filename, purpose);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 600 });
    const publicUrl = this.publicUrlForKey(key);

    return { key, uploadUrl, publicUrl, expiresIn: 600 };
  }

  /** Server-side upload — avoids browser CORS / R2 direct PUT issues. */
  async uploadProofFile(
    userId: string,
    file: Express.Multer.File,
    purpose = 'withdrawal-payment-proof',
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }

    const filename = file.originalname || `upload.bin`;
    const contentType = this.normalizeContentType(file.mimetype, filename);
    const key = this.buildKey(userId, filename, purpose);

    if (this.client) {
      try {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: file.buffer,
            ContentType: contentType,
          }),
        );
        return { key, publicUrl: this.publicUrlForKey(key), filename, contentType, size: file.size };
      } catch (err) {
        this.logger.warn(
          `R2 upload failed, falling back to local storage: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const saved = await this.saveLocal(key, file.buffer);
    return { ...saved, filename, contentType, size: file.size };
  }

  private async saveLocal(key: string, buffer: Buffer) {
    const fullPath = path.join(this.localUploadDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    const publicUrl = `http://localhost:${this.port}/${this.apiPrefix}/uploads/files/${key}`;
    return { key, publicUrl };
  }

  async readLocalFile(key: string) {
    const fullPath = path.join(this.localUploadDir, key);
    try {
      return await fs.readFile(fullPath);
    } catch {
      throw new BadRequestException('File not found');
    }
  }

  normalizeContentType(mimetype: string | undefined, filename: string) {
    return normalizeUploadContentType(mimetype, filename);
  }

  validateProofKey(key: string, userId: string) {
    if (!key.startsWith(`p2p/withdrawal-payment-proof/${userId}/`)) {
      throw new BadRequestException('Invalid proof image key');
    }
  }

  contentTypeForKey(key: string) {
    const ext = extensionOf(key);
    return mimeForExtension(ext);
  }

  getPublicUrl(key: string) {
    return this.publicUrlForKey(key);
  }
}
