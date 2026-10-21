#!/bin/sh
#
# APM dispatch gate.
#
# A PreToolUse hook for Write, Edit and Bash. It blocks a write to a Task Bus
# file (.apm/bus/<agent>/task.md) while any of three conditions holds:
#
#   - a checklist under .apm/checklists/ has an unchecked box;
#   - the Task being dispatched is blocked by an open deferred item in the
#     Tracker's Deferred table;
#   - the Task Prompt has no valid "## Spec Deltas" decision.
#
# A Bash command that writes the Task Bus is blocked outright: the shell offers
# no content the conditions could be read from, so the Task Bus is written with
# the Write or Edit tool, where the gate can check it. Writing any other file,
# and running any other command, never blocks. Exit 2 blocks the tool call and the
# stderr text below becomes the reason the model is given, so every message
# names the checklist item, the deferred item or the Spec Deltas defect that
# caused the block - a block that does not say why forces an investigation,
# which is worse than no block at all.
#
# The Task Prompt is read from the content being written, not from disk: a
# Write replaces the file, so what is on disk is the previous message or
# nothing. An Edit is the exception, because its payload carries only the
# replacement - see where the content is assembled below.
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

# A Bash command that writes the Task Bus. This is text matching on the command
# string, not an analysis of the shell: it recognises the usual ways of writing
# a file and cannot see a path assembled in a variable or an indirect write. A
# read-only command on the file passes, and a command that does not name a Task
# Bus file never blocks. The report and handoff files are not watched.
#
# Two commands are let through because the Task cycle needs them and neither
# opens a way to write a Task Prompt the gate has not seen:
#
#   - truncate to size zero, which empties a Task Bus. A redirect with no
#     content cannot be told reliably from a write, so it stays blocked;
#   - cp or install whose source is itself a Task Bus file, to a file or a
#     directory. That copies a prompt the gate already checked in the shared
#     bus into a worktree mailbox, or reflects an emptied mailbox back out.
#
# Both are removed from the command before the write patterns run, so any other
# write in the same compound command is still seen and blocks it. A copy from any
# other source, and mv, stay blocked.
#
# The interpreter rule fires on any command that starts an interpreter and names
# the file anywhere, because the write happens inside code the gate cannot read.
# Newlines are folded into ";" so a multi-line command is matched as one string.
block_bash_task_bus_write() {
  command=$(json_string command tool_input | tr '\n' ';')
  [ -n "$command" ] || return 0

  sq="'"
  quote="[\"${sq}]?"
  path="[^[:space:];|&<>()\"${sq}]*\.apm/bus/[^/[:space:];|&<>()\"${sq}]+/task\.md"
  segment="[^|;&]*"
  # A word counts as a command only at the start of a command: after a
  # separator, optionally behind variable assignments, sudo, env, command or exec,
  # and optionally spelled with a directory. "grep tee file" does not run tee.
  boundary="(^|[;&|(]|\\$\\()[[:space:]]*"
  prefixes="(([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*|sudo|env|command|exec)[[:space:]]+)*([^[:space:];|&()]*/)?"
  cmd="${boundary}${prefixes}"

  printf '%s' "$command" | grep -Eq "${path}" || return 0

  end="[[:space:]]*(\$|[;&|)])"
  clear_bus="${cmd}truncate([[:space:]]+-c)?[[:space:]]+(-s[[:space:]]*0|--size(=|[[:space:]]+)0)[[:space:]]+${quote}${path}${quote}${end}"
  copy_bus="${cmd}(cp|install)([[:space:]]+-[^[:space:]]*([[:space:]]+[0-9]+)?)*[[:space:]]+${quote}${path}${quote}[[:space:]]+${quote}[^[:space:];|&<>()\"${sq}]+${quote}${end}"
  remaining=$(printf '%s' "$command" | sed -E "s#${clear_bus}#;#g; s#${copy_bus}#;#g")

  writes=""
  for pattern in \
    ">[>|]?[[:space:]]*${quote}${path}" \
    "${cmd}tee[[:space:]]${segment}${path}" \
    "${cmd}(cp|mv|install)[[:space:]]${segment}[[:space:]]${quote}${path}${quote}[[:space:]]*(\$|[;&|)])" \
    "${cmd}(sed|perl)[[:space:]]+(${segment}[[:space:]])?(-[A-Za-z]*i[^[:space:]]*|--in-place[^[:space:]]*)[[:space:]]${segment}${path}" \
    "${cmd}truncate[[:space:]]${segment}${path}" \
    "${cmd}dd[[:space:]]${segment}of=${quote}${path}" \
    "${cmd}(python[0-9.]*|perl|node|ruby)[[:space:]]"
  do
    if printf '%s' "$remaining" | grep -Eq "$pattern"; then
      writes="yes"
      break
    fi
  done
  [ -n "$writes" ] || return 0

  named=$(printf '%s' "$command" | grep -Eo "${path}" | head -n 1)
  printf 'APM dispatch gate: this command writes %s from the shell and is blocked.\n\n' "$named" >&2
  printf 'The Task Bus is written with the Write or Edit tool, so that the gate can check the Task Prompt before it is dispatched. Write the file with that tool instead.\n' >&2
  exit 2
}

tool_name=$(json_string tool_name)
if [ "$tool_name" = "Bash" ]; then
  block_bash_task_bus_write
  exit 0
fi

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

# Project paths - the checklists, the Tracker and a relative Spec Deltas path -
# resolve against the project root: CLAUDE_PROJECT_DIR when it names a directory,
# else the payload's working directory, else the current directory. The payload's
# directory follows the session's shell, so a coordinator whose shell sits in a
# subdirectory would otherwise see a valid relative path as missing. An absolute
# path is unaffected by where the hook stands.
project_root=""
if [ -n "${CLAUDE_PROJECT_DIR-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
  project_root=$CLAUDE_PROJECT_DIR
else
  hook_cwd=$(json_string cwd)
  if [ -n "$hook_cwd" ] && [ -d "$hook_cwd" ]; then
    project_root=$hook_cwd
  fi
fi
if [ -n "$project_root" ]; then
  cd "$project_root" || exit 0
fi

# Reports whether the tool input carries `key` at all, whatever its value. An
# empty string and an absent key read the same through json_string, and an Edit
# whose replacement is empty is exactly the one that deletes a section.
json_has() {
  printf '%s' "$payload" | awk -v key="$1" '
    { buf = (NR == 1) ? $0 : buf "\n" $0 }
    END {
      anchor = index(buf, "\"tool_input\"")
      if (anchor == 0) exit 1
      exit (index(substr(buf, anchor), "\"" key "\"") > 0) ? 0 : 1
    }
  '
}

# Write carries the whole file in `content`. Edit carries only the replacement,
# so the file it would leave behind is rebuilt from disk with the replacement
# applied - the first occurrence, or every one when `replace_all` is true. The
# rebuilt file, not the replacement text, is what the conditions read: an Edit
# that deletes the Spec Deltas section has to block, and an Edit that touches
# some other line of a well-formed prompt has to pass. When the file is not on
# disk the replacement is all there is, and it is read as the whole content.
if json_has content; then
  dispatched=$(json_string content tool_input)
elif json_has new_string && [ -f "$file_path" ]; then
  replace_all=false
  printf '%s' "$payload" | awk '
    { buf = (NR == 1) ? $0 : buf "\n" $0 }
    END { exit (buf ~ /"replace_all"[[:space:]]*:[[:space:]]*true/) ? 0 : 1 }
  ' && replace_all=true
  dispatched=$(TARGET=$file_path OLD=$(json_string old_string tool_input) NEW=$(json_string new_string tool_input) \
    awk -v all="$replace_all" '
      BEGIN {
        file = ENVIRON["TARGET"]
        while ((getline line < file) > 0) buf = buf line "\n"
        old = ENVIRON["OLD"]
        new = ENVIRON["NEW"]
        if (old == "") { printf "%s", (buf == "") ? new : buf; exit }
        out = ""
        while ((p = index(buf, old)) > 0) {
          out = out substr(buf, 1, p - 1) new
          buf = substr(buf, p + length(old))
          if (all != "true") break
        }
        printf "%s", out buf
      }
    ')
else
  dispatched=$(json_string new_string tool_input)
fi

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

# Condition three: the Task Prompt decides explicitly whether it carries spec
# deltas. It needs a "## Spec Deltas" heading, and the first non-empty line
# under it is either "none - <reason>" or a path .apm/openspec/<change>/changes
# that exists as a directory, optionally wrapped in backticks. The decision is
# a section rather than a sentence in the coordinator's guide because a
# conditional rule nothing enforces is a rule that stops being applied.
#
# A write that leaves the Task Bus empty clears it rather than dispatching, so
# it has no decision to make and is not held to this condition.
if [ -n "$(printf '%s' "$dispatched" | tr -d '[:space:]')" ]; then
  decision=$(DISPATCHED=$dispatched awk '
    BEGIN {
      n = split(ENVIRON["DISPATCHED"], line, "\n")
      for (i = 1; i <= n; i++) {
        sub(/\r$/, "", line[i])
        if (line[i] ~ /^## Spec Deltas[[:space:]]*$/) break
      }
      if (i > n) { print "missing"; exit }
      for (i++; i <= n; i++) {
        sub(/\r$/, "", line[i])
        if (line[i] !~ /^[[:space:]]*$/) break
      }
      if (i > n) { print "empty"; exit }
      value = line[i]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      printf "line %s", value
    }
  ')

  problem=""
  case "$decision" in
    missing) problem="the Task Prompt has no \"## Spec Deltas\" heading." ;;
    empty) problem="\"## Spec Deltas\" has no line under it." ;;
    "line none - "?*) ;;
    "line none" | "line none -") problem="\"none\" carries no reason after \"none - \"." ;;
    *)
      deltas_path=${decision#"line "}
      case "$deltas_path" in
        \`*\`) deltas_path=${deltas_path#\`}; deltas_path=${deltas_path%\`} ;;
      esac
      change=${deltas_path#".apm/openspec/"}
      change=${change%"/changes"}
      case "$deltas_path" in
        ".apm/openspec/"*"/changes") ;;
        *) change="" ;;
      esac
      case "$change" in
        "" | */* | . | ..)
          problem="\"${decision#"line "}\" is neither \"none - <reason>\" nor a .apm/openspec/<change>/changes path." ;;
        *)
          [ -d "$deltas_path" ] || problem="${deltas_path} does not exist as a directory."
          ;;
      esac
      ;;
  esac

  if [ -n "$problem" ]; then
    blocks="${blocks}Spec Deltas decision missing or invalid: ${problem}
  The first non-empty line under \"## Spec Deltas\" must be one of:
    none - <why this Task changes no specification>
    .apm/openspec/<change>/changes (an existing directory, backticks allowed)
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
