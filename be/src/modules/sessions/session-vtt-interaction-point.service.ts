import { BadRequestException, Injectable } from "@nestjs/common";
import { isRecord, VttMapInteractionDto, VttMapStateDto } from "@trpg/shared-types";

@Injectable()
export class SessionVttInteractionPointService {
  resolveMapPoint(dto: VttMapInteractionDto): { x: number; y: number } | null {
    if (!dto.mapPoint) {
      return null;
    }
    const mapPoint = this.readMapPoint(dto.mapPoint);
    return {
      x: Math.floor(mapPoint.x),
      y: Math.floor(mapPoint.y),
    };
  }

  getTargetId(dto: VttMapInteractionDto): string | null {
    const targetId = dto.targetId?.trim();
    return targetId || null;
  }

  resolveTargetPoint(map: VttMapStateDto, targetId: string): { x: number; y: number } | null {
    const door = (map.doorCells ?? []).find((cell) => cell.id === targetId);
    if (door) {
      return this.getCellCenter(door);
    }
    const objectCell = (map.objectCells ?? []).find((cell) => cell.id === targetId);
    if (objectCell) {
      return this.getCellCenter(objectCell);
    }
    return null;
  }

  private getCellCenter(cell: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
    return {
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
    };
  }

  private readMapPoint(value: unknown): { x: number; y: number } {
    if (!isRecord(value)) {
      throw new BadRequestException("vttMapInteraction.mapPoint must be an object.");
    }
    if (typeof value.x !== "number" || !Number.isFinite(value.x)) {
      throw new BadRequestException("vttMapInteraction.mapPoint.x must be a finite number.");
    }
    if (typeof value.y !== "number" || !Number.isFinite(value.y)) {
      throw new BadRequestException("vttMapInteraction.mapPoint.y must be a finite number.");
    }
    return { x: value.x, y: value.y };
  }
}
