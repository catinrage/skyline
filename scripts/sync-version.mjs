import { readFile, writeFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = String(packageJson.version ?? '0.0.0');

await writeFile(
	new URL('../src/lib/version.ts', import.meta.url),
	`export const appVersion = '${version}';\nexport const appVersionLabel = \`v\${appVersion}\`;\n`
);
