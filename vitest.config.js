import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Worktree checkouts carry their own copy of test/. Without these entries the
    // suite runs once per worktree and a branch under review can fail the gate.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '.apm/**',
      '.claude/worktrees/**',
    ],
  },
});
