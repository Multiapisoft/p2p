import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { UserStatus } from '../../common/enums/currency.enum';
import { UsersRepository } from '../users/users.repository';
import { P2pRealtimeService } from './p2p-realtime.service';

function handshakeToken(client: Socket): string | null {
  const auth = client.handshake.auth as { token?: unknown };
  if (typeof auth?.token === 'string' && auth.token) return auth.token;
  const q = client.handshake.query?.token;
  if (typeof q === 'string' && q) return q;
  if (Array.isArray(q) && typeof q[0] === 'string' && q[0]) return q[0];
  const header = client.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

@SkipThrottle()
@WebSocketGateway({
  namespace: '/p2p',
  cors: { origin: true, credentials: true },
})
export class P2pGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(P2pGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private realtime: P2pRealtimeService,
    private jwt: JwtService,
    private usersRepo: UsersRepository,
  ) {}

  afterInit(server: Server) {
    this.realtime.setServer(server);
  }

  async handleConnection(client: Socket) {
    const token = handshakeToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      const user = await this.usersRepo.findById(payload.sub);
      if (!user || user.status !== UserStatus.ACTIVE) {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
    } catch {
      this.logger.debug(`P2P socket rejected ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // no-op: list room is the whole namespace
  }
}
