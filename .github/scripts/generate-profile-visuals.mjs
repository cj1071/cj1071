import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const USERNAME = process.env.GITHUB_REPOSITORY_OWNER || 'cj1071'

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

async function fetchProfile(token) {
  if (!token) throw new Error('GITHUB_TOKEN is required to generate profile visuals')

  const query = `
    query ProfileVisuals($login: String!) {
      user(login: $login) {
        login
        name
        createdAt
        repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
          totalCount
          nodes {
            name
            stargazerCount
            forkCount
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name color } }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          totalIssueContributions
          totalPullRequestContributions
          totalPullRequestReviewContributions
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays { contributionCount date weekday color }
            }
          }
        }
      }
    }
  `

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'cj1071-profile-visuals',
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  })
  if (!response.ok) throw new Error(`GitHub GraphQL request failed with HTTP ${response.status}`)

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${payload.errors.map((error) => error.message).join('; ')}`)
  }
  if (!payload.data?.user) throw new Error(`GitHub user ${USERNAME} was not found`)
  return payload.data.user
}

function cardStyle() {
  return `
    <style>
      .frame { fill: transparent; stroke: #d0d7de; }
      .title { fill: #24292f; font: 700 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .label { fill: #57606a; font: 500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .value { fill: #24292f; font: 700 21px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .grid { stroke: #d8dee4; }
      .item { opacity: 0; animation: rise .55s ease-out forwards; }
      @keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-color-scheme: dark) {
        .frame { stroke: #30363d; }
        .title, .value { fill: #f0f6fc; }
        .label { fill: #8b949e; }
        .grid { stroke: #30363d; }
      }
      @media (prefers-reduced-motion: reduce) { .item { opacity: 1; animation: none; } }
    </style>`
}

function weeklyTotals(calendar) {
  return calendar.weeks.map((week) => week.contributionDays.reduce(
    (sum, day) => sum + day.contributionCount,
    0,
  ))
}

function profileDetailsSvg(user) {
  const collection = user.contributionsCollection
  const totals = weeklyTotals(collection.contributionCalendar)
  const max = Math.max(...totals, 1)
  const points = totals.map((value, index) => {
    const x = 34 + index * (692 / Math.max(totals.length - 1, 1))
    const y = 149 - (value / max) * 58
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const metrics = [
    ['Contributions', collection.contributionCalendar.totalContributions],
    ['Commits', collection.totalCommitContributions],
    ['Pull requests', collection.totalPullRequestContributions],
    ['Repositories', user.repositories.totalCount],
  ]
  const metricSvg = metrics.map(([label, value], index) => {
    const x = 48 + index * 178
    return `<g class="item" style="animation-delay:${index * 110}ms"><text x="${x}" y="64" class="value">${value}</text><text x="${x}" y="83" class="label">${label}</text></g>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="180" viewBox="0 0 760 180" role="img">
    <title>${escapeXml(user.login)} contribution overview</title>
    <desc>Public GitHub contribution totals and weekly activity trend.</desc>
    ${cardStyle()}
    <rect x="1" y="1" width="758" height="178" rx="8" class="frame"/>
    <text x="28" y="32" class="title">${escapeXml(user.login)} · Contribution Overview</text>
    ${metricSvg}
    <line x1="30" y1="153" x2="730" y2="153" class="grid"/>
    <polyline points="${points}" fill="none" stroke="#2f81f7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1">
      <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.6s" fill="freeze"/>
    </polyline>
  </svg>`
}

function statsSvg(user) {
  const repositories = user.repositories.nodes
  const collection = user.contributionsCollection
  const values = [
    ['Total stars', repositories.reduce((sum, repo) => sum + repo.stargazerCount, 0), '#d29922'],
    ['Total forks', repositories.reduce((sum, repo) => sum + repo.forkCount, 0), '#ff7b72'],
    ['Issues', collection.totalIssueContributions, '#58a6ff'],
    ['PR reviews', collection.totalPullRequestReviewContributions, '#a371f7'],
  ]
  const rows = values.map(([label, value, color], index) => {
    const y = 66 + index * 27
    return `<g class="item" style="animation-delay:${index * 120}ms"><circle cx="31" cy="${y - 5}" r="5" fill="${color}"/><text x="46" y="${y}" class="label">${label}</text><text x="326" y="${y}" text-anchor="end" class="value" font-size="17">${value}</text></g>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180" role="img">
    <title>${escapeXml(user.login)} GitHub statistics</title>
    <desc>Stars, forks, issues, and pull request review totals for public GitHub activity.</desc>
    ${cardStyle()}
    <rect x="1" y="1" width="358" height="178" rx="8" class="frame"/>
    <text x="22" y="34" class="title">GitHub Statistics</text>
    ${rows}
  </svg>`
}

function languageData(repositories) {
  const totals = new Map()
  for (const repository of repositories) {
    for (const edge of repository.languages.edges) {
      const current = totals.get(edge.node.name) || { size: 0, color: edge.node.color || '#8b949e' }
      current.size += edge.size
      totals.set(edge.node.name, current)
    }
  }
  return [...totals.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5)
}

function languagesSvg(user) {
  const languages = languageData(user.repositories.nodes)
  const total = Math.max(languages.reduce((sum, language) => sum + language.size, 0), 1)
  const rows = languages.map((language, index) => {
    const y = 59 + index * 24
    const width = Math.max(5, 172 * language.size / total)
    const percent = (100 * language.size / total).toFixed(1)
    return `<g class="item" style="animation-delay:${index * 120}ms"><text x="24" y="${y}" class="label">${escapeXml(language.name)}</text><rect x="128" y="${y - 11}" width="172" height="8" rx="4" fill="#d8dee4" opacity=".5"/><rect x="128" y="${y - 11}" width="${width.toFixed(1)}" height="8" rx="4" fill="${language.color}"/><text x="332" y="${y}" text-anchor="end" class="label">${percent}%</text></g>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" viewBox="0 0 360 180" role="img">
    <title>${escapeXml(user.login)} public repository languages</title>
    <desc>Top languages by byte count across owned public repositories.</desc>
    ${cardStyle()}
    <rect x="1" y="1" width="358" height="178" rx="8" class="frame"/>
    <text x="22" y="32" class="title">Repository Languages</text>
    ${rows || '<text x="22" y="70" class="label">No language data available</text>'}
  </svg>`
}

function contribution3dSvg(user) {
  const days = user.contributionsCollection.contributionCalendar.weeks
    .flatMap((week, weekIndex) => week.contributionDays.map((day) => ({ ...day, weekIndex })))
    .sort((a, b) => (a.weekIndex + a.weekday) - (b.weekIndex + b.weekday))

  const colors = ['#21262d', '#0e4429', '#006d32', '#26a641', '#39d353']
  const blocks = days.map((day, index) => {
    const level = day.contributionCount === 0 ? 0 : Math.min(4, 1 + Math.floor(Math.log2(day.contributionCount + 1)))
    const height = day.contributionCount === 0 ? 2 : 7 + level * 7
    const x = 88 + day.weekIndex * 13 + day.weekday * 5
    const y = 126 + day.weekday * 10 - day.weekIndex * 0.35
    const topY = y - height
    const color = colors[level]
    const left = level === 0 ? '#161b22' : color
    return `<g opacity="0" style="animation: block-in .35s ${Math.min(index * 3, 900)}ms ease-out forwards"><title>${day.date}: ${day.contributionCount} contributions</title><polygon points="${x},${topY} ${x + 7},${topY - 4} ${x + 14},${topY} ${x + 7},${topY + 4}" fill="${color}"/><polygon points="${x},${topY} ${x + 7},${topY + 4} ${x + 7},${y + 4} ${x},${y}" fill="${left}" opacity=".72"/><polygon points="${x + 7},${topY + 4} ${x + 14},${topY} ${x + 14},${y} ${x + 7},${y + 4}" fill="${color}" opacity=".9"/></g>`
  }).join('')

  const total = user.contributionsCollection.contributionCalendar.totalContributions
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420" role="img">
    <title>${escapeXml(user.login)} 3D contribution graph</title>
    <desc>An isometric animated graph of ${total} public contributions over the last year.</desc>
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0d1117"/><stop offset="1" stop-color="#161b22"/></linearGradient></defs>
    <style>
      .heading { fill: #f0f6fc; font: 700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .sub { fill: #8b949e; font: 500 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      @keyframes block-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) { g { opacity: 1 !important; animation: none !important; } }
    </style>
    <rect width="900" height="420" rx="12" fill="url(#bg)"/>
    <text x="36" y="45" class="heading">${escapeXml(user.login)} · Contribution Skyline</text>
    <text x="36" y="70" class="sub">${total} contributions · generated from public GitHub data</text>
    <g transform="translate(0 70)">${blocks}</g>
    <path d="M84 355L788 336L827 388L123 407Z" fill="#0d1117" stroke="#30363d"/>
    <g transform="translate(36 378)"><rect width="12" height="12" rx="2" fill="#21262d"/><rect x="20" width="12" height="12" rx="2" fill="#0e4429"/><rect x="40" width="12" height="12" rx="2" fill="#006d32"/><rect x="60" width="12" height="12" rx="2" fill="#26a641"/><rect x="80" width="12" height="12" rx="2" fill="#39d353"/><text x="104" y="11" class="sub">Less → More</text></g>
  </svg>`
}

async function main() {
  const user = await fetchProfile(process.env.GITHUB_TOKEN)
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd()
  const cardDir = path.join(workspace, 'profile-summary-card-output', 'transparent')
  const contributionDir = path.join(workspace, 'profile-3d-contrib')
  await mkdir(cardDir, { recursive: true })
  await mkdir(contributionDir, { recursive: true })

  await Promise.all([
    writeFile(path.join(cardDir, '0-profile-details.svg'), profileDetailsSvg(user), 'utf8'),
    writeFile(path.join(cardDir, '1-repos-per-language.svg'), languagesSvg(user), 'utf8'),
    writeFile(path.join(cardDir, '3-stats.svg'), statsSvg(user), 'utf8'),
    writeFile(path.join(contributionDir, 'profile-night-rainbow.svg'), contribution3dSvg(user), 'utf8'),
  ])
  console.log('Generated local profile statistics and 3D contribution visuals.')
}

await main()
