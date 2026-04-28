import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { AiModule } from "./modules/ai/ai.module";
import { CharactersModule } from "./modules/characters/characters.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { ScenariosModule } from "./modules/scenarios/scenarios.module";
import { SessionsModule } from "./modules/sessions/sessions.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", ".env.local"],
    }),
    DatabaseModule,
    UsersModule,
    ScenariosModule,
    RealtimeModule,
    SessionsModule,
    CharactersModule,
    AiModule,
  ],
})
export class AppModule {}
