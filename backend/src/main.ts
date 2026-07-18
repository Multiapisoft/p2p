import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>('app.apiPrefix') || 'api/v1';

  app.setGlobalPrefix(apiPrefix);
  app.enableCors({
    origin: config.get<string>('nodeEnv') === 'production' ? false : true,
    credentials: true,
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
