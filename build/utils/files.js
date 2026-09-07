/**
 * File Utilities Module
 *
 * Provides file discovery utilities for the build system.
 *
 * @module build/utils/files
 */

import fs from 'fs-extra';
import path from 'path';
import logger from './logger.js';

/**
 * Template categories, derived from the top-level source directory a file lives in.
 * @type {string[]}
 */
export const TEMPLATE_CATEGORIES = ['guides', 'skills', 'agents', 'hooks'];

/**
 * Categories whose directories are copied whole: every file is collected
 * regardless of extension, so skills can ship reference files and hooks
 * can ship scripts.
 * @type {Set<string>}
 */
const UNFILTERED_CATEGORIES = new Set(['skills', 'hooks']);

/**
 * Source directories that are never processed as templates.
 * @type {Set<string>}
 */
const IGNORED_DIRECTORIES = new Set(['_standards', 'apm']);

/**
 * Recursively collects files below a category directory.
 *
 * @param {string} dir - Directory to walk.
 * @param {boolean} unfiltered - When true, collect every file; otherwise only .md files.
 * @returns {Promise<string[]>} Array of absolute file paths.
 */
async function collectFiles(dir, unfiltered) {
  const files = [];
  const items = await fs.readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      files.push(...await collectFiles(fullPath, unfiltered));
      continue;
    }

    if (!item.isFile() || item.name === 'README.md') {
      continue;
    }

    if (unfiltered || item.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Finds all template files, tagging each with the category it belongs to.
 *
 * Category is derived from the top-level directory under sourceDir. Files under
 * skills/ and hooks/ are collected whole; guides/ and agents/ only contribute
 * markdown. Unknown top-level directories are skipped with a warning.
 *
 * @param {string} sourceDir - Templates directory to search.
 * @returns {Promise<Array<{path: string, category: string}>>} Discovered templates.
 */
export async function findTemplateFiles(sourceDir) {
  const templates = [];
  const items = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const item of items) {
    if (!item.isDirectory() || IGNORED_DIRECTORIES.has(item.name)) {
      continue;
    }

    if (!TEMPLATE_CATEGORIES.includes(item.name)) {
      logger.warn(`Skipping "${item.name}/": not a template category`);
      continue;
    }

    const category = item.name;
    const files = await collectFiles(
      path.join(sourceDir, category),
      UNFILTERED_CATEGORIES.has(category)
    );

    templates.push(...files.map(filePath => ({ path: filePath, category })));
  }

  return templates;
}

export default { TEMPLATE_CATEGORIES, findTemplateFiles };
