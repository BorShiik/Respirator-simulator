import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Use native WebSocket adapter (compatible with browser WebSocket)
  app.useWebSocketAdapter(new WsAdapter(app));
  
  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  // API prefix
  app.setGlobalPrefix('api');
  
  const port = process.env.PORT || 8080;
  await app.listen(port);
  console.log(`🚀 Respirator Backend running on http://localhost:${port}`);
}

bootstrap();
