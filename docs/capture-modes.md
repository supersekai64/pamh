# Capture Modes

PAMH supports three capture modes to control how memories are created. The default mode is **assisted**.

## Overview

| Mode       | Behavior                                            | Use Case                                 |
| ---------- | --------------------------------------------------- | ---------------------------------------- |
| `manual`   | Memories are created only when explicitly requested | Full control, no automation              |
| `assisted` | Agent proposes memories, user approves              | Balanced automation with oversight       |
| `auto`     | Agent creates memories directly based on rules      | Maximum automation for trusted workflows |

## Configuration

The capture mode is configured in `.ai-memory/auto-capture.yaml`:

```yaml
mode: assisted
```

You can also configure it via CLI:

```bash
memory capture show
memory capture set manual
memory capture set assisted
memory capture set auto
```

## Manual Mode

In manual mode, memories are created only when you explicitly call `memory add` or when an MCP client calls `add_memory` with `status: active`.

**When to use:**

- You want full control over what gets stored
- You're evaluating PAMH and want to understand the workflow
- You prefer to curate memories yourself

**Example:**

```bash
memory add --project -t decision -s project -c "Use PostgreSQL for the main database"
```

## Assisted Mode (Default)

In assisted mode, when an agent calls `add_memory`, the memory is created with `status: proposed`. You must review and approve it before it becomes active.

**When to use:**

- You want automation but with oversight
- You're working with AI agents and want to validate their suggestions
- You want to prevent noise in your memory

**Workflow:**

1. Agent completes a task and calls `add_memory`
2. Memory is created with `status: proposed`
3. You see it in `memory list --status proposed` or in `memory ui`
4. You approve with `memory approve <id>` or reject with `memory reject <id>`
5. Approved memories become `active`, rejected become `deleted`

**Example:**

```bash
# List proposed memories
memory list --status proposed

# Approve a proposed memory
memory approve mem_abc123

# Reject a proposed memory
memory reject mem_xyz789
```

In the UI, proposed memories show with "Approve" and "Reject" buttons instead of the usual edit actions.

### Hook-Based Inference

Tools that support lifecycle hooks can call:

```bash
memory hook record user-prompt --project --agent <agent>
```

If the tool sends prompt data to stdin or `--data`, PAMH records the raw hook
event as an observation and may infer a concise proposed memory for explicit
durable corrections. For example, if the user says a rule should have been
remembered automatically, PAMH can create a proposed `rule` memory without
waiting for a separate manual `memory add`.

This inference is intentionally narrow:

- It respects capture mode (`manual` creates no memory, `assisted` creates
  `proposed`, `auto` creates `active`).
- It does not store raw prompt transcripts as durable memory.
- It only emits compact English memories for obvious workflow/documentation or
  memory-capture expectations.

## Auto Mode

In auto mode, the agent creates memories directly with `status: active` based on configured rules.

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
    scope: project
  - after: decision_made
    type: decision
    scope: project
exclude:
  - type: knowledge
    scope: temporary
```

**Warning:** Auto mode can create noise if not configured carefully. Start with assisted mode and switch to auto only after validating the agent's suggestions.

## Switching Modes

You can switch modes at any time:

```bash
# Switch to manual mode
memory capture set manual

# Switch to assisted mode
memory capture set assisted

# Switch to auto mode
memory capture set auto
```

Existing memories are not affected by mode changes. Only new memories created via MCP will use the new mode.

## Expert Mode

If you want to disable auto-capture entirely and use only manual commands, set the mode to `manual`:

```bash
memory capture set manual
```

This is useful for:

- Users who prefer explicit control
- Projects where memory should be carefully curated
- Situations where you don't want agents to propose memories

## Best Practices

1. **Start with assisted mode** - It's the default for a reason. It gives you automation with oversight.

2. **Review proposed memories regularly** - Use `memory list --status proposed` or check the UI.

3. **Switch to auto mode only after validation** - Once you trust the agent's suggestions, you can switch to auto mode.

4. **Use manual mode for sensitive projects** - If the project contains sensitive information, manual mode gives you full control.

5. **Configure rules in auto mode** - Don't rely on default behavior. Define explicit rules for what should be captured.
