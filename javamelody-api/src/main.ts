import { NestFactory }        from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule }          from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (process.env.CORS_ORIGINS || 'http://localhost:4200').split(',').map(s => s.trim()),
  });

  // Swagger — disponível em /api/docs
  const config = new DocumentBuilder()
    .setTitle('JavaMelody History API')
    .setDescription('API REST de histórico de métricas — série temporal e alertas')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = parseInt(process.env.PORT || '3001');
  await app.listen(port);
  console.log(`\n✔ JavaMelody History API em http://localhost:${port}`);
  console.log(`  Swagger: http://localhost:${port}/api/docs\n`);
}
bootstrap();
