#!/bin/bash
# claude-savings installer
# Usage: curl -fsSL https://raw.githubusercontent.com/Cyvid7-Darus10/claude-savings/main/install.sh | bash

set -e

HOOK_DIR="$HOME/.claude/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"
REPO="https://raw.githubusercontent.com/Cyvid7-Darus10/claude-savings/main"

echo ""
echo "  claude-savings installer"
echo "  ────────────────────────"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js not found. Install Node.js 20+ first."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "  ✗ Node.js $NODE_VERSION found, but 20+ required."
  exit 1
fi
echo "  ✓ Node.js $(node -v) detected"

# Download both hooks
mkdir -p "$HOOK_DIR"

if curl -fsSL -o "$HOOK_DIR/pre-read.mjs" "$REPO/pre-read.mjs"; then
  echo "  ✓ Downloaded pre-read.mjs (blocks duplicate file reads)"
else
  echo "  ✗ Failed to download pre-read.mjs"
  exit 1
fi

if curl -fsSL -o "$HOOK_DIR/compress.mjs" "$REPO/compress.mjs"; then
  echo "  ✓ Downloaded compress.mjs (output compression + loop detection)"
else
  echo "  ✗ Failed to download compress.mjs"
  exit 1
fi

# Check if settings.json exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "  ✗ $SETTINGS_FILE not found. Is Claude Code installed?"
  echo "    Run Claude Code once first, then re-run this installer."
  exit 1
fi

# Check if already installed
if grep -q "claude-savings\|pre-read.mjs" "$SETTINGS_FILE" 2>/dev/null; then
  echo "  ✓ Hooks already registered in settings.json (skipped)"
  echo ""
  echo "  Done! Restart Claude Code to activate."
  echo ""
  exit 0
fi

# Add hooks to settings.json using Node.js (safe JSON manipulation)
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf-8'));

if (!settings.hooks) settings.hooks = {};

// PreToolUse — block duplicate reads
if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
const preExists = settings.hooks.PreToolUse.some(h =>
  h.hooks?.some(hook => hook.command?.includes('pre-read'))
);
if (!preExists) {
  settings.hooks.PreToolUse.unshift({
    matcher: 'Read',
    hooks: [{ type: 'command', command: 'node \"\$HOME/.claude/hooks/pre-read.mjs\"' }]
  });
  console.log('  ✓ PreToolUse hook registered (duplicate read blocking)');
}

// PostToolUse — compression + loop detection
if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
const postExists = settings.hooks.PostToolUse.some(h =>
  h.hooks?.some(hook => hook.command?.includes('compress.mjs'))
);
if (!postExists) {
  settings.hooks.PostToolUse.unshift({
    matcher: '',
    hooks: [{ type: 'command', command: 'node \"\$HOME/.claude/hooks/compress.mjs\"' }]
  });
  console.log('  ✓ PostToolUse hook registered (compression + loop detection)');
}

fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(settings, null, 2) + '\n');
"

echo ""
echo "  Done! Restart Claude Code to activate."
echo ""
echo "  What's now active:"
echo "    • Duplicate file reads are blocked (PreToolUse)"
echo "    • Verbose output is compressed (PostToolUse)"
echo "    • Repeated failing commands are detected (PostToolUse)"
echo ""
