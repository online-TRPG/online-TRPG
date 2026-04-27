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
      Array.isArray(rawMessage)
        ? {
            fieldErrors: rawMessage.map((reason) => ({
              field: "request",
              reason: String(reason),
            })),
          }
        : null;

    response.status(status).json({
      code: resolveErrorCode(request.url, status),
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
