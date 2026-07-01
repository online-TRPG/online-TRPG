# SRD Override Inputs

This directory contains narrow, id-based override inputs used to generate canonical
SRD artifacts. These files are source inputs, not FE/BE runtime copies.

Allowed override types:

- `class-feature-summaries.json`: Korean display name/summary fill-ins for canonical
  class feature ids that are missing usable generated text.
- `fe-spell-pools.json`: FE operational spell pools for character builder and
  quick-create UX. Spell ids must exist in generated SRD spells and match level/class
  guards enforced by `verify:rule-data-sync`.
- `fe-usable-items.json`: FE session-play item ids that may show direct-use controls.
  Item ids must exist in generated SRD equipment or magic item catalogs.
- `non-srd-spell-runtime-ids.json`: explicit allowlist for BE executable spell ids
  that are outside the generated SRD spell catalog.
- `non-srd-monster-runtime-ids.json`: explicit allowlist for BE executable monster ids
  that are outside the generated SRD monster catalog.

Rules:

- Overrides must be keyed by canonical ids or explicit non-SRD runtime ids.
- Do not duplicate SRD names, levels, spell ownership, race traits, item labels, or
  monster stats here when generated SRD data can provide them.
- Do not add character creation, level-up, prepared-spell, known-spell, cantrip, or
  spell slot progression calculations here. Update `@trpg/srd-data/rules` when a
  character rule interpretation changes.
- FE-only overrides are limited to presentation or UX selection pools.
- BE-only runtime metadata remains in BE runtime definitions, but ids must be checked
  against canonical generated SRD artifacts or the explicit non-SRD allowlists above.
- After changing any file here, regenerate artifacts with
  `npm run build -w @trpg/srd-data`, sync FE assets with `npm run sync:fe:srd`, and
  verify drift with `npm run verify:rule-data-sync`.
