import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { RedisService } from '../../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private mongoose: MongooseHealthIndicator,
    private redis: RedisService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongoose.pingCheck('mongodb'),
      async () => {
        try {
          await this.redis.ping();
          return { redis: { status: 'up' } };
        } catch {
          // REDIS_ENABLED=false (or Redis down) must not fail overall health —
          // app still serves API without cache.
          return {
            redis: { status: 'up', message: 'disabled or unreachable (optional)' },
          };
        }
      },
    ]);
  }
}
