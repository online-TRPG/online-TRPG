import { Injectable } from "@nestjs/common";
import {
  P6_CHARACTER_TRANSFER_REQUESTS_FLAG,
  type P6CharacterTransferRequestFlag,
} from "./campaign-archive-runtime.service";

@Injectable()
export class SessionCharacterTransferRequestStoreService {
  findPendingDuplicate(
    requests: P6CharacterTransferRequestFlag[],
    params: {
      requestedByUserId: string;
      sourceSessionCharacterId: string;
    },
  ): P6CharacterTransferRequestFlag | null {
    return requests.find(
      (request) =>
        request.status === "requested" &&
        request.requestedByUserId === params.requestedByUserId &&
        request.sourceSessionCharacterId === params.sourceSessionCharacterId,
    ) ?? null;
  }

  findByIdWithIndex(
    requests: P6CharacterTransferRequestFlag[],
    requestId: string,
  ): { request: P6CharacterTransferRequestFlag; requestIndex: number } | null {
    const requestIndex = requests.findIndex((request) => request.requestId === requestId);
    return requestIndex >= 0 ? { request: requests[requestIndex], requestIndex } : null;
  }

  append(
    flags: Record<string, unknown>,
    requests: P6CharacterTransferRequestFlag[],
    request: P6CharacterTransferRequestFlag,
  ): Record<string, unknown> {
    return {
      ...flags,
      [P6_CHARACTER_TRANSFER_REQUESTS_FLAG]: [...requests, request],
    };
  }

  replaceAt(
    flags: Record<string, unknown>,
    requests: P6CharacterTransferRequestFlag[],
    requestIndex: number,
    request: P6CharacterTransferRequestFlag,
  ): Record<string, unknown> {
    const nextRequests = [...requests];
    nextRequests[requestIndex] = request;
    return {
      ...flags,
      [P6_CHARACTER_TRANSFER_REQUESTS_FLAG]: nextRequests,
    };
  }
}
