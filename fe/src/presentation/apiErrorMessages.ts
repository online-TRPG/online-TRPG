import type { ApiErrorEnvelope } from '@trpg/shared-types';

const exactErrorMessages: Record<string, string> = {
  AUTH_401: '로그인이 필요하거나 로그인 정보가 만료되었습니다.',
  AUTH_403: '이 작업을 수행할 권한이 없습니다.',
  USER_409: '이미 사용 중인 정보입니다.',
  SESSION_404: '세션을 찾을 수 없습니다.',
  SESSION_409: '현재 세션 상태에서는 이 작업을 수행할 수 없습니다.',
  SCENARIO_404: '시나리오를 찾을 수 없습니다.',
  SCENARIO_409: '현재 시나리오 상태에서는 이 작업을 수행할 수 없습니다.',
  CHARACTER_404: '캐릭터를 찾을 수 없습니다.',
};

const statusErrorMessages: Record<number, string> = {
  400: '입력한 내용을 다시 확인해주세요.',
  401: '로그인이 필요하거나 로그인 정보가 만료되었습니다.',
  403: '이 작업을 수행할 권한이 없습니다.',
  404: '요청한 정보를 찾을 수 없습니다.',
  409: '현재 상태에서는 이 작업을 수행할 수 없습니다.',
  422: '입력한 내용을 처리할 수 없습니다.',
  429: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  500: '서버에서 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
  502: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
  503: '서비스를 잠시 사용할 수 없습니다. 잠시 후 다시 시도해주세요.',
};

function containsKorean(value: string): boolean {
  return /[가-힣]/.test(value);
}

export function getApiErrorMessage(body: ApiErrorEnvelope | null, fallback: string): string {
  if (body?.code && exactErrorMessages[body.code]) return exactErrorMessages[body.code];
  const rawMessage = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
  if (rawMessage && containsKorean(rawMessage)) return rawMessage;
  const codeStatus = body?.code?.match(/_(\d{3})$/)?.[1];
  const status = body?.statusCode ?? (codeStatus ? Number(codeStatus) : undefined);
  if (status && statusErrorMessages[status]) {
    return statusErrorMessages[status];
  }
  return fallback || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.';
}
