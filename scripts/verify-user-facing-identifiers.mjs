import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoot = join(root, 'fe', 'src');
const identifierExpression = />\s*\{[^}\n]*(?:\.id\b|\b[A-Za-z][A-Za-z0-9]*Id\b)[^}\n]*\}\s*</;
const rawEnumExpression = />\s*\{[^}\n]*(?:\.status|\.visibility|\.role|\.phase|\.gmMode)[^}\n]*\}\s*</;
const rawEnumText = />[^<]*(?:RECRUITING|PLAYING|PAUSED|DISBANDED|UNPUBLISHED|HUMAN GM|Coming soon)[^<]*</;
const allowlistedFiles = new Set([
  'fe/src/pages/RulebookPage.tsx',
]);
const presentationWrapperExpression = /(?:get[A-Za-z0-9]+Label|formatPublishStatus)\s*\(|(?:Labels|Presentation)\s*[.[]|\.statusLabel\b|\.phaseLabel\b/;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

const failures = [];
for (const file of await listFiles(sourceRoot)) {
  if (extname(file) !== '.tsx') continue;
  const projectPath = relative(root, file).replaceAll('\\', '/');
  if (allowlistedFiles.has(projectPath)) continue;
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (presentationWrapperExpression.test(trimmed)) return;
    if (
      identifierExpression.test(trimmed) ||
      rawEnumExpression.test(trimmed) ||
      rawEnumText.test(trimmed)
    ) {
      failures.push(`${projectPath}:${index + 1}: ${trimmed}`);
    }
  });
}

if (failures.length) {
  process.stderr.write([
    '사용자 화면에 내부 식별자 또는 raw enum으로 보이는 표현이 있습니다.',
    ...failures,
    '표시용 label/이름으로 변환하거나, 실제 비표시 용도라면 좁은 파일 allowlist를 검토하세요.',
    '',
  ].join('\n'));
  process.exitCode = 1;
} else {
  process.stdout.write('사용자 화면 식별자 정적 검사를 통과했습니다.\n');
}
