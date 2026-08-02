#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const markdown = walk(root).filter(file => file.endsWith('.md'))
const errors = []

for (const file of markdown) {
  const text = fs.readFileSync(file, 'utf8')
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of text.matchAll(linkPattern)) {
    let target = match[1].trim().replace(/^<|>$/g, '')
    if (!target || target.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    target = target.split(/\s+["']/)[0].split('#')[0].split('?')[0]
    try { target = decodeURIComponent(target) } catch {}
    const resolved = path.resolve(path.dirname(file), target)
    if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) {
      const line = text.slice(0, match.index).split('\n').length
      errors.push(`${path.relative(root, file)}:${line}: missing ${match[1]}`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Documentation link check passed (${markdown.length} files).`)

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') return []
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(absolute) : [absolute]
  })
}
