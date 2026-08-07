import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodb.uri'),
        // Keep process alive across transient Mongo disconnects
        serverSelectionTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        maxPoolSize: 20,
        connectionFactory: (connection: {
          on: (event: string, cb: (...args: unknown[]) => void) => void;
        }) => {
          const logger = new Logger('MongoDB');
          connection.on('connected', () => logger.log('MongoDB connected'));
          connection.on('disconnected', () =>
            logger.warn('MongoDB disconnected — process kept alive, will retry'),
          );
          connection.on('reconnected', () => logger.log('MongoDB reconnected'));
          connection.on('error', (err: unknown) => {
            logger.error(
              `MongoDB error (kept alive): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          });
          return connection;
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
