import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.js';

async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('JWT_SECRET must have at least 32 characters.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (!process.env.WEB_ORIGIN) throw new Error('WEB_ORIGIN is required.');
  if (!['demo', 'live'].includes(process.env.CATALOG_MODE || ''))
    throw new Error('CATALOG_MODE must be demo or live.');
  if (process.env.APPLE_COUNTRY && !/^[A-Za-z]{2}$/.test(process.env.APPLE_COUNTRY))
    throw new Error('APPLE_COUNTRY must be a two-letter market code.');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: [process.env.WEB_ORIGIN, 'https://localhost'], credentials: true });
  if (process.env.NODE_ENV !== 'production')
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('GYEOL API').setVersion('0.1.0').addBearerAuth().build(),
      ),
    );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 4000), '0.0.0.0');
}
main().catch(() => {
  console.error('API startup failed. Check database availability and required configuration.');
  process.exitCode = 1;
});
