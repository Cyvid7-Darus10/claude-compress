#!/usr/bin/env node

/**
 * claude-savings: PreToolUse hook — blocks duplicate file reads.
 *
 * When Claude tries to Read a file it already read in this session
 * (same path, same offset/limit), the hook blocks with decision: "block"
 * and tells Claude the file is already in context.
 *
 * This prevents the full file content from being re-added to the
 * conversation, saving ~316k tokens/week in measured usage.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const STATE_DIR = resolve(homedir(), '.claude-savings')
const STATE_FILE = resolve(STATE_DIR, 'read-cache.json')

function readState() {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf-8')) } catch { return {} }
}

function writeState(data) {
  try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(data)) } catch {}
}

let data = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', chunk => { data += chunk })
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data)

    if (input.tool_name !== 'Read') {
      process.stdout.write('{}')
      return
    }

    const filePath = input.tool_input?.file_path
    if (!filePath) {
      process.stdout.write('{}')
      return
    }

    const offset = input.tool_input?.offset || 0
    const limit = input.tool_input?.limit || 0
    const sessionId = input.session_id || 'default'

    const state = readState()
    if (!state[sessionId]) state[sessionId] = {}

    // Build a key from path + offset + limit (same params = same content)
    const key = `${filePath}:${offset}:${limit}`
    const shortPath = filePath.split('/').slice(-3).join('/')

    if (state[sessionId][key]) {
      // Already read with exact same params — block it
      const readCount = state[sessionId][key] + 1
      state[sessionId][key] = readCount
      writeState(state)

      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `[claude-savings] ${shortPath} was already read in this session with the same parameters. ` +
          `The file content is already in your conversation context — scroll up to find it. ` +
          `If the file may have changed, use a different offset/limit or check with Bash.`
      }))
      return
    }

    // First read — record it
    state[sessionId][key] = 1
    writeState(state)
    process.stdout.write('{}')
  } catch {
    process.stdout.write('{}')
  }
})
