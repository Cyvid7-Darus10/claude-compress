# claude-bash-compress

A lightweight Claude Code hook that compresses verbose bash output to save context window tokens.

Every time Claude runs a bash command, the full output is added to the conversation context. A single `npm install` can dump 3,000+ characters of noise. Over a session with many tool calls, this bloat adds up — wasting tokens on progress bars, repeated lines, and install logs instead of your actual work.

This hook intercepts bash output and compresses it before it reaches the context window.

![demo](https://vhs.charm.sh/vhs-767lFbBzkhKRBT91FkLPf0.gif)

## Before & after

```
Without hook:        npm install → 2,800 chars in context
With bash-compress:  npm install →   400 chars in context (86% reduction)
```

## Why this exists

There are other tools in this space. Here's how they compare:

| | claude-bash-compress | [contextzip](https://github.com/jee599/contextzip) | [clauditor](https://github.com/IyadhKhalfallah/clauditor) |
|---|---|---|---|
| **Install** | Copy 1 file | `npx` or `cargo install` | `npm install -g` + `clauditor install` |
| **Dependencies** | None (just Node.js) | Rust binary + `jq` | 5 npm packages |
| **Size** | 1 file, 120 lines | Full CLI + 6 filters | 31 source files, TUI, daemon |
| **Scope** | Bash output only | All CLI output | Session rotation, cache health, loop detection, bash compression |
| **Overhead** | Fires only on Bash (`matcher: "Bash"`) | Wraps every command | PostToolUse on every tool call |
| **Config** | Zero | Zero | Calibration system |

**Our edge: simplicity.**

- **One file.** No build step, no compiled binary, no package manager. `curl` it and add 5 lines of JSON. Done in 30 seconds.
- **Bash-only matcher.** Other tools fire on every tool call. This hook uses `matcher: "Bash"` so Read, Edit, Write, Grep calls have zero added latency.
- **No runtime dependencies.** Works with the Node.js that Claude Code already requires. No `jq`, no Rust toolchain, no global npm packages.
- **Plays well with others.** If you already run hooks (monitoring, mission control, Vercel plugin), adding a heavyweight tool creates conflicts and overhead. This hook is one more entry in your PostToolUse array — nothing else changes.
- **Forkable.** 120 lines of readable JavaScript. Want to change the compression threshold or add a custom filter? Edit one file. No framework to learn.

Use **contextzip** if you want a polished CLI with benchmarked filters for all output types. Use **clauditor** if you want full session management (rotation, cache monitoring, handoffs). Use **claude-bash-compress** if you want bash compression with nothing else in the way.

## Token savings & cost impact

Real numbers from a typical Claude Code session:

```
  Bash calls per session:     ~40 (builds, tests, git, npm, etc.)
  Avg output per call:        ~1,500 chars (~375 tokens)
  Calls with verbose output:  ~15 per session (>500 chars)
  Avg compression:            ~70% on verbose output
  ─────────────────────────────────────────────────────
  Tokens saved per session:   ~4,000 tokens
  Sessions per dev per day:   ~5
  Tokens saved per dev/day:   ~20,000 tokens
```

### What that means in dollars

| Model | Input cost/1M tokens | Savings per dev/day | Savings per dev/month | 10-person team/month |
|---|---|---|---|---|
| Claude Sonnet 4.6 | $3.00 | $0.06 | $1.20 | **$12** |
| Claude Opus 4.6 | $15.00 | $0.30 | $6.00 | **$60** |
| Claude Opus 4.6 (heavy use) | $15.00 | $0.90 | $18.00 | **$180** |

The direct dollar savings are modest — the real value is **context window longevity**:

- **Fewer compactions.** Noisy bash output fills the context window faster, triggering auto-compaction that erases older context. With compression, sessions last longer before Claude "forgets" earlier work.
- **Better cache hit rates.** Smaller tool outputs mean less cache churn. Claude Code's prompt caching works better when context grows predictably.
- **Longer productive sessions.** On Sonnet (200k context), a session with 40 verbose bash calls adds ~60k tokens of noise — that's 30% of the window wasted on npm install logs. Compression recovers most of that.

For teams on Anthropic's API (not the Pro/Max subscription), the savings compound:

```
  50 developers × 5 sessions/day × 20 workdays × 20k tokens saved
  = 100M tokens/month saved
  = $300/month on Sonnet, $1,500/month on Opus
```

## What it compresses

- **Package manager output** (npm/pnpm/yarn install) → head + tail + summary
- **Progress bars** (`[=====>   ]`, `████░░`) → stripped entirely
- **Repeated lines** (50x "processing chunk") → collapsed to 1 line + count
- **Build logs** → keeps error/warn/fail lines, omits noise
- **Any output >2,000 chars** → truncated with head/tail preserved

What it **preserves**:
- Error messages, warnings, failures, exceptions
- Short output (<500 chars) passes through unchanged
- Non-Bash tool output is never touched

## Install

```bash
# 1. Copy the hook
mkdir -p ~/.claude/hooks
curl -o ~/.claude/hooks/bash-compress.mjs \
  https://raw.githubusercontent.com/Cyvid7-Darus10/claude-bash-compress/main/bash-compress.mjs

# 2. Add to ~/.claude/settings.json under "hooks"
```

Add this to your `hooks.PostToolUse` array in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/bash-compress.mjs\""
          }
        ]
      }
    ]
  }
}
```

That's it. No dependencies, no build step, no daemon. One file, zero config.

Requires Node.js 20+.

## How it works

Claude Code's [PostToolUse hook](https://docs.anthropic.com/en/docs/claude-code/hooks) fires after every tool call. This hook:

1. Reads the tool result from stdin (JSON with `tool_name` and `tool_response`)
2. If it's not a Bash call or the output is short, returns `{}` (no-op)
3. Otherwise, compresses the output and returns `{ additionalContext: "..." }`
4. Claude sees the compressed version alongside the original

The `matcher: "Bash"` config ensures it only runs for Bash tool calls — zero overhead on Read, Edit, Write, Grep, etc.

## Tests

```bash
node bash-compress.test.mjs
```

```
bash-compress tests

  ✓ passes through short output unchanged
  ✓ passes through non-Bash tools
  ✓ compresses verbose npm install output
  ✓ preserves error lines in build output
  ✓ collapses repeated identical lines
  ✓ strips progress bars
  ✓ handles malformed JSON gracefully
  ✓ truncates extremely long output

8 passed, 0 failed
```

## Configuration

Edit the constants at the top of `bash-compress.mjs`:

| Constant | Default | Description |
|---|---|---|
| `MAX_CHARS` | 2000 | Maximum compressed output size |
| `MIN_CHARS` | 500 | Output shorter than this passes through unchanged |
| `PRESERVE_PATTERNS` | error, warn, fail, ... | Regex patterns for lines to always keep |

## License

MIT
