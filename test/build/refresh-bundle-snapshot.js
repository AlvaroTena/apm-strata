/**
 * Rewrites the bundle path snapshot used by bundle.test.js.
 *
 * Run after an intentional change to templates/:
 *
 *   node test/build/refresh-bundle-snapshot.js
 */

import fs from 'fs-extra';
import path from 'path';
import { repoRoot, readTarget, makeTempDir, runBuild, readBundle } from './support.js';

const snapshotPath = path.join(repoRoot, 'test', 'fixtures', 'bundle-paths.json');

const { dir, cleanup } = await makeTempDir();

try {
  const { entries } = await runBuild({
    sourceDir: path.join(repoRoot, 'templates'),
    outputDir: dir,
    target: await readTarget()
  });

  const { paths } = readBundle(entries);
  await fs.writeJson(snapshotPath, paths, { spaces: 2 });
  console.log(`Wrote ${paths.length} paths to ${path.relative(repoRoot, snapshotPath)}`);
} finally {
  await cleanup();
}
