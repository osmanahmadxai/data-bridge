import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/app-exception.filter';
import { TransformInterceptor } from './common/transform.interceptor';
import { runtimeConfig } from './common/runtime-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Quiet the verbose route-mapping / bootstrap logs so the combined
    // `pnpm dev` output stays readable. Errors and warnings still show.
    logger: ['error', 'warn'],
  });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: runtimeConfig.webOrigin, credentials: true });
  app.useGlobalFilters(new AppExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.enableShutdownHooks();

  await app.listen(runtimeConfig.port);
  // Use console.log so this single line always prints regardless of log level.
  console.log(`\n API ready  →  http://localhost:${runtimeConfig.port}/api\n`);
}

void bootstrap();
