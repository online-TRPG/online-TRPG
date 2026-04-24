import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // 컨트롤러에 도달하기 전에 요청 본문을 검사한다.
  // DTO에 정의되지 않은 값은 제거하거나 거부해서,
  // Swagger 예시, 테스트 코드, 실제 클라이언트 요청이 같은 규칙으로 처리되게 만든다.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors({
    origin: true,       // 요청의 Origin을 그대로 허용 (로컬 개발용)
    credentials: true,  // refresh token 쿠키 전송 허용
  });
  app.setGlobalPrefix("api/v1");

  const config = new DocumentBuilder()
    .setTitle("TRPG Platform API")
    .setDescription("Member, session, character, state, and WebSocket APIs.")
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      "bearer",
    )
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "x-user-id",
      },
      "x-user-id",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);

  const port = Number(process.env.PORT ?? "3000");
  await app.listen(port);
}

void bootstrap();
