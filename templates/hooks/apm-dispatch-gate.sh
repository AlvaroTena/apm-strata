#!/bin/sh
#
# APM dispatch gate.
#
# A PreToolUse hook for Write and Edit. It blocks a write to a Task Bus file
# (.apm/bus/<agent>/task.md) while either of two conditions holds:
#
#   - a checklist under .apm/checklists/ has an unchecked box;
#   - the Task being dispatched is blocked by an open deferred item in the
#     Tracker's Deferred table.
#
# Writing any other file never blocks. Exit 2 blocks the tool call and the
# stderr text below becomes the reason the model is given, so every message
# names the checklist item or the deferred item that caused the block - a
# block that does not say why forces an investigation, which is worse than no
# block at all.
#
# The Task being dispatched is read from the frontmatter of the content being
# written, not from disk: the file is being created or replaced, so what is on
# disk is the previous message or nothing.
#
# POSIX sh. No dependencies beyond awk, find and the shell.

set -u

CHECKLIST_DIR=".apm/checklists"
TRACKER=".apm/tracker.md"

payload=$(cat)

# Extracts a JSON string value by key, searching from `from` onward, and
# returns it with the standard escapes decoded. A \uXXXX escape decodes to "?":
# the gate matches paths, digits and plain words, none of which need it.
json_string() {
  printf '%s' "$payload" | awk -v key="$1" -v from="${2-}" '
    { buf = (NR == 1) ? $0 : buf "\n" $0 }
    END {
      start = 1
      if (from != "") {
        anchor = index(buf, "\"" from "\"")
        if (anchor == 0) exit 0
        start = anchor + length(from) + 2
      }

      needle = "\"" key "\""
      rest = substr(buf, start)
      pos = index(rest, needle)
      if (pos == 0) exit 0

      i = start + pos - 1 + length(needle)
      n = length(buf)

      while (i <= n && substr(buf, i, 1) != ":") i++
      i++
      while (i <= n && substr(buf, i, 1) ~ /[ \t\n\r]/) i++
      if (substr(buf, i, 1) != "\"") exit 0
      i++

      out = ""
      while (i <= n) {
        c = substr(buf, i, 1)
        if (c == "\\") {
          e = substr(buf, i + 1, 1)
          if (e == "n") out = out "\n"
          else if (e == "t") out = out "\t"
          else if (e == "r") out = out "\r"
          else if (e == "b" || e == "f") out = out " "
          else if (e == "u") { out = out "?"; i = i + 4 }
          else out = out e
          i = i + 2
          continue
        }
        if (c == "\"") break
        out = out c
        i++
      }
      printf "%s", out
    }
  '
}

file_path=$(json_string file_path tool_input)
[ -n "$file_path" ] || exit 0

# Only a Task Bus file is gated, and only at its own depth: .apm/bus/<agent>/task.md
case "$file_path" in
  *".apm/bus/"*"/task.md") ;;
  *) exit 0 ;;
esac

agent_slug=${file_path##*".apm/bus/"}
agent_slug=${agent_slug%"/task.md"}
case "$agent_slug" in
  "" | */*) exit 0 ;;
esac

# Project paths resolve against the session's working directory when the payload
# carries a usable one, and against the current directory otherwise.
hook_cwd=$(json_string cwd)
if [ -n "$hook_cwd" ] && [ -d "$hook_cwd" ]; then
  cd "$hook_cwd" || exit 0
fi

# Write carries the whole file in `content`; Edit carries the replacement in
# `new_string`. When neither holds the frontmatter, the Task identity is
# unavailable and only the checklist condition can be evaluated.
dispatched=$(json_string content tool_input)
[ -n "$dispatched" ] || dispatched=$(json_string new_string tool_input)

task_id=$(printf '%s\n' "$dispatched" | awk '
  NR == 1 && $0 != "---" { exit }
  /^---[[:space:]]*$/ { if (++fence == 2) exit; next }
  fence == 1 && /^stage:[[:space:]]*[0-9]+[[:space:]]*$/ { gsub(/[^0-9]/, ""); stage = $0 }
  fence == 1 && /^task:[[:space:]]*[0-9]+[[:space:]]*$/  { gsub(/[^0-9]/, ""); task = $0 }
  END { if (stage != "" && task != "") printf "%s.%s", stage, task }
')

blocks=""

# Condition one: an unchecked box in any checklist. An item is a box that opens
# its own line, exactly as the checklist format requires - leading whitespace,
# a quote marker or any other text ahead of it means the line is not an item.
# Only an empty box counts as unchecked, so both "[x]" and "[X]" read as marked.
#
# Every regular file under the directory is read rather than the two the format
# names, because a checklist the gate cannot see is a gate that passes silently.
#
# No checklists is a free pass: an absent or empty directory does not block.
# The gate enforces unfinished review, not the absence of a review artifact.
if [ -d "$CHECKLIST_DIR" ]; then
  checklists=$(find "$CHECKLIST_DIR" -type f 2>/dev/null | sort)
  if [ -n "$checklists" ]; then
    unchecked=$(printf '%s\n' "$checklists" | while IFS= read -r checklist; do
      [ -n "$checklist" ] || continue
      awk -v file="$checklist" '
        /^-[[:space:]]\[[[:space:]]\]/ {
          item = substr($0, 6)
          sub(/^[[:space:]]+/, "", item)
          if (item == "") item = "(unnamed item)"
          printf "%s line %d: %s\n", file, NR, item
          exit
        }
      ' "$checklist"
    done)
    if [ -n "$unchecked" ]; then
      count=$(printf '%s\n' "$unchecked" | wc -l | tr -d ' ')
      blocks="${blocks}Unchecked checklist item in ${count} checklist(s), first:
  $(printf '%s\n' "$unchecked" | head -n 1)
"
    fi
  fi
fi

# Condition two: an open deferred item whose blocked-Tasks column names this
# Task. The table is read by column position, not by header text, so a Tracker
# that renames or translates its headers still parses. Rows before the header
# separator are skipped, and a status is open unless it reads as closed.
if [ -n "$task_id" ] && [ -f "$TRACKER" ]; then
  deferred=$(awk -v want="$task_id" '
    function trim(s) { gsub(/^[[:space:]]+|[[:space:]]+$/, "", s); return s }

    # The Task identity is interpolated into a regular expression below, so its
    # metacharacters are escaped first. Without this, the dot in "2.3" matches
    # any character and an item blocking "2-3" would also block Task 2.3.
    BEGIN { gsub(/[].[^$(){}|*+?\\]/, "\\\\&", want) }

    /^##[[:space:]]/ { in_section = ($0 ~ /^##[[:space:]]+Deferred[[:space:]]*$/); seen_rule = 0; next }
    !in_section { next }
    $0 !~ /^\|/ { next }
    $0 ~ /^\|[[:space:]]*:?-{2,}/ { seen_rule = 1; next }
    !seen_rule { next }

    {
      row = $0
      sub(/^\|/, "", row)
      sub(/\|[[:space:]]*$/, "", row)
      n = split(row, cell, "|")
      if (n < 4) next

      item = trim(cell[1])
      blocked = trim(cell[3])
      status = tolower(trim(cell[4]))

      if (status ~ /(^|[^a-z])(done|closed|resolved|complete|completed|dropped|cerrado|resuelto|hecho|completado|descartado)([^a-z]|$)/) next
      if (status ~ /\[x\]/) next

      pattern = "(^|[^0-9.])" want "([^0-9.]|$)"
      if (blocked !~ pattern) next

      if (item == "") item = "(unnamed item)"
      printf "%s (status \"%s\")\n", item, trim(cell[4])
    }
  ' "$TRACKER")
  if [ -n "$deferred" ]; then
    # The status is quoted back and the closed vocabulary is named, because the
    # common cause of an unexpected block is a status word outside that set
    # rather than work that is genuinely unfinished. Without this line the
    # reader goes to look at the item instead of at the word.
    blocks="${blocks}Open deferred item blocking Task ${task_id}, from ${TRACKER}:
$(printf '%s\n' "$deferred" | sed 's/^/  /')
  A status counts as open unless it reads as done, closed, resolved, complete,
  completed, dropped or [x]. Any other word, including an empty cell, blocks.
"
  fi
fi

[ -n "$blocks" ] || exit 0

target_task=${task_id:-"(Task identity not found in the content being written)"}

printf 'APM dispatch gate: the write to %s is blocked.\n\n' "$file_path" >&2
printf 'Dispatch target: %s -> Task %s\n\n' "$agent_slug" "$target_task" >&2
printf '%s\n' "$blocks" >&2
printf 'Resolve what is named above, then dispatch again. Nothing else is gated: this hook only guards %s.\n' ".apm/bus/<agent>/task.md" >&2

exit 2
