#!/bin/bash
# Demo script for claude-bash-compress

echo ""
echo "━━━ Step 1: Install (one command) ━━━"
echo ""
echo '$ mkdir -p ~/.claude/hooks'
echo '$ curl -o ~/.claude/hooks/bash-compress.mjs \'
echo '    https://raw.githubusercontent.com/.../bash-compress.mjs'
echo ""
echo "✓ Downloaded bash-compress.mjs to ~/.claude/hooks/"
sleep 1

echo ""
echo "━━━ Step 2: Add to settings.json ━━━"
echo ""
cat <<'CONF'
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "node \"$HOME/.claude/hooks/bash-compress.mjs\""
      }]
    }]
  }
}
CONF
echo ""
echo "✓ Hook registered — only fires on Bash tool calls"
sleep 1

echo ""
echo "━━━ Step 3: See it in action ━━━"
echo ""

echo "Before: npm install output (100 lines, 2.8k chars)"
echo "────────────────────────────────────────────────────"
echo "  installing pkg 0"
echo "  installing pkg 1"
echo "  installing pkg 2"
echo "  ... (97 more lines of noise)"
echo "  added 245 packages in 12s"
echo "  found 0 vulnerabilities"
echo ""
sleep 1

echo "After: compressed by bash-compress (0.4k chars)"
echo "────────────────────────────────────────────────────"

python3 -c "
import json, sys
lines = ['installing pkg ' + str(i) for i in range(100)]
lines.append('added 245 packages in 12s')
lines.append('found 0 vulnerabilities')
payload = json.dumps({'tool_name':'Bash','tool_response':chr(10).join(lines)})
sys.stdout.write(payload)
" | node bash-compress.mjs | python3 -c "
import json, sys
data = json.load(sys.stdin)
ctx = data.get('additionalContext', '')
# Pretty print the compressed output
for line in ctx.split(chr(10)):
    print('  ' + line)
"

echo ""
echo "━━━ 86% reduction — errors & summary preserved ━━━"
echo ""
sleep 1

echo "Running tests..."
echo ""
node bash-compress.test.mjs
