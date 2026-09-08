/**
 * Task Log Claims Module
 *
 * Parses the claims section of a task log. The section is a project-level
 * convention, not a knowledge tool format, so this module stays free of any
 * consumer detail: it turns markdown into records and validates their shape.
 *
 * Expected section:
 *
 *   ## Claims
 *   - claim: <falsifiable statement this task supports>
 *     evidence: <path:line, commit, test or output that proves it>
 *     supersedes: <prior claim id or none>
 *
 * A task with nothing to claim writes `none` as the whole section body.
 *
 * @module src/services/knowledge/claims
 */

import { CLIError } from '../../core/errors.js';

/**
 * Heading that opens the claims section.
 */
const SECTION_HEADING = /^##\s+Claims\s*$/i;

/**
 * Any level-two-or-higher heading, which closes the section.
 */
const CLOSING_HEADING = /^#{1,2}\s+\S/;

/**
 * Opening line of a claim entry.
 */
const CLAIM_LINE = /^-\s+claim:\s*(.*)$/i;

/**
 * Continuation line carrying one field of the current entry.
 */
const FIELD_LINE = /^\s+(evidence|supersedes):\s*(.*)$/i;

/**
 * Literal that marks an absent value.
 */
const NONE = 'none';

/**
 * Extracts the raw body of the claims section.
 *
 * @param {string} markdown - Task log contents.
 * @returns {string[]|null} Section lines, or null when the section is absent.
 */
function sectionLines(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex(line => SECTION_HEADING.test(line));
  if (start === -1) return null;

  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (CLOSING_HEADING.test(line)) break;
    body.push(line);
  }
  return body;
}

/**
 * Validates one parsed entry.
 *
 * @param {Object} entry - Entry under construction.
 * @param {number} position - 1-based position in the section.
 * @param {string} file - Task log path, for error messages.
 * @throws {CLIError} When a required field is missing or malformed.
 */
function validateEntry(entry, position, file) {
  if (!entry.claim) {
    throw CLIError.taskLogInvalid(file, `claim ${position} has an empty claim`);
  }
  if (!entry.evidence) {
    throw CLIError.taskLogInvalid(file, `claim ${position} ("${entry.claim}") has no evidence`);
  }
  if (entry.supersedes !== null && !entry.supersedes.startsWith('clm-')) {
    throw CLIError.taskLogInvalid(
      file,
      `claim ${position} supersedes "${entry.supersedes}", which is not a claim id; use a clm- id or none`
    );
  }
}

/**
 * Parses the claims section of a task log.
 *
 * @param {string} markdown - Task log contents.
 * @param {string} [file='task log'] - Path used in error messages.
 * @returns {Object[]} Claims as { claim, evidence, supersedes }, empty when the
 *   section declares none.
 * @throws {CLIError} When the section is missing or an entry is malformed.
 */
export function parseClaims(markdown, file = 'task log') {
  const body = sectionLines(markdown);
  if (body === null) {
    throw CLIError.taskLogInvalid(file, 'no "## Claims" section; a task with nothing to claim writes none');
  }

  const meaningful = body.filter(line => line.trim());
  if (meaningful.length === 1 && meaningful[0].trim().toLowerCase() === NONE) {
    return [];
  }
  if (!meaningful.length) {
    throw CLIError.taskLogInvalid(file, 'the "## Claims" section is empty; write none when there is nothing to claim');
  }

  const claims = [];
  let current = null;

  for (const line of body) {
    if (!line.trim()) continue;

    const opening = CLAIM_LINE.exec(line);
    if (opening) {
      if (current) {
        validateEntry(current, claims.length + 1, file);
        claims.push(current);
      }
      current = { claim: opening[1].trim(), evidence: '', supersedes: null };
      continue;
    }

    const field = FIELD_LINE.exec(line);
    if (field) {
      if (!current) {
        throw CLIError.taskLogInvalid(file, `"${field[1].toLowerCase()}" appears before any claim`);
      }
      const value = field[2].trim();
      if (field[1].toLowerCase() === 'evidence') {
        current.evidence = value;
      } else {
        current.supersedes = value.toLowerCase() === NONE ? null : value;
      }
      continue;
    }

    throw CLIError.taskLogInvalid(file, `unrecognized line in the claims section: "${line.trim()}"`);
  }

  if (current) {
    validateEntry(current, claims.length + 1, file);
    claims.push(current);
  }

  return claims;
}

export default { parseClaims };
