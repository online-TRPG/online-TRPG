import { Global, Module } from "@nestjs/common";
import { DatabaseSeedService } from "./database-seed.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService, DatabaseSeedService],
  exports: [PrismaService],
})
export class DatabaseModule {}
