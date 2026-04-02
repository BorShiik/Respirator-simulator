import { NestFactory } from '@nestjs/core';
import { AppStudentModule } from './app.student.module';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppStudentModule);
  
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
  
  const port = process.env.PORT || 8080;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Student Backend (Simulator) running on http://0.0.0.0:${port}`);
}

bootstrap();
