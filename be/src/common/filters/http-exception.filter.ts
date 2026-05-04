import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const customCode =
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null &&
      "code" in exceptionResponse
        ? String(exceptionResponse.code)
        : null;
    const customData =
      typeof exceptionResponse === "object" &&
      exceptionResponse !== null &&
      "data" in exceptionResponse
        ? exceptionResponse.data
        : undefined;

    const rawMessage =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : typeof exceptionResponse === "object" &&
            exceptionResponse !== null &&
            "message" in exceptionResponse
          ? exceptionResponse.message
          : "Internal server error";
    const message = Array.isArray(rawMessage) ? "잘못된 요청입니다." : String(rawMessage);
    const data =
      customData !== undefined
        ? customData
        : Array.isArray(rawMessage)
        ? {
            fieldErrors: rawMessage.map((reason) => ({
              field: "request",
              reason: String(reason),
            })),
          }
        : null;

    response.status(status).json({
      // 도메인 서비스가 명확한 에러 코드를 줄 때는 그 코드를 그대로 내려준다.
      // 그래야 프론트가 "자기 턴 아님" 같은 게임 규칙 오류를 상태 코드만 보고 추측하지 않아도 된다.
      code: customCode ?? resolveErrorCode(request.url, status),
      message,
      data,
    });
  }
}

function resolveErrorCode(path: string, status: number): string {
  if (status === HttpStatus.UNAUTHORIZED) {
    return "AUTH_401";
  }

  const domain = path.includes("/sessions")
    ? "SESSION"
    : path.includes("/characters")
      ? "CHARACTER"
      : path.includes("/scenarios")
        ? "SCENARIO"
        : path.includes("/users")
          ? "USER"
          : "COMMON";

  return `${domain}_${status}`;
}
