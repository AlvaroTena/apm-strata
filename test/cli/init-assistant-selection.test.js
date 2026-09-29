/**
 * Tests that `apm init` only asks which assistant to install when the release
 * manifest offers more than one.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const select = vi.fn();

vi.mock('@inquirer/prompts', () => ({
  select,
  input: vi.fn(),
  confirm: vi.fn(),
  Separator: class {
    constructor(line) {
      this.separator = line;
    }
  }
}));

vi.mock('../../src/ui/logger.js', () => {
  const noop = vi.fn();
  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    success: noop,
    debug: noop,
    dim: noop,
    blank: noop,
    line: noop,
    banner: noop,
    clearAndBanner: noop,
    progress: vi.fn(() => vi.fn())
  };
  return { ...logger, default: logger };
});

const readMetadata = vi.fn();
const writeMetadata = vi.fn();

vi.mock('../../src/core/metadata.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, readMetadata, writeMetadata };
});

const fetchOfficialReleases = vi.fn();
const fetchReleaseManifest = vi.fn();

vi.mock('../../src/services/releases.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, fetchOfficialReleases, fetchReleaseManifest };
});

const downloadAndExtract = vi.fn();

vi.mock('../../src/services/extractor.js', () => ({
  downloadAndExtract,
  default: { downloadAndExtract }
}));

// Declaring hooks writes the settings file under the working directory, which
// here is the repository itself.
vi.mock('../../src/services/settings.js', () => {
  const installApmHooks = vi.fn();
  return { installApmHooks, default: { installApmHooks } };
});

const { initCommand } = await import('../../src/commands/init.js');

/**
 * Builds an assistant entry plus the release asset that carries its bundle.
 */
function assistant(id, name) {
  return { id, name, bundle: `${id}.zip`, configDir: `.${id}`, description: `${name} bundle` };
}

/**
 * Builds a release exposing a bundle asset for each given assistant.
 */
function release(assistants) {
  return {
    tag_name: 'v1.0.0',
    assets: assistants.map(a => ({
      name: a.bundle,
      browser_download_url: `https://example.invalid/${a.bundle}`
    }))
  };
}

/**
 * Arranges a fresh workspace served by a release with the given assistants.
 */
function givenRelease(assistants) {
  const target = release(assistants);
  readMetadata.mockResolvedValue(null);
  fetchOfficialReleases.mockResolvedValue([target]);
  fetchReleaseManifest.mockResolvedValue({ version: '1.0.0', assistants });
  downloadAndExtract.mockResolvedValue(['.claude/commands/apm-3-initiate-worker.md', '.apm/plan.md']);
}

describe('initCommand assistant selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs the only assistant without prompting', async () => {
    givenRelease([assistant('claude', 'Claude Code')]);

    await initCommand();

    expect(select).not.toHaveBeenCalled();
    expect(writeMetadata).toHaveBeenCalledTimes(1);
    expect(writeMetadata.mock.calls[0][0].assistants).toEqual(['claude']);
  });

  it('prompts when the manifest offers more than one assistant', async () => {
    givenRelease([assistant('claude', 'Claude Code'), assistant('codex', 'Codex')]);
    select.mockResolvedValue('codex');

    await initCommand();

    expect(select).toHaveBeenCalledTimes(1);
    expect(writeMetadata.mock.calls[0][0].assistants).toEqual(['codex']);
  });
});
