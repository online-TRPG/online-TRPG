import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { RacesModule } from "../races/races.module";
import { RulesModule } from "../rules/rules.module";
import { SessionsModule } from "../sessions/sessions.module";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./characters.service";

@Module({
  imports: [SessionsModule, RacesModule, CatalogModule, RulesModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
