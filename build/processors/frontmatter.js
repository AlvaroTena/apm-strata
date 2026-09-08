/**
 * Frontmatter Processing Module
 *
 * Handles YAML frontmatter parsing and validation. Frontmatter is preserved
 * verbatim in the output: this module reads it to validate, never to rewrite it.
 *
 * @module build/processors/frontmatter
 */

import yaml from 'js-yaml';
import { BuildError } from '../core/errors.js';

/**
 * Frontmatter keys the platform recognises, by template category.
 *
 * Verified against Claude Code 2.1.263 on 2026-09-09.
 *
 * This list dates, and it is meant to. The platform ignores a frontmatter key
 * it does not recognise without writing anything to stderr and without changing
 * its exit code, so a misspelled key, or one that was designed but never
 * implemented, behaves exactly like a key that works. The build is the only
 * place that sees both the file and the reference, so it is the only place that
 * can say anything at all. Extend the lists when the platform gains a field.
 *
 * @type {Object<string, string[]>}
 */
export const KNOWN_FRONTMATTER_KEYS = {
  skills: [
    'name',
    'description',
    'argument-hint',
    'disable-model-invocation',
    'allowed-tools',
    'disallowed-tools',
    'model',
    'hooks'
  ],
  agents: [
    'name',
    'description',
    'model',
    'tools',
    'disallowedTools'
  ]
};

/**
 * Lists frontmatter keys the platform does not recognise for a category.
 *
 * Returns an empty array for a category with no reference list, so an unrelated
 * category never produces noise.
 *
 * @param {Object} frontmatter - Parsed frontmatter object.
 * @param {string} category - Template category the file belongs to.
 * @returns {string[]} Unknown keys, in the order they appear in the file.
 */
export function findUnknownFrontmatterKeys(frontmatter, category) {
  const known = KNOWN_FRONTMATTER_KEYS[category];

  if (!known || !frontmatter || typeof frontmatter !== 'object') {
    return [];
  }

  return Object.keys(frontmatter).filter(key => !known.includes(key));
}

/**
 * Parses YAML frontmatter from markdown content.
 *
 * @param {string} content - Markdown content with potential frontmatter.
 * @param {string} filePath - Path to the file, used in error messages.
 * @returns {Object} Object with {frontmatter, content} properties.
 * @throws {BuildError} If the frontmatter block is not valid YAML.
 */
export function parseFrontmatter(content, filePath) {
  // Normalize line endings and remove BOM
  content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines = content.split('\n');

  if (lines[0] !== '---') {
    return { frontmatter: {}, content };
  }

  const endIndex = lines.indexOf('---', 1);

  if (endIndex === -1) {
    return { frontmatter: {}, content };
  }

  const frontmatterStr = lines.slice(1, endIndex).join('\n');
  const body = lines.slice(endIndex + 1).join('\n');

  let frontmatter;

  try {
    frontmatter = yaml.load(frontmatterStr) || {};
  } catch (err) {
    throw BuildError.templateParseFailed(filePath, err.message);
  }

  return { frontmatter, content: body };
}

/**
 * Validates the frontmatter of a skill or agent template.
 *
 * Requires `name` and `description`. When a `hooks` key is present its content
 * must be valid YAML - a hooks block written as a string is parsed to confirm it.
 *
 * @param {Object} frontmatter - Parsed frontmatter object.
 * @param {string} filePath - Path to the template file, used in error messages.
 * @returns {Object} Validation result with {valid, errors} properties.
 */
export function validateFrontmatter(frontmatter, filePath) {
  const errors = [];

  for (const field of ['name', 'description']) {
    const value = frontmatter[field];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`missing required frontmatter field "${field}" in ${filePath}`);
    }
  }

  if (typeof frontmatter.hooks === 'string') {
    try {
      yaml.load(frontmatter.hooks);
    } catch (err) {
      errors.push(`invalid YAML in "hooks" frontmatter of ${filePath}: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parses and validates a skill or agent template, throwing on invalid frontmatter.
 *
 * @param {string} content - Raw template content.
 * @param {string} filePath - Path to the template file, used in error messages.
 * @returns {Object} Parsed frontmatter object.
 * @throws {BuildError} If the frontmatter is missing required fields or malformed.
 */
export function assertValidFrontmatter(content, filePath) {
  const { frontmatter } = parseFrontmatter(content, filePath);
  const { valid, errors } = validateFrontmatter(frontmatter, filePath);

  if (!valid) {
    throw BuildError.frontmatterInvalid(filePath, errors);
  }

  return frontmatter;
}

export default {
  KNOWN_FRONTMATTER_KEYS,
  parseFrontmatter,
  validateFrontmatter,
  assertValidFrontmatter,
  findUnknownFrontmatterKeys
};
