import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { P2pGateway } from './p2p.gateway';
import { P2pRealtimeService } from './p2p-realtime.service';

@Global()
@Module({
  imports: [AuthModule, UsersModule],
  providers: [P2pRealtimeService, P2pGateway],
  exports: [P2pRealtimeService],
})
export class RealtimeModule {}
