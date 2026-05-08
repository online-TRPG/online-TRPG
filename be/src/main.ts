import { BadRequestException, Logger, ValidationError, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { loadRuntimeEnv } from "./common/utils/runtime-env";

loadRuntimeEnv();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const bodyLimit = process.env.HTTP_BODY_LIMIT ?? "8mb";

  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // 컨트롤러에 도달하기 전에 요청 본문을 검사한다.
  // DTO에 정의되지 않은 값은 제거하거나 거부해서,
  // Swagger 예시, 테스트 코드, 실제 클라이언트 요청이 같은 규칙으로 처리되게 만든다.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: "잘못된 요청입니다.",
          data: {
            fieldErrors: flattenValidationErrors(errors),
          },
        }),
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

  const port = Number(process.env.PORT ?? "8080");
  await app.listen(port);
  Logger.log(`Nest application is listening on port ${port}`, "Bootstrap");
}

void bootstrap();

function flattenValidationErrors(errors: ValidationError[]): Array<{ field: string; reason: string }> {
  return errors.flatMap((error) => {
    const ownErrors = Object.values(error.constraints ?? {}).map((message) => ({
      field: error.property,
      reason: toKoreanValidationMessage(error.property, message),
    }));
    const childErrors = flattenValidationErrors(error.children ?? []).map((child) => ({
      ...child,
      field: `${error.property}.${child.field}`,
    }));

    return [...ownErrors, ...childErrors];
  });
}

function toKoreanValidationMessage(field: string, message: string): string {
  const label = getFieldLabel(field);
  const minLengthMatch = /must be longer than or equal to (\d+) characters/i.exec(message);
  const maxLengthMatch = /must be shorter than or equal to (\d+) characters/i.exec(message);

  if (message.includes("must be an email")) {
    return "올바른 이메일 형식이 아닙니다.";
  }
  if (message.includes("should not be empty")) {
    return `${label}을 입력해주세요.`;
  }
  if (minLengthMatch) {
    return `${label}은 ${minLengthMatch[1]}자 이상이어야 합니다.`;
  }
  if (maxLengthMatch) {
    return `${label}은 ${maxLengthMatch[1]}자 이하여야 합니다.`;
  }
  if (message.includes("must be a string")) {
    return `${label} 형식이 올바르지 않습니다.`;
  }

  return message;
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    email: "이메일",
    password: "비밀번호",
    name: "이름",
    displayName: "닉네임",
    redirectUri: "redirectUri",
    code: "인가 코드",
  };

  return labels[field] ?? field;
}
