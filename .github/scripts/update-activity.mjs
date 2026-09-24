import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const START_MARKER = '<!--RECENT_ACTIVITY:start-->'
const END_MARKER = '<!--RECENT_ACTIVITY:end-->'

function safeText(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replaceAll('\n', ' ')
    .trim()
}

function repoLink(repoName) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName ?? '')) return null
  return `[${repoName}](https://github.com/${repoName})`
}

function formatEvent(event) {
  const repository = repoLink(event?.repo?.name)
  if (!repository) return null

  switch (event.type) {
    case 'PushEvent': {
      const count = event.payload?.commits?.length ?? event.payload?.size ?? 0
      const noun = count === 1 ? 'commit' : 'commits'
      return `- ⬆️ ${repository}: Pushed ${count} ${noun}`
    }
    case 'IssuesEvent': {
      const action = safeText(event.payload?.action || 'updated')
      const number = event.payload?.issue?.number
      if (!number) return null
      return `- ❗ ${repository}: ${capitalize(action)} issue #${number}`
    }
    case 'PullRequestEvent': {
      const action = safeText(event.payload?.action || 'updated')
      const number = event.payload?.pull_request?.number
      if (!number) return null
      return `- 🔀 ${repository}: ${capitalize(action)} pull request #${number}`
    }
    case 'CreateEvent': {
      const refType = safeText(event.payload?.ref_type || 'repository')
      const ref = safeText(event.payload?.ref)
      const suffix = ref ? ` \`${ref}\`` : ''
      return `- ✨ ${repository}: Created ${refType}${suffix}`
    }
    case 'ForkEvent': {
      const forkName = safeText(event.payload?.forkee?.full_name)
      if (!forkName) return null
      return `- 🍴 ${repository}: Forked to [${forkName}](https://github.com/${forkName})`
    }
    case 'ReleaseEvent': {
      const tag = safeText(event.payload?.release?.tag_name || 'a new release')
      return `- 🚀 ${repository}: Published release \`${tag}\``
    }
    case 'WatchEvent':
      return `- ⭐ ${repository}: Starred the repository`
    default:
      return null
  }
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

export function renderActivity(events, limit = 5) {
  return events
    .map(formatEvent)
    .filter(Boolean)
    .slice(0, limit)
    .join('\n')
}

export function replaceActivityBlock(readme, activity) {
  const pattern = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`)
  if (!pattern.test(readme)) {
    throw new Error('Recent activity markers are missing from README.md')
  }
  return readme.replace(pattern, `${START_MARKER}\n${activity}\n${END_MARKER}`)
}

async function updateReadme() {
  const username = process.env.GITHUB_REPOSITORY_OWNER || 'cj1071'
  const token = process.env.GITHUB_TOKEN
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cj1071-profile-activity',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=30`,
    { headers },
  )
  if (!response.ok) {
    throw new Error(`GitHub events request failed with HTTP ${response.status}`)
  }

  const activity = renderActivity(await response.json())
  if (!activity) {
    console.log('No supported public activity found; README.md was not changed.')
    return
  }

  const workspace = process.env.GITHUB_WORKSPACE || process.cwd()
  const readmePath = path.join(workspace, 'README.md')
  const current = await readFile(readmePath, 'utf8')
  const updated = replaceActivityBlock(current, activity)
  if (updated === current) {
    console.log('Recent activity is already current.')
    return
  }

  await writeFile(readmePath, updated, 'utf8')
  console.log('README.md recent activity was updated.')
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  await updateReadme()
}
