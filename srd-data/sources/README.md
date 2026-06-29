# SRD Source Inputs

This directory is for structured source inputs that are not derived from local runtime code.

## spell-class-lists.json

`spell-class-lists.json` is the canonical source for full SRD class spell lists.
It is generated from the D&D 5e API 2014 SRD spell endpoint by:

```bash
npm run import:spell-class-lists -w @trpg/srd-data
```

It must use this shape:

```json
{
  "schemaVersion": "srd-spell-class-lists-v1",
  "classes": {
    "wizard": {
      "cantrips": ["spell.fire_bolt"],
      "spellsByLevel": {
        "1": ["spell.magic_missile"]
      }
    }
  }
}
```

Rules:

- Class keys must match generated SRD class keys.
- Spell ids must exist in `srd-data/generated/srd/spells.jsonl`.
- `cantrips` may contain only level 0 spells.
- `spellsByLevel` keys must be spell levels 1 through 9.
- Each spell id may appear at most once per class.
- Do not fill this file from guesses or UI fallback pools.

`srd-data/scripts/generate-canonical-artifacts.mjs` requires this source file, validates
the structural checks above, and then writes it to
`srd-data/generated/srd/spell-class-lists.json`. If this source is missing or invalid,
`npm run build -w @trpg/srd-data` fails.
