# SRD Character Rule Resolvers

This folder owns SRD character creation, level-up, and spell progression rule
interpretation for FE and BE.

## Data Sources

- `srd-data/generated/srd/classes.json`
  - class identity
  - spellcasting ability
  - spellcasting progression
  - prepared spell formula markers in `spellcasting.formulaList`
  - legacy starting cantrip/spell fallback fields
- executable spell pools passed by FE/BE
  - current runnable cantrip and slot spell availability
  - quick-create and character-builder pool limits

## Public Entrypoint

Consumers import from `@trpg/srd-data/rules`.

```ts
import {
  resolveCharacterSpellSelectionRequirements,
  resolveKnownSpellDelta,
  resolveCrossedAbilityScoreImprovementLevels,
  resolveSubclassChoiceLevel,
  resolvePreparedSpellLimit,
  resolveMaximumCastableSpellLevel,
  resolveSpellSlotLimit,
} from "@trpg/srd-data/rules";
```

FE may use these helpers for preview, disabled states, and form limits. BE must
use the same helpers for request validation. Do not copy cantrip counts, known
spell progression, known spell replacement eligibility, subclass choice level,
ASI/Feat level eligibility, prepared spell formulas, prepared caster class
lists, wizard spellbook rules, spell slot limit interpretation, or maximum
castable spell level calculations into FE, BE, or `shared-types`.

## Entrypoint Maintenance

- `index.cjs` is the CommonJS/BE-compatible implementation.
- `index.browser.mjs` is the browser-safe ESM implementation with a static JSON
  import.
- `index.mjs` re-exports the CJS implementation for Node ESM consumers.
- `index.d.ts` is the public type contract.

When behavior changes, keep the CJS, browser ESM, and type surfaces aligned.
`scripts/verify-rule-data-sync.mjs` checks exported names and representative
behavior parity across the rules entrypoints.

Prepared-spell support is derived from `spellcasting.formulaList` markers, not
from a local class-key list. Keep both Korean and English generated formula and
ability labels working because generated SRD artifacts may contain either form
depending on the source/import path.

Do not change only one implementation file. Any rule behavior edit must update
both `index.cjs` and `index.browser.mjs`, then extend the parity cases in
`scripts/verify-rule-data-sync.mjs` when the changed behavior is not already
covered.
