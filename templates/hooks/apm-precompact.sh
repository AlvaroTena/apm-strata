#!/bin/sh
#
# APM pre-compaction reminder.
#
# A PreCompact hook. It never blocks: compaction proceeds either way, and this
# hook only leaves a reminder that context was compacted and that the recovery
# skill rebuilds what the agent lost.
#
# Plain stdout does not reach the user or the model on this event - it goes to
# the debug log - so the reminder is emitted as JSON. The field is written in
# both documented positions because the platform documentation disagrees with
# itself about which one this event honors; an ignored field is inert, while a
# missing one loses the message.
#
# Exit is always 0. Exit 2 on this event would block compaction.
#
# POSIX sh. No dependencies.

set -u

MESSAGE="APM: the context window was compacted. Run the APM recovery skill to rebuild working context before continuing - re-read the initiation instructions, then the project artifacts. Note the recovery in the next report."

cat <<JSON
{
  "systemMessage": "${MESSAGE}",
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "systemMessage": "${MESSAGE}"
  }
}
JSON

exit 0
