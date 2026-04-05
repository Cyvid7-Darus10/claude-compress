#!/usr/bin/env node

/**
 * Benchmark claude-bash-compress against your real Claude Code sessions.
 *
 * Scans ~/.claude/projects/ for JSONL transcripts, finds all Bash tool
 * results, and measures how much each would be compressed.
 *
 * Usage: node benchmark.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// Inline the compression logic (same as bash-compress.mjs)
const PRESERVE = [/error/i, /warn/i, /fail/i, /exception/i, /✗/, /ENOENT/, /EACCES/]
const MAX = 2000

function compress(output) {
  if (output.length < 500) return null
  const lines = output.split('\n')
  const filtered = lines.filter(l => !/\[=+[>\s]*\]/.test(l) && !/[█░▓▒]{3,}/.test(l))
  const collapsed = []
  let last = '', count = 0
  for (const line of filtered) {
    if (line === last) { count++ } else {
      if (count > 1) collapsed.push(`[repeated ${count}x]`)
      collapsed.push(line); last = line; count = 1
    }
  }
  if (count > 1) collapsed.push(`[repeated ${count}x]`)

  let result
  if (/added \d+ packages?/i.test(output) || /packages? are looking for funding/i.test(output)) {
    const head = collapsed.slice(0, 5), tail = collapsed.slice(-5)
    const parts = [...head, `[... ${collapsed.length - 10} lines omitted ...]`]
    const m = output.match(/added (\d+) packages?/i)
    if (m) parts.push(`Summary: ${m[0]}`)
    parts.push(...tail)
    result = parts.join('\n')
  } else {
    const imp = collapsed.filter(l => PRESERVE.some(p => p.test(l)))
    if (imp.length > 0 && imp.length < collapsed.length * 0.5) {
      result = [...collapsed.slice(0, 5), `[... ${collapsed.length - 10} lines, ${imp.length} important ...]`, ...imp, ...collapsed.slice(-5)].join('\n')
    } else {
      result = collapsed.join('\n')
    }
  }
  if (result.length > MAX) {
    const h = Math.floor(MAX * 0.4), t = Math.floor(MAX * 0.4)
    result = result.slice(0, h) + `\n[truncated ${result.length - h - t} chars]\n` + result.slice(-t)
  }
  return result.length < output.length ? result : null
}

// Scan sessions
const projectsDir = resolve(homedir(), '.claude/projects')
let totalBashCalls = 0
let compressibleCalls = 0
let totalOriginalChars = 0
let totalCompressedChars = 0
let shortCalls = 0
let sessionsScanned = 0
const compressionBuckets = { '0-50%': 0, '50-70%': 0, '70-85%': 0, '85-95%': 0, '95-100%': 0 }
const biggestSavings = []

console.log('')
console.log('  claude-bash-compress benchmark')
console.log('  ──────────────────────────────')
console.log(`  Scanning ${projectsDir}`)
console.log('')

try {
  const dirs = readdirSync(projectsDir, { withFileTypes: true })

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const dirPath = resolve(projectsDir, dir.name)

    let files
    try { files = readdirSync(dirPath).filter(f => f.endsWith('.jsonl')) } catch { continue }

    for (const file of files) {
      const filePath = resolve(dirPath, file)
      try {
        const stat = statSync(filePath)
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
        if (stat.mtimeMs < cutoff) continue

        sessionsScanned++
        const content = readFileSync(filePath, 'utf-8')

        for (const line of content.split('\n')) {
          if (!line) continue
          try {
            const r = JSON.parse(line)

            // Find Bash tool results in user records (tool_result blocks)
            if (r.type === 'user' && Array.isArray(r.message?.content)) {
              for (const block of r.message.content) {
                if (block.type === 'tool_result' && typeof block.content === 'string') {
                  totalBashCalls++
                  const output = block.content
                  if (output.length < 500) { shortCalls++; continue }

                  const compressed = compress(output)
                  if (compressed) {
                    compressibleCalls++
                    totalOriginalChars += output.length
                    totalCompressedChars += compressed.length
                    const ratio = ((1 - compressed.length / output.length) * 100)

                    if (ratio < 50) compressionBuckets['0-50%']++
                    else if (ratio < 70) compressionBuckets['50-70%']++
                    else if (ratio < 85) compressionBuckets['70-85%']++
                    else if (ratio < 95) compressionBuckets['85-95%']++
                    else compressionBuckets['95-100%']++

                    biggestSavings.push({
                      original: output.length,
                      compressed: compressed.length,
                      ratio,
                      preview: output.slice(0, 80).replace(/\n/g, ' '),
                    })
                  }
                }
              }
            }

            // Also check assistant records for Bash tool_use to count calls
            if (r.type === 'assistant' && r.message?.content) {
              for (const block of r.message.content) {
                if (block.type === 'tool_use' && block.name === 'Bash') {
                  // counted via tool_result above
                }
              }
            }
          } catch {}
        }
      } catch { continue }
    }
  }
} catch (e) {
  console.log(`  ✗ Could not scan projects: ${e.message}`)
  process.exit(1)
}

// Results
console.log(`  Sessions scanned (last 7 days): ${sessionsScanned}`)
console.log(`  Total tool results found:       ${totalBashCalls}`)
console.log(`  Short output (< 500 chars):     ${shortCalls} (passed through)`)
console.log(`  Compressible outputs:           ${compressibleCalls}`)
console.log('')

if (compressibleCalls === 0) {
  console.log('  No compressible bash output found in recent sessions.')
  console.log('  This is normal if your sessions are mostly short commands.')
  console.log('')
  process.exit(0)
}

const overallRatio = ((1 - totalCompressedChars / totalOriginalChars) * 100).toFixed(1)
const savedChars = totalOriginalChars - totalCompressedChars
const savedTokens = Math.round(savedChars / 4) // ~4 chars per token

console.log('  COMPRESSION RESULTS')
console.log('  ───────────────────')
console.log(`  Original total:     ${(totalOriginalChars / 1000).toFixed(1)}k chars`)
console.log(`  Compressed total:   ${(totalCompressedChars / 1000).toFixed(1)}k chars`)
console.log(`  Saved:              ${(savedChars / 1000).toFixed(1)}k chars (${overallRatio}% reduction)`)
console.log(`  Estimated tokens:   ~${savedTokens.toLocaleString()} tokens saved`)
console.log('')

console.log('  COMPRESSION DISTRIBUTION')
console.log('  ────────────────────────')
for (const [bucket, count] of Object.entries(compressionBuckets)) {
  if (count === 0) continue
  const bar = '█'.repeat(Math.ceil(count / compressibleCalls * 30))
  console.log(`  ${bucket.padEnd(8)} ${bar} ${count}`)
}
console.log('')

// Top savings
biggestSavings.sort((a, b) => (b.original - b.compressed) - (a.original - a.compressed))
console.log('  TOP 5 BIGGEST SAVINGS')
console.log('  ─────────────────────')
for (const s of biggestSavings.slice(0, 5)) {
  console.log(`  ${(s.original / 1000).toFixed(1)}k → ${(s.compressed / 1000).toFixed(1)}k (${s.ratio.toFixed(0)}%)  ${s.preview.slice(0, 60)}...`)
}

// Cost projection
console.log('')
console.log('  COST PROJECTION (based on your data)')
console.log('  ─────────────────────────────────────')
const tokensPerDay = savedTokens // from last 7 days, so roughly per-week
const tokensPerMonth = tokensPerDay * 4
console.log(`  Tokens saved/week:   ~${savedTokens.toLocaleString()}`)
console.log(`  Tokens saved/month:  ~${tokensPerMonth.toLocaleString()}`)
console.log(`  Sonnet cost saved:   $${(tokensPerMonth / 1_000_000 * 3).toFixed(2)}/month`)
console.log(`  Opus cost saved:     $${(tokensPerMonth / 1_000_000 * 15).toFixed(2)}/month`)
console.log('')
