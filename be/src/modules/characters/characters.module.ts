import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { RacesModule } from "../races/races.module";
import { RulesModule } from "../rules/rules.module";
import { SessionsModule } from "../sessions/sessions.module";
import { CharactersController } from "./characters.controller";
import { CharacterAvatarAssetService } from "./character-avatar-asset.service";
import { CharacterCreationService } from "./character-creation.service";
import { CharacterEquipmentLoadoutService } from "./character-equipment-loadout.service";
import { CharacterFeatureSnapshotService } from "./character-feature-snapshot.service";
import { CharacterSpellSelectionService } from "./character-spell-selection.service";
import { CharactersService } from "./characters.service";

@Module({
  imports: [SessionsModule, RacesModule, CatalogModule, RulesModule],
  controllers: [CharactersController],
  providers: [
    CharactersService,
    CharacterAvatarAssetService,
    CharacterCreationService,
    CharacterEquipmentLoadoutService,
    CharacterFeatureSnapshotService,
    CharacterSpellSelectionService,
  ],
})
export class CharactersModule {}
