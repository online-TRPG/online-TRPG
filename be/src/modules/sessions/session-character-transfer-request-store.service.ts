import { Injectable } from "@nestjs/common";
import type { P6CharacterTransferRequestFlag } from "./campaign-archive-runtime.service";

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

  append(
    flags: Record<string, unknown>,
    requests: P6CharacterTransferRequestFlag[],
    request: P6CharacterTransferRequestFlag,
  ): Record<string, unknown> {
    return {
      ...flags,
      p6CharacterTransferRequests: [...requests, request],
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
      p6CharacterTransferRequests: nextRequests,
    };
  }
}
