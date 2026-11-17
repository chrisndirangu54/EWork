import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  // Raw JSON is preserved for cryptographic webhook validation, and size-limited for uploads.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '4mb', verify: (req, _res, body) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(body);
  }}));
  app.use(urlencoded({ extended: false, limit: '64kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  const corsOrigins = process.env.CORS_ORIGINS ?
    process.env.CORS_ORIGINS.split(',').map(x => x.trim()).filter(Boolean) :
    ['http://localhost:5173', 'http://localhost:3000'];
  app.enableCors({ origin: corsOrigins, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('TeknTandao Global Services API')
    .setDescription('Managed BPO, direct freelancer marketplace, private document and sandbox commerce API')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`TeknTandao Global Services API listening on port ${port} (sandbox checkout disabled by default)`);
}
bootstrap();
