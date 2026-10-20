#!/bin/sh
#
# APM after-compaction notice.
#
# A SessionStart hook with the matcher "compact": it fires once the context
# window has been compacted. When the session ran a role skill, it adds a notice
# to the model's context telling the agent to recover before it acts. A session
# that ran no role skill gets nothing, so a plain session is never told to
# recover an APM role it never held.
#
# The notice goes out as hookSpecificOutput.additionalContext, the only output
# that reaches the model. A systemMessage is shown to the person and never
# enters the context, and the recovery skill cannot be invoked by the model, so
# the notice names its file to be read and followed instead.
#
# Whether the session ran a role skill is read from the transcript the payload
# points at. A transcript is append-only, so the records from before the
# compaction are still in it. Three records show a role, each anchored to the
# structure Claude Code writes so that a transcript merely quoting one does not
# match:
#
#   - the user message that a typed "/apm.<role>" leaves behind;
#   - a Skill tool call whose skill is a role;
#   - a Read tool call on the installed SKILL.md of a role.
#
# Without a transcript path, with an unreadable transcript, or without a role,
# nothing is printed. Exit is always 0: this hook never blocks anything.
#
# POSIX sh. No dependencies beyond sed and grep.

set -u

payload=$(cat)

transcript=$(printf '%s' "$payload" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | sed 's#\\/#/#g' | head -n 1)
[ -n "$transcript" ] && [ -r "$transcript" ] && [ -f "$transcript" ] || exit 0

role="apm\.(plan|manage|work)"
space="[[:space:]]*"

typed="\"content\":${space}\"<command-message>${role}</command-message>"
skill="\"name\":${space}\"Skill\",${space}\"input\":${space}\\{${space}\"skill\":${space}\"${role}\""
read_file="\"name\":${space}\"Read\",${space}\"input\":${space}\\{${space}\"file_path\":${space}\"[^\"]*\\.claude/skills/${role}/SKILL\\.md\""

grep -Eq "${typed}|${skill}|${read_file}" "$transcript" 2>/dev/null || exit 0

cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "The context window was just compacted. Before the next action, read .claude/skills/apm.recover/SKILL.md as a file and follow it. If you are the coordinator, also reread the assignment step before writing a Task Bus, and write the Task Bus only with the Write tool."
  }
}
JSON

exit 0
