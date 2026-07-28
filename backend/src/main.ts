import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const DEFAULT_PROD_ORIGINS = [
  'https://dev.app.fairplayoffical.com',
  'https://dev.dashboard.fairplayoffical.com',
  'https://dev.paysecure247.com',
  'https://dev.invespro.xyz',
  'http://dev.app.fairplayoffical.com',
  'http://dev.dashboard.fairplayoffical.com',
  'http://dev.paysecure247.com',
  'http://dev.invespro.xyz',
];

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/$/, '');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('app.apiPrefix') || 'api/v1';
  const nodeEnv = config.get<string>('nodeEnv');
  const configured = (config.get<string[]>('app.corsOrigins') || []).map(normalizeOrigin);
  const allowedOrigins = new Set(
    [...configured, ...(nodeEnv === 'production' ? DEFAULT_PROD_ORIGINS : [])].map(
      normalizeOrigin,
    ),
  );

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Non-browser / same-origin proxy / curl — no Origin header
      if (!origin) {
        callback(null, true);
        return;
      }
      if (nodeEnv !== 'production') {
        callback(null, true);
        return;
      }
      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.has(normalized)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Api-Key',
      'X-Api-Secret',
      'X-Internal-Secret',
      'Accept',
      'Origin',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.get<string>('app.name') || 'P2P Payment Platform')
    .setDescription('P2P Payment Platform API - deposits, withdrawals, business integration')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'api-key')
    .addApiKey({ type: 'apiKey', name: 'X-API-Secret', in: 'header' }, 'api-secret')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('port') || 9091;
  await app.listen(port);

  console.log(`P2P Platform: http://localhost:${port}/${apiPrefix}`);
  console.log(`Swagger Docs: http://localhost:${port}/api/docs`);
}
bootstrap();
