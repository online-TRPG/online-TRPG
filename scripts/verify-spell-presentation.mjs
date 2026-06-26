import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function addMatches(target, text, regex, prefix = "") {
  let match;
  while ((match = regex.exec(text))) {
    target.add(`${prefix}${match[1]}`);
  }
}

const sourceSpellIds = new Set();

addMatches(
  sourceSpellIds,
  read("be/src/modules/rules/rule-catalog.service.ts"),
  /spell\("(spell\.[a-z0-9_]+)"/g,
);

for (const fileName of [
  "p3-spell-definitions.ts",
  "p4-spell-definitions.ts",
  "p5-spell-definitions.ts",
]) {
  addMatches(
    sourceSpellIds,
    read(`be/src/modules/rules/${fileName}`),
    /p[345]Spell\("([a-z0-9_]+)"/g,
    "spell.",
  );
}

addMatches(
  sourceSpellIds,
  read("be/src/modules/rules/p6-spell-definitions.ts"),
  /\["([a-z0-9_]+)",\s*\d+/g,
  "spell.",
);

const presentationText = read("fe/src/features/spells/spellPresentation.ts");
const overrideEntries = [
  ...presentationText.matchAll(
    /'(?<id>spell\.[a-z0-9_]+)':\s*spell\([^,]+,\s*'[^']+',\s*'(?<icon>game-icons:[^']+)'/g,
  ),
].map((match) => ({
  id: match.groups.id,
  iconName: match.groups.icon,
}));

const overrideIds = new Set(overrideEntries.map((entry) => entry.id));
const missingOverrides = [...sourceSpellIds]
  .filter((spellId) => !overrideIds.has(spellId))
  .sort();
const extraOverrides = [...overrideIds]
  .filter((spellId) => !sourceSpellIds.has(spellId))
  .sort();

const iconOwnersByName = new Map();
for (const entry of overrideEntries) {
  const owners = iconOwnersByName.get(entry.iconName) ?? [];
  owners.push(entry.id);
  iconOwnersByName.set(entry.iconName, owners);
}

const duplicateIcons = [...iconOwnersByName.entries()]
  .filter(([, owners]) => owners.length > 1)
  .map(([iconName, owners]) => ({ iconName, owners: owners.sort() }))
  .sort((left, right) => left.iconName.localeCompare(right.iconName));

const report = {
  sourceSpellCount: sourceSpellIds.size,
  overrideCount: overrideIds.size,
  missingOverrideCount: missingOverrides.length,
  extraOverrideCount: extraOverrides.length,
  duplicateIconCount: duplicateIcons.length,
  missingOverrides,
  extraOverrides,
  duplicateIcons,
};

console.log(JSON.stringify(report, null, 2));

if (
  missingOverrides.length > 0 ||
  extraOverrides.length > 0 ||
  duplicateIcons.length > 0
) {
  process.exitCode = 1;
}
