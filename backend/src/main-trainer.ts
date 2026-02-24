import { NestFactory } from '@nestjs/core';
import { AppTrainerModule } from './app.trainer.module';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppTrainerModule);
  
  // Use native WebSocket adapter
  app.useWebSocketAdapter(new WsAdapter(app));
  
  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  // API prefix
  app.setGlobalPrefix('api');
  
  // Trainer usually on 8081 if running on same machine for dev, or 8080 if dedicated
  const port = process.env.PORT || 8081;
  await app.listen(port);
  console.log(`🚀 Trainer Backend (Master) running on http://localhost:${port}`);
}

bootstrap();
