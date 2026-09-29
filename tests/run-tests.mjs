import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const outputFile = '.test-output/transfer.test.mjs';

try {
  await build({
    entryPoints: ['tests/transfer.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: outputFile,
    alias: {
      obsidian: './tests/obsidian.ts',
    },
  });
  await import(`${pathToFileURL(`${process.cwd()}/${outputFile}`).href}?${Date.now()}`);
} finally {
  await rm('.test-output', { recursive: true, force: true });
}
