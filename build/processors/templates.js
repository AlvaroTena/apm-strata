/**
 * Template Processing Module
 *
 * Orchestrates template processing for all targets.
 *
 * @module build/processors/templates
 */

import fs from 'fs-extra';
import path from 'path';
import logger from '../utils/logger.js';
import { findTemplateFiles } from '../utils/files.js';
import { assertValidFrontmatter, findUnknownFrontmatterKeys } from './frontmatter.js';
import { replacePlaceholders } from './placeholders.js';
import { generateReleaseManifest } from '../generators/manifest.js';
import { createZipArchive } from '../generators/archive.js';
import { getVersion } from '../core/config.js';
import { BuildError } from '../core/errors.js';

/**
 * File extensions that carry placeholders. Everything else is copied byte for byte.
 * @type {Set<string>}
 */
const SUBSTITUTED_EXTENSIONS = new Set(['.md', '.sh']);

/**
 * Categories emitted as whole directory trees, preserving their internal layout.
 * @type {Set<string>}
 */
const RECURSIVE_CATEGORIES = new Set(['skills', 'hooks']);

/**
 * Resolves the output path for a template file.
 *
 * Guides and agents are emitted flat. Skills and hooks keep the directory
 * structure they have below their category directory, so a skill can ship
 * reference files and a hooks tree can be nested.
 *
 * @param {Object} template - Discovered template with {path, category}.
 * @param {string} sourceDir - Source templates directory.
 * @param {Object} outputDirs - Output directory per category.
 * @returns {string} Absolute output path.
 */
function resolveOutputPath(template, sourceDir, outputDirs) {
  const { path: templatePath, category } = template;
  const categoryDir = outputDirs[category];

  if (RECURSIVE_CATEGORIES.has(category)) {
    // Path below templates/<category>/, e.g. 'apm.communication/references/x.json'
    const relativePath = path.relative(path.join(sourceDir, category), templatePath);
    return path.join(categoryDir, relativePath);
  }

  return path.join(categoryDir, path.basename(templatePath));
}

/**
 * Processes a single template file.
 *
 * @param {Object} template - Discovered template with {path, category}.
 * @param {Object} options - Processing options.
 * @returns {Promise<void>}
 */
async function processTemplate(template, options) {
  const { target, version, outputDirs, targetBuildDir, sourceDir } = options;
  const { path: templatePath, category } = template;

  const outputPath = resolveOutputPath(template, sourceDir, outputDirs);
  await fs.ensureDir(path.dirname(outputPath));

  const extension = path.extname(templatePath);

  if (!SUBSTITUTED_EXTENSIONS.has(extension)) {
    // Support files are copied verbatim, permissions included
    await fs.copy(templatePath, outputPath, { preserveTimestamps: true });
    logger.info(`${category}: ${path.basename(templatePath)} → ${path.relative(targetBuildDir, outputPath)}`);
    return;
  }

  const content = await fs.readFile(templatePath, 'utf8');

  // Skills and agents declare themselves in frontmatter; guides and hooks do not
  const isSkillEntry = category === 'skills' && path.basename(templatePath) === 'SKILL.md';
  if (isSkillEntry || category === 'agents') {
    const relativePath = path.relative(sourceDir, templatePath);
    const frontmatter = assertValidFrontmatter(content, relativePath);

    // A key the platform does not recognise is ignored silently at runtime, so
    // this warning is the only signal that a field does nothing. It never fails
    // the build: the reference list dates faster than the templates do.
    for (const key of findUnknownFrontmatterKeys(frontmatter, category)) {
      logger.warn(`${relativePath}: unknown frontmatter key "${key}"`);
    }
  }

  await fs.writeFile(outputPath, replacePlaceholders(content, { version, target }));

  // Preserve the source mode so hook scripts stay executable
  const { mode } = await fs.stat(templatePath);
  await fs.chmod(outputPath, mode);

  logger.info(`${category}: ${path.basename(templatePath)} → ${path.relative(targetBuildDir, outputPath)}`);
}

/**
 * Copies apm/ directory to .apm/ in target build directory.
 *
 * @param {string} sourceDir - Source templates directory.
 * @param {string} targetBuildDir - Target build directory.
 * @returns {Promise<void>}
 */
async function copyApmDirectory(sourceDir, targetBuildDir) {
  const apmSource = path.join(sourceDir, 'apm');
  const apmDest = path.join(targetBuildDir, '.apm');

  if (await fs.pathExists(apmSource)) {
    await fs.copy(apmSource, apmDest);
    logger.info(`Copied apm/ → .apm/`);
  }
}

/**
 * Builds a single target.
 *
 * @param {Object} target - Target configuration.
 * @param {Object} config - Full build configuration.
 * @param {string} version - Version string.
 * @returns {Promise<void>}
 */
async function buildTarget(target, config, version) {
  const { build: buildConfig } = config;
  const { outputDir, sourceDir } = buildConfig;

  const targetBuildDir = path.join(outputDir, `${target.id}-build`);
  const outputDirs = {
    guides: path.join(targetBuildDir, target.directories.guides),
    skills: path.join(targetBuildDir, target.directories.skills),
    agents: path.join(targetBuildDir, target.directories.agents),
    hooks: path.join(targetBuildDir, target.directories.hooks)
  };

  logger.info(`\nProcessing target: ${target.name} (${target.id})`);

  // Copy apm/ → .apm/
  await copyApmDirectory(sourceDir, targetBuildDir);

  // Find template files (excludes _standards/ and apm/)
  const templates = await findTemplateFiles(sourceDir);
  logger.info(`Found ${templates.length} template files`);

  for (const template of templates) {
    await processTemplate(template, {
      target,
      version,
      outputDirs,
      targetBuildDir,
      sourceDir
    });
  }

  logger.success(`Completed target: ${target.name}`);

  // Create ZIP archive
  const zipPath = path.join(outputDir, target.bundleName);
  logger.info(`Creating archive: ${target.bundleName}...`);

  try {
    await createZipArchive(targetBuildDir, zipPath);
    logger.success(`Archive created: ${target.bundleName}`);

    await fs.remove(targetBuildDir);
    logger.info(`Cleaned up: ${path.basename(targetBuildDir)}`);
  } catch (err) {
    throw BuildError.archiveFailed(target.name, err.message);
  }
}

/**
 * Main build orchestration function.
 *
 * @param {Object} config - Build configuration.
 * @returns {Promise<void>}
 */
export async function buildAll(config) {
  const { build: buildConfig, targets } = config;
  const { outputDir, cleanOutput } = buildConfig;

  if (cleanOutput) {
    await fs.emptyDir(outputDir);
  } else {
    await fs.ensureDir(outputDir);
  }

  const version = await getVersion();
  logger.info(`Building ${targets.length} targets to ${outputDir}...`);

  for (const target of targets) {
    await buildTarget(target, config, version);
  }

  // Write release manifest
  const releaseManifest = generateReleaseManifest(config, version);
  const releaseManifestPath = path.join(outputDir, 'apm-release.json');
  await fs.writeFile(releaseManifestPath, JSON.stringify(releaseManifest, null, 2));
  logger.success(`Generated apm-release.json`);

  logger.success('\nBuild completed successfully!');
}

export default { buildAll };
