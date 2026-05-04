import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

type ErrorPayload = {
  reason?: string;
  [key: string]: unknown;
};

export function badRequest(code: string, message: string, data?: ErrorPayload): BadRequestException {
  return new BadRequestException({ code, message, data: data ?? null });
}

export function forbidden(code: string, message: string, data?: ErrorPayload): ForbiddenException {
  return new ForbiddenException({ code, message, data: data ?? null });
}

export function notFound(code: string, message: string, data?: ErrorPayload): NotFoundException {
  return new NotFoundException({ code, message, data: data ?? null });
}

export function conflict(code: string, message: string, data?: ErrorPayload): ConflictException {
  return new ConflictException({ code, message, data: data ?? null });
}

export function unprocessable(
  code: string,
  message: string,
  data?: ErrorPayload,
): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message, data: data ?? null });
}
