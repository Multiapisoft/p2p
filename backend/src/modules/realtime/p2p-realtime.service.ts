import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import type { Server } from 'socket.io';
import { RedisService } from '../../redis/redis.service';
import type { P2pListEvent, P2pListEventType } from './p2p-list.events';

const CHANNEL = 'p2p-list-events';
export const P2P_LIST_CHANGED = 'list-changed';

@Injectable()
export class P2pRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(P2pRealtimeService.name);
  private readonly instanceId = randomUUID();
  private server: Server | null = null;
  private sub: Redis | null = null;

  constructor(private redis: RedisService) {}

  setServer(server: Server) {
    this.server = server;
  }

  async onModuleInit() {
    this.sub = this.redis.duplicateSubscriber();
    if (!this.sub) return;
    try {
      if (this.sub.status === 'wait') {
        await this.sub.connect();
      }
      await this.sub.subscribe(this.redis.channelKey(CHANNEL));
      this.sub.on('message', (_channel, raw) => {
        try {
          const event = JSON.parse(raw) as P2pListEvent;
          if (event?.instanceId === this.instanceId) return;
          this.broadcast(event);
        } catch {
          // ignore malformed
        }
      });
    } catch (err) {
      this.logger.warn(
        `P2P list Redis subscribe skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  emitListChanged(
    type: P2pListEventType,
    opts?: { withdrawalId?: string; claimedBy?: string },
  ) {
    const event: P2pListEvent = {
      type,
      withdrawalId: opts?.withdrawalId,
      claimedBy: opts?.claimedBy,
      at: Date.now(),
      instanceId: this.instanceId,
    };
    this.broadcast(event);
    void this.redis.publish(CHANNEL, event);
  }

  private broadcast(event: P2pListEvent) {
    this.server?.emit(P2P_LIST_CHANGED, event);
  }

  async onModuleDestroy() {
    if (!this.sub) return;
    try {
      await this.sub.quit();
    } catch {
      // ignore
    }
    this.sub = null;
  }
}
