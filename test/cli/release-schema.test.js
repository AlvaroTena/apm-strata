/**
 * Tests for the release manifest schema validator.
 */

import { describe, it, expect } from 'vitest';
import { validateReleaseManifest } from '../../src/schemas/release.js';

/**
 * Builds a minimal valid manifest, optionally overriding the assistant fields.
 */
function manifest(assistantOverrides = {}) {
  return {
    version: '1.0.0',
    assistants: [
      {
        id: 'claude',
        name: 'Claude Code',
        bundle: 'claude.zip',
        configDir: '.claude',
        ...assistantOverrides
      }
    ]
  };
}

describe('validateReleaseManifest', () => {
  it('accepts a manifest with only the required fields', () => {
    expect(validateReleaseManifest(manifest())).toEqual({ valid: true, errors: [] });
  });

  it('accepts the optional description and postInstallNote fields', () => {
    const result = validateReleaseManifest(
      manifest({ description: 'Optimized for Claude Code', postInstallNote: 'Restart the assistant.' })
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a non-object manifest', () => {
    expect(validateReleaseManifest(null)).toEqual({
      valid: false,
      errors: ['Manifest must be an object']
    });
  });

  it('requires version and a non-empty assistants array', () => {
    const result = validateReleaseManifest({ assistants: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('version: required string');
    expect(result.errors).toContain('assistants: must not be empty');
  });

  it('reports every missing required assistant field with its index', () => {
    const result = validateReleaseManifest({ version: '1.0.0', assistants: [{}] });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'assistants[0].id: required string',
      'assistants[0].name: required string',
      'assistants[0].bundle: required string',
      'assistants[0].configDir: required string'
    ]);
  });

  it('rejects path traversal in configDir and bundle', () => {
    const result = validateReleaseManifest(
      manifest({ configDir: '../outside', bundle: '../claude.zip' })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assistants[0].configDir: must not contain path traversal sequences');
    expect(result.errors).toContain('assistants[0].bundle: must not contain path traversal sequences');
  });

  it('rejects optional fields of the wrong type', () => {
    const result = validateReleaseManifest(manifest({ description: 42, postInstallNote: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assistants[0].description: must be a string if provided');
    expect(result.errors).toContain('assistants[0].postInstallNote: must be a string if provided');
  });
});
