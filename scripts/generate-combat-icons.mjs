import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = resolve(root, "node_modules/@iconify-json/game-icons");
const outputRoot = resolve(root, "fe/public/assets/combat-icons");
const iconSet = JSON.parse(await readFile(resolve(packageRoot, "icons.json"), "utf8"));
const info = JSON.parse(await readFile(resolve(packageRoot, "info.json"), "utf8"));

async function writeFileIfChanged(path, content) {
  let existingContent;
  try {
    existingContent = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  if (existingContent === content) {
    return false;
  }

  await writeFile(path, content, "utf8");
  return true;
}

const selections = {
  damage: {
    acid: "acid-blob",
    bludgeoning: "hammer-drop",
    cold: "snowflake-1",
    fire: "flame",
    force: "mighty-force",
    lightning: "lightning-frequency",
    necrotic: "death-skull",
    piercing: "piercing-sword",
    poison: "poison-bottle",
    psychic: "brain",
    radiant: "sun-radiations",
    slashing: "crossed-slashes",
    thunder: "sonic-boom",
    untyped: "abstract-084",
  },
  condition: {
    blinded: "blindfold",
    charmed: "charm",
    deafened: "sound-off",
    exhaustion: "sleepy",
    frightened: "terror",
    grappled: "grab",
    incapacitated: "knocked-out-stars",
    invisible: "invisible",
    paralyzed: "frozen-body",
    petrified: "stone-bust",
    poisoned: "poison",
    prone: "falling",
    restrained: "crossed-chains",
    stunned: "stun-grenade",
    unconscious: "coma",
    dodge: "dodge",
    disengage: "run",
    hidden: "hidden",
    sleep: "night-sleep",
    burning: "burning-round-shot",
    concentration: "meditation",
    rage: "muscle-up",
    fallback: "aura",
  },
  healing: {
    hp: "health-increase",
    temporary_hp: "shield",
    revive: "life-support",
  },
};

await mkdir(outputRoot, { recursive: true });
let updatedFileCount = 0;

for (const [category, entries] of Object.entries(selections)) {
  const categoryRoot = resolve(outputRoot, category);
  await mkdir(categoryRoot, { recursive: true });
  for (const [localName, iconName] of Object.entries(entries)) {
    const icon = iconSet.icons[iconName];
    if (!icon) {
      throw new Error(`Missing Game Icons glyph: ${iconName}`);
    }
    const width = icon.width ?? iconSet.width ?? 512;
    const height = icon.height ?? iconSet.height ?? 512;
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" color="white"',
      ` viewBox="0 0 ${width} ${height}"`,
      ' role="img" aria-hidden="true" focusable="false">',
      `<g fill="white">${icon.body}</g>`,
      "</svg>\n",
    ].join("");
    if (await writeFileIfChanged(resolve(categoryRoot, `${localName}.svg`), svg)) {
      updatedFileCount += 1;
    }
  }
}

const manifest = {
  source: info.author,
  license: info.license,
  selections,
};
if (
  await writeFileIfChanged(
    resolve(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
) {
  updatedFileCount += 1;
}
if (
  await writeFileIfChanged(
    resolve(outputRoot, "LICENSE.md"),
    `# Combat icon attribution\n\nThe SVG glyphs in this directory are generated from [${info.name}](${info.author.url}) and distributed under [${info.license.title}](${info.license.url}).\n\nRun \`node scripts/generate-combat-icons.mjs\` after changing the source mapping. Exact source glyph names are recorded in \`manifest.json\`.\n`,
  )
) {
  updatedFileCount += 1;
}

const iconCount = Object.values(selections).reduce(
  (sum, group) => sum + Object.keys(group).length,
  0,
);
const generatedFileCount = iconCount + 2;
console.log(
  updatedFileCount === 0
    ? `Prepared ${iconCount} combat icons; all ${generatedFileCount} generated files are up to date.`
    : `Prepared ${iconCount} combat icons; updated ${updatedFileCount} of ${generatedFileCount} generated files.`,
);
