#!/usr/bin/env node
// Cuts a release: checks the tree, runs tests and build, bumps package.json and the README badge,
// regenerates CHANGELOG.md from the git tags, commits "chore: release X", tags vX and pushes.
//
//   npm run release -- <version|major|minor|patch> [--message "tag text"] [--dry-run] [--no-push] [--skip-checks]
//   npm run release -- --sync-releases        # GitHub release entries for tags that have none
//
// The tag text defaults to the commit subjects since the last tag. After the push a GitHub release
// with the changelog section is created through gh, if gh is logged in as the repository owner.
// No dependencies.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dryRun = flag('--dry-run')
const spec = args.find((a) => !a.startsWith('--') && a !== option('--message'))
const syncOnly = flag('--sync-releases')

function git(...a) {
  return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()
}
function run(cmd, cmdArgs) {
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit' })
}
function fail(msg) {
  console.error(`release: ${msg}`)
  process.exit(1)
}

// --- version -------------------------------------------------------------------------------------
const pkgPath = resolve(root, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
function bump(current, how) {
  const [ma, mi, pa] = current.split('.').map(Number)
  if (how === 'major') return `${ma + 1}.0.0`
  if (how === 'minor') return `${ma}.${mi + 1}.0`
  if (how === 'patch') return `${ma}.${mi}.${pa + 1}`
  if (/^\d+\.\d+\.\d+$/.test(how)) return how
  return null
}
if (!spec && !flag('--sync-releases')) fail('usage: npm run release -- <version|major|minor|patch> [--message "..."] [--dry-run] [--no-push]')
const version = spec ? bump(pkg.version, spec) : null
if (spec && !version) fail(`not a version: ${spec}`)
if (version === pkg.version) fail(`already at ${version}`)
if (version && git('tag', '-l', `v${version}`)) fail(`tag v${version} exists`)

// --- history -------------------------------------------------------------------------------------
const tags = git('tag', '-l', 'v*', '--sort=version:refname').split('\n').filter(Boolean)
const lastTag = tags[tags.length - 1]
const RELEASE_RE = /^chore: release \d/
function subjectsBetween(from, to) {
  const range = from ? `${from}..${to}` : to
  return git('log', range, '--format=%s')
    .split('\n')
    .filter((s) => s && !RELEASE_RE.test(s))
}
function tagInfo(tag) {
  const date = git('log', '-1', '--format=%cs', tag)
  const message = git('tag', '-l', '--format=%(contents:subject)', tag)
  return { date, message }
}

// --- github releases -----------------------------------------------------------------------------
const repo = (pkg.repository?.url ?? '').match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1]
function ghLogin() {
  try {
    return execFileSync('gh', ['api', 'user', '--jq', '.login'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}
function ghReady() {
  if (!repo) return 'no GitHub repository in package.json'
  const login = ghLogin()
  const owner = repo.split('/')[0]
  if (!login) return 'gh is not available or not logged in'
  if (login.toLowerCase() !== owner.toLowerCase()) return `gh is logged in as ${login}, not ${owner}`
  return null
}
function ghReleaseExists(tag) {
  try {
    execFileSync('gh', ['release', 'view', tag, '--repo', repo], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
function ghReleaseCreate(tag, message, subjects) {
  const notes = [message, '', ...subjects.map((s) => `- ${s}`)].join('\n')
  execFileSync('gh', ['release', 'create', tag, '--repo', repo, '--title', tag, '--notes', notes, '--verify-tag'], { cwd: root, stdio: 'inherit' })
}

if (syncOnly) {
  const why = ghReady()
  if (why) fail(why)
  let created = 0
  for (let i = 0; i < tags.length; i++) {
    if (ghReleaseExists(tags[i])) continue
    const { message } = tagInfo(tags[i])
    ghReleaseCreate(tags[i], message, subjectsBetween(tags[i - 1], tags[i]))
    created++
  }
  console.log(`release: ${created} GitHub release(s) created, ${tags.length - created} existed`)
  process.exit(0)
}

const pending = subjectsBetween(lastTag, 'HEAD')
if (pending.length === 0) fail(`nothing to release since ${lastTag}`)
const message =
  option('--message') ??
  pending
    .map((s) => s.replace(/^[a-z]+(\([^)]*\))?!?: /, ''))
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('; ')
// Local date, like git's %cs for the older sections.
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

// --- changelog -----------------------------------------------------------------------------------
function section(version, date, message, subjects) {
  const lines = [`## ${version} (${date})`, '', message, '']
  for (const s of subjects) lines.push(`- ${s}`)
  return lines.join('\n')
}
function renderChangelog() {
  const parts = ['# Changelog', '', 'Every release, newest first. Generated by `scripts/release.mjs` from the git tags.', '']
  parts.push(section(version, today, message, pending))
  for (let i = tags.length - 1; i >= 0; i--) {
    const { date, message } = tagInfo(tags[i])
    parts.push('', section(tags[i].slice(1), date, message, subjectsBetween(tags[i - 1], tags[i])))
  }
  return parts.join('\n') + '\n'
}

// --- plan ----------------------------------------------------------------------------------------
console.log(`release: ${pkg.version} -> ${version}`)
console.log(`release: tag v${version}: ${message}`)
console.log(`release: ${pending.length} commit(s) since ${lastTag ?? 'the beginning'}`)
if (dryRun) {
  console.log('release: dry run, nothing written')
  process.exit(0)
}

if (git('status', '--porcelain')) fail('working tree is not clean')
if (git('branch', '--show-current') !== 'main') fail('not on main')

if (!flag('--skip-checks')) {
  run('npm', ['test'])
  run('npm', ['run', 'build'])
}

// --- write ---------------------------------------------------------------------------------------
run('npm', ['version', version, '--no-git-tag-version'])
const readmePath = resolve(root, 'README.md')
if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8')
  const next = readme.replace(/release-v\d+\.\d+\.\d+-/g, `release-v${version}-`)
  if (next !== readme) writeFileSync(readmePath, next)
}
writeFileSync(resolve(root, 'CHANGELOG.md'), renderChangelog())

git('add', 'package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md')
git('commit', '-q', '-m', `chore: release ${version}`)
git('tag', '-a', `v${version}`, '-m', message)
console.log(`release: committed and tagged v${version}`)
if (!flag('--no-push')) {
  run('git', ['push', 'origin', 'main', '--follow-tags'])
  console.log('release: pushed')
  const why = ghReady()
  if (why) console.log(`release: no GitHub release (${why})`)
  else {
    ghReleaseCreate(`v${version}`, message, pending)
    console.log(`release: GitHub release v${version} created`)
  }
}
