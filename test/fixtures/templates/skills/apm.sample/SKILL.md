---
name: apm.sample
description: Fixture skill used to exercise skill emission.
hooks: |
  SessionStart:
    - command: sample-hook.sh
---

# Sample Skill

Invoke with {SKILL_NAME:sample}, which runs {HOOK_PATH:sample-hook}.

Rules live in `{RULES_FILE}`.
