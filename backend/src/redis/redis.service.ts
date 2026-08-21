import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;
  private readonly prefix: string;
  private readonly defaultTtl: number;
  private readonly logger = new Logger(RedisService.name);
  private available = false;
  private warned = false;

  constructor(private config: ConfigService) {
    this.prefix = this.config.get<string>('redis.prefix') || 'p2p:';
    this.defaultTtl = this.config.get<number>('redis.ttl') || 300;

    const enabled = this.config.get<boolean>('redis.enabled') !== false;
    if (!enabled) {
      this.client = null;
      this.logger.log('Redis disabled via REDIS_ENABLED=false');
      return;
    }

    this.client = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
    });

    this.client.on('error', (err: Error) => {
      this.available = false;
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `Redis unavailable (${err.message}). Cache disabled — start Redis or set REDIS_ENABLED=false.`,
        );
      }
    });

    this.client.on('connect', () => {
      this.available = true;
      this.warned = false;
      this.logger.log('Redis connected');
    });

    this.client.connect().catch(() => undefined);
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  private get ready(): boolean {
    return !!this.client && this.available;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.ready) return null;
    try {
      const data = await this.client!.get(this.key(key));
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    if (!this.ready) return;
    try {
      const serialized = JSON.stringify(value);
      await this.client!.setex(this.key(key), ttl ?? this.defaultTtl, serialized);
    } catch {
      // cache miss is acceptable
    }
  }

  async del(key: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client!.del(this.key(key));
    } catch {
      // ignore
    }
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.ready) return;
    try {
      const keys = await this.client!.keys(this.key(pattern));
      if (keys.length) await this.client!.del(...keys);
    } catch {
      // ignore
    }
  }

  async ping(): Promise<string> {
    if (!this.client) throw new Error('Redis disabled');
    if (!this.available) throw new Error('Redis not connected');
    return this.client.ping();
  }

  channelKey(channel: string): string {
    return this.key(channel);
  }

  /** Dedicated subscriber connection (ioredis subscribe mode is exclusive). */
  duplicateSubscriber(): Redis | null {
    if (!this.client) return null;
    return this.client.duplicate({
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: null,
    });
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client!.publish(this.key(channel), JSON.stringify(payload));
    } catch {
      // live fan-out is best-effort
    }
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }
}
