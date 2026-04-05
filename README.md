# claude-bash-compress

A lightweight Claude Code hook that compresses verbose bash output to save context window tokens.

Every time Claude runs a bash command, the full output is added to the conversation context. A single `npm install` can dump 3,000+ characters of noise. Over a session with many tool calls, this bloat adds up — wasting tokens on progress bars, repeated lines, and install logs instead of your actual work.

This hook intercepts bash output and compresses it before it reaches the context window.

![demo](https://vhs.charm.sh/vhs-XbmoXiyGHgFy0WwjYYjis.gif)

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

Measured from a real developer's Claude Code sessions (107 sessions, 7 days, Bash outputs only):

```
  Bash outputs over 500 chars:  486
  Compressible:                 213
  ─────────────────────────────────────────────────────
  Original total:               806k chars
  Compressed total:             215k chars
  Reduction:                    73.3%
  Tokens saved per week:        ~148,000
```

Run the benchmark on your own sessions to see your numbers:

```bash
node benchmark.mjs
```

### What that means in dollars

| Model | Input cost/1M tokens | Savings per dev/month | 10-person team/month |
|---|---|---|---|
| Claude Sonnet 4.6 | $3.00 | $1.77 | **$18** |
| Claude Opus 4.6 | $15.00 | $8.86 | **$89** |

The direct dollar savings per dev are modest. The real value is **context window longevity**:

- **Fewer compactions.** Noisy bash output fills the context window faster, triggering auto-compaction that erases older context. With compression, sessions last longer before Claude "forgets" earlier work.
- **Better cache hit rates.** Smaller tool outputs mean less cache churn. Claude Code's prompt caching works better when context grows predictably.
- **Longer productive sessions.** On Sonnet (200k context), verbose bash output across a session can add 10-15k tokens of noise. Compression recovers most of that.

### How this makes Claude Code faster

This hook doesn't make Claude's model inference faster — that's determined by Anthropic's servers. What it does is reduce the number of tokens Claude has to **re-process on every subsequent turn**.

Claude Code re-sends the **entire conversation history** on every turn. A verbose bash output from turn 5 is still being processed at turn 50:

```
  Turn 5:  npm install dumps 3,000 chars (750 tokens) into context
  Turn 6:  Claude re-processes those 750 tokens
  Turn 7:  And again
  ...
  Turn 50: Still processing those same 750 tokens — for the 45th time

  With compression (3,000 → 400 chars, saving 650 tokens):
  650 tokens × 45 remaining turns = 29,250 tokens NOT re-processed
```

Across a session with 15 verbose bash calls, that's **~400k fewer cumulative tokens processed**. Four concrete effects:

1. **Faster time-to-first-token.** Less input to process before Claude starts responding. Not dramatic per-turn (~100-300ms), but noticeable in long sessions.

2. **Lower chance of hitting rate limits.** Fewer tokens per request means more headroom before Anthropic throttles you.

3. **Delayed compaction.** Sessions last longer before auto-compaction erases older context. On Sonnet (200k window), 15 verbose bash calls add ~40k tokens of noise — that's 20% of the window wasted on install logs. Compression recovers most of it.

4. **Better prompt cache hit rates.** Claude Code uses prompt caching — repeated context is read from cache (10x cheaper) instead of reprocessed. Smaller, more stable context = more cache hits. Large bash output insertions cause cache misses that cascade through subsequent turns.

```
  Typical session (20 verbose bash calls, 80 turns):
  ──────────────────────────────────────────────────
  Without compression:
    Cumulative bash noise:     ~15k tokens in context by turn 80
    Tokens re-processed:       ~600k extra tokens over the session

  With bash-compress:
    Cumulative bash noise:     ~4k tokens (73% less)
    Tokens re-processed:       ~160k extra tokens (saved ~440k)
```

The speed improvement is subtle per-turn but compounds over long sessions. By turn 80 of a build-heavy session, you're processing ~11k fewer tokens per turn — that translates to slightly faster time-to-first-token and meaningfully better prompt cache hit rates.

### Enterprise scale

For teams on Anthropic's API (not the Pro/Max subscription), the savings compound:

| Team size | Model | Tokens saved/month | Cost saved/month | Cost saved/year |
|---|---|---|---|---|
| 10 devs | Sonnet | 6M | $18 | **$212** |
| 10 devs | Opus | 6M | $89 | **$1,062** |
| 50 devs | Sonnet | 30M | $89 | **$1,062** |
| 50 devs | Opus | 30M | $443 | **$5,316** |
| 200 devs | Opus | 118M | $1,772 | **$21,264** |
| 500 devs | Opus | 295M | $4,430 | **$53,160** |

> Based on measured data: ~148k tokens saved per dev per week, 4 weeks/month. Teams with heavier build/test cycles (CI-heavy, monorepos) will save more; teams doing mostly code review will save less.

But the dollar savings are just part of the story. The bigger wins at enterprise scale:

- **Fewer session restarts.** Each session restart costs 5-10 minutes of context switching. Less context bloat = longer sessions = fewer restarts.
- **Reduced compaction amnesia.** When Claude auto-compacts, it forgets earlier decisions. Less noise = fewer compactions = better continuity.
- **Predictable API costs.** Token usage becomes more stable when bash noise is eliminated, making budget forecasting easier.

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

**Or use the one-line installer:**

```bash
curl -fsSL https://raw.githubusercontent.com/Cyvid7-Darus10/claude-bash-compress/main/install.sh | bash
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

## Benchmark

Measure real compression on your own Claude Code sessions:

```bash
node benchmark.mjs
```

```
  Sessions scanned (last 7 days): 107
  Bash outputs over 500 chars:    486
  Compressible:                   213

  COMPRESSION RESULTS
  ───────────────────
  Original total:     805.8k chars
  Compressed total:   215.9k chars
  Saved:              589.9k chars (73.2% reduction)
  Estimated tokens:   ~147,471 tokens saved

  COST PROJECTION (based on your data)
  ─────────────────────────────────────
  Tokens saved/month:  ~589,884
  Sonnet cost saved:   $1.77/month
  Opus cost saved:     $8.85/month
```

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
