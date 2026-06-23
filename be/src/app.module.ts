import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccessTokenAuthMiddleware } from "./common/auth/access-token-auth.middleware";
import { getRuntimeEnvFilePaths } from "./common/utils/runtime-env";
import { DatabaseModule } from "./database/database.module";
import { ActionsModule } from "./modules/actions/actions.module";
import { AiModule } from "./modules/ai/ai.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { CharactersModule } from "./modules/characters/characters.module";
import { CombatModule } from "./modules/combat/combat.module";
import { HealthModule } from "./modules/health/health.module";
import { RacesModule } from "./modules/races/races.module";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { RulesModule } from "./modules/rules/rules.module";
import { ScenariosModule } from "./modules/scenarios/scenarios.module";
import { SessionsModule } from "./modules/sessions/sessions.module";
import { TurnLogsModule } from "./modules/turn-logs/turn-logs.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getRuntimeEnvFilePaths(),
      ignoreEnvFile: process.env.TRPG_E2E === "1",
    }),
    DatabaseModule,
    UsersModule,
    ScenariosModule,
    RealtimeModule,
    SessionsModule,
    CharactersModule,
    CatalogModule,
    RacesModule,
    HealthModule,
    RulesModule,
    TurnLogsModule,
    ActionsModule,
    CombatModule,
    AiModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AccessTokenAuthMiddleware).forRoutes("*");
  }
}
