import { Module } from "@nestjs/common";
import { RacesModule } from "../races/races.module";
import { SessionsModule } from "../sessions/sessions.module";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./characters.service";

@Module({
  imports: [SessionsModule, RacesModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
