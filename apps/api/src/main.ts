import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { CONFIG, type Config } from './auth.js';

async function main() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<Config>(CONFIG);
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Sentinelle API')
    .setDescription('Tenant- and site-scoped QHSE foundation. X-Tenant-Id selects an authorized membership.')
    .setVersion('0.2.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs',app,document);
  await app.listen(config.port,config.host);
}
main().catch(() => { console.error('API startup failed. Verify database access, runtime role and authentication configuration.'); process.exit(1); });
