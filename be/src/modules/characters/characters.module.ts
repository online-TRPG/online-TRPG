import { Module } from "@nestjs/common";
import { SessionsModule } from "../sessions/sessions.module";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./characters.service";

@Module({
  imports: [SessionsModule],
  controllers: [CharactersController],
  providers: [CharactersService],
})
export class CharactersModule {}
