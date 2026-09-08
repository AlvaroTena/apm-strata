/**
 * Knowledge Process Execution Module
 *
 * Runs external programs for knowledge layer adapters. Arguments are passed as
 * an array and never interpolated into a shell string.
 *
 * @module src/services/knowledge/exec
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Default time budget for a single external command.
 */
const DEFAULT_TIMEOUT = 300000;

/**
 * Runs an external command and captures its output.
 *
 * @param {string} command - Executable name or path.
 * @param {string[]} args - Arguments passed without shell interpretation.
 * @param {Object} [options={}] - Execution options.
 * @param {string} [options.cwd] - Working directory.
 * @param {number} [options.timeout=300000] - Timeout in milliseconds.
 * @returns {Promise<Object>} Result as { stdout, stderr }.
 * @throws {Error} When the command is missing or exits non-zero.
 */
export async function run(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: options.cwd,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    maxBuffer: 16 * 1024 * 1024,
    encoding: 'utf8'
  });
  return { stdout, stderr };
}

export default { run };
