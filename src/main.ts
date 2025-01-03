import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prisma Client 초기화
  const prisma = new PrismaClient();

  // Prisma와 데이터베이스 연결 확인
  try {
    await prisma.$connect();
    console.log('Prisma connected to the database successfully.');
  } catch (error) {
    console.error('Error connecting to the database:', error);
    process.exit(1); // 데이터베이스 연결 실패 시 애플리케이션 종료
  }

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('API Docs')
    .setDescription('API description')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // 서버 시작
  await app.listen(3000);

  // 서버 종료 시 Prisma 연결 해제
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    console.log('Prisma disconnected from the database.');
    process.exit(0);
  });
}

bootstrap();
