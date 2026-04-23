import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { seedDefaultScenario } from "./seed/default-scenario";

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // 서버가 처음 켜졌을 때 기본 시나리오가 없으면 자동으로 채운다.
    // 개발자가 별도 데이터를 먼저 넣지 않아도
    // 세션 생성 API를 바로 호출해 전체 흐름을 확인할 수 있게 하려는 목적이다.
    await seedDefaultScenario(this.prisma);
  }
}
