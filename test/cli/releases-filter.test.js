/**
 * Tests for major-version filtering of releases.
 */

import { describe, it, expect } from 'vitest';
import { filterByMajorVersion } from '../../src/services/releases.js';

/**
 * Builds a release stub carrying only the tag the filter reads.
 */
function release(tag) {
  return { tag_name: tag };
}

describe('filterByMajorVersion', () => {
  it('keeps only releases whose major version matches', () => {
    const releases = [release('v1.0.0'), release('v2.0.0'), release('v1.4.2'), release('v0.9.9')];
    expect(filterByMajorVersion(releases, 1).map(r => r.tag_name)).toEqual(['v1.0.0', 'v1.4.2']);
  });

  it('keeps pre-release tags of the matching major version', () => {
    const releases = [release('v1.0.0-beta-1'), release('v2.0.0-beta-1')];
    expect(filterByMajorVersion(releases, 1).map(r => r.tag_name)).toEqual(['v1.0.0-beta-1']);
  });

  it('accepts tags with and without the leading v', () => {
    const releases = [release('1.2.3'), release('v1.2.4')];
    expect(filterByMajorVersion(releases, 1)).toHaveLength(2);
  });

  it('drops tags that are not semantic versions', () => {
    const releases = [release('latest'), release('v1'), release('v1.2'), release('v1.2.3')];
    expect(filterByMajorVersion(releases, 1).map(r => r.tag_name)).toEqual(['v1.2.3']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterByMajorVersion([release('v2.0.0')], 1)).toEqual([]);
  });
});
