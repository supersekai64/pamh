# Capture Modes

PAM supports three capture modes to control how memories are created. The default mode is **auto** so a fresh install works without a review step.

## Overview

| Mode       | Behavior                                                               | Use Case                           |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------- |
| `manual`   | Memories are created only when explicitly requested                    | Full control, no automation        |
| `assisted` | Agent proposes memories, user approves                                 | Balanced automation with oversight |
| `auto`     | Agent creates active memories and hooks capture raw exchanges directly | Default automatic workflow         |

`proposed` memories are a review-mode concept. They should normally appear only
after explicitly switching to `assisted` or when inspecting older data created
before auto mode was enabled.

## Configuration

The capture mode is configured in `.ai-memory/auto-capture.yaml`:

```yaml
mode: auto
```

You can also configure it via CLI:

```bash
pam capture show
pam capture set manual
pam capture set assisted
pam capture set auto
```

## Manual Mode

In manual mode, memories are created only when you explicitly call `pam add` or when an MCP client calls `add_memory` with `status: active`.

**When to use:**

- You want full control over what gets stored
- You're evaluating PAM and want to understand the workflow
- You prefer to curate memories yourself

**Example:**

```bash
pam add -t decision -c "Use PostgreSQL for the main database"
```

## Assisted Mode

In assisted mode, when an agent calls `add_memory`, the memory is created with `status: proposed`. You must review and approve it before it becomes active.
Before creating a new proposal, PAM checks for same-theme memories. Proposed
matches are merged into one review item; active matches produce a proposed
supersession linked to the active memory.

**When to use:**

- You want automation but with oversight
- You're working with AI agents and want to validate their suggestions
- You want to prevent noise in your memory

**Workflow:**

1. Agent completes a task and calls `add_memory`
2. Memory is created with `status: proposed`
3. You see it in `pam list --status proposed` or in `pam ui`
4. You approve with `pam approve <id>` or reject with `pam reject <id>`
5. Approved memories become `active`, rejected become `deleted`

**Example:**

```bash
# List proposed memories
pam list --status proposed

# Approve a proposed memory
pam approve mem_abc123

# Reject a proposed memory
pam reject mem_xyz789
```

In the UI, proposed memories show with "Approve" and "Reject" buttons instead of the usual edit actions.

### Hook-Based Inference

Tools that support lifecycle hooks can call:

```bash
pam hook record user-prompt --agent <agent>
```

If the tool sends prompt data to stdin or `--data`, PAM records the hook event
as an observation, creates a Markdown `exchange` memory in auto/assisted mode
with both `Simplified` and `Raw Exchange` sections, and may infer a concise
durable memory for explicit corrections. For
example, if the user says a rule should have been remembered automatically,
PAM can create a `rule` memory without waiting for a separate manual
`pam add`.

This inference is intentionally narrow:

- It respects capture mode (`manual` creates no memory, `assisted` creates
  `proposed`, `auto` creates `active`).
- Exchange memories are redacted before storage and tagged `raw-exchange`.
- Exchange Markdown keeps the original redacted text below the simplified view
  so human review stays fast without losing evidence.
- It only emits compact English memories for obvious workflow/documentation or
  memory-capture expectations.

## Auto Mode (Default)

In auto mode, the agent creates memories directly with `status: active` based on configured rules. High-confidence same-theme matches can supersede active memories directly while preserving the archived previous version. Textual `user-prompt` hook events are also captured as redacted Markdown `exchange` memories by default, with relevant pre-answer memory IDs attached in `source_ids`.

When a previous session has hook activity but no `session-end`, the next
`session-start` can create a recovered `session` memory from those captured
events. This gives PAM a fallback when a client is closed before the final
checkpoint runs.

**When to use:**

- You trust the agent's judgment
- You want maximum automation
- You've configured specific rules for what should be captured

**Configuration:**

```yaml
mode: auto
rules:
  - after: task_completion
    type: session
  - after: decision_made
    type: decision
exclude:
  - type: session
```

**Warning:** Auto mode captures more by design. Switch to assisted mode when a project needs review before activation.

## Switching Modes

You can switch modes at any time:

```bash
# Switch to manual mode
pam capture set manual

# Switch to assisted mode
pam capture set assisted

# Switch to auto mode
pam capture set auto
```

Existing memories are not affected by mode changes. Only new memories created via MCP will use the new mode.

## Expert Mode

If you want to disable auto-capture entirely and use only manual commands, set the mode to `manual`:

```bash
pam capture set manual
```

This is useful for:

- Users who prefer explicit control
- Projects where memory should be carefully curated
- Situations where you don't want agents to propose memories

## Best Practices

1. **Use auto mode for normal projects** - It is the default because PAM is meant to work immediately after installation.

2. **Treat proposed memories as exceptional in normal use** - If they appear in
   auto mode, check whether the project is actually configured for `assisted`
   capture or whether they are older records.

3. **Switch to assisted mode for stricter review** - Proposed memories remain inactive until approved.

4. **Use manual mode for sensitive projects** - If the project contains sensitive information, manual mode gives you full control.

5. **Configure rules in auto mode** - Don't rely on default behavior. Define explicit rules for what should be captured.
