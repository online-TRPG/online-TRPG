import { Injectable } from "@nestjs/common";
import { VttMapInteractionDto, VttMapStateDto } from "@trpg/shared-types";

@Injectable()
export class SessionVttInteractionPointService {
  resolveMapPoint(dto: VttMapInteractionDto): { x: number; y: number } | null {
    if (!dto.mapPoint) {
      return null;
    }
    return {
      x: Math.floor(dto.mapPoint.x),
      y: Math.floor(dto.mapPoint.y),
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
}
