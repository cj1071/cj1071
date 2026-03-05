import fs from 'node:fs/promises';
import path from 'node:path';

const PROFILE_USER = process.env.PROFILE_USER || 'cj1071';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const ROOT = process.cwd();
const README_PATH = path.join(ROOT, 'README.md');
const STATS_SVG_PATH = path.join(ROOT, 'assets', 'stats-card.svg');
const LANGS_SVG_PATH = path.join(ROOT, 'assets', 'langs-card.svg');

function escapeXml(input) {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeMdCell(input) {
  return String(input || '-')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .trim();
}

async function ghGet(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'cj1071-profile-dashboard-updater',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${url}`);
  }
  return res.json();
}

function yearsSince(isoTime) {
  const from = new Date(isoTime).getTime();
  const now = Date.now();
  const years = (now - from) / (1000 * 60 * 60 * 24 * 365.25);
  return `${Math.max(1, Math.floor(years))}Y+`;
}

function renderStatsSvg(stats) {
  const { publicRepos, ownedRepos, forkRepos, totalStars, followers, accountAge, updatedDate } = stats;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="300" viewBox="0 0 560 300" role="img" aria-label="CJ1071 Stats Card" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1024"/>
      <stop offset="100%" stop-color="#10203a"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="544" height="284" fill="url(#cardBg)" stroke="#39f4ff" stroke-width="3"/>
  <rect x="8" y="8" width="544" height="28" fill="#132b4d"/>
  <text x="20" y="27" fill="#8ff8ff" font-size="14" font-family="monospace">PLAYER STATS PANEL</text>
  <text x="20" y="55" fill="#9fc7ff" font-size="13" font-family="monospace">Last Sync: ${escapeXml(updatedDate)}</text>

  <g font-family="monospace" font-size="16">
    <text x="24" y="90" fill="#8ecbff">Public Repos</text><text x="220" y="90" fill="#eaf9ff">${publicRepos}</text>
    <text x="24" y="116" fill="#8ecbff">Owned Repos</text><text x="220" y="116" fill="#eaf9ff">${ownedRepos}</text>
    <text x="24" y="142" fill="#8ecbff">Fork Repos</text><text x="220" y="142" fill="#eaf9ff">${forkRepos}</text>
    <text x="24" y="168" fill="#8ecbff">Total Stars</text><text x="220" y="168" fill="#eaf9ff">${totalStars}</text>
    <text x="24" y="194" fill="#8ecbff">Followers</text><text x="220" y="194" fill="#eaf9ff">${followers}</text>
    <text x="24" y="220" fill="#8ecbff">Account Age</text><text x="220" y="220" fill="#eaf9ff">${escapeXml(accountAge)}</text>
  </g>

  <text x="300" y="88" fill="#9cfbd9" font-size="14" font-family="monospace">Build Discipline</text>
  <rect x="300" y="96" width="230" height="14" fill="#253755"/><rect x="300" y="96" width="185" height="14" fill="#2ef2c9"/>

  <text x="300" y="140" fill="#9cfbd9" font-size="14" font-family="monospace">Architecture Focus</text>
  <rect x="300" y="148" width="230" height="14" fill="#253755"/><rect x="300" y="148" width="198" height="14" fill="#7cb3ff"/>

  <text x="300" y="192" fill="#9cfbd9" font-size="14" font-family="monospace">Delivery Speed</text>
  <rect x="300" y="200" width="230" height="14" fill="#253755"/><rect x="300" y="200" width="170" height="14" fill="#62fba7"/>
</svg>`;
}

function renderLangsSvg(langs, updatedDate) {
  const rows = langs.slice(0, 4);
  const colors = {
    JavaScript: '#f7df1e',
    TypeScript: '#3178c6',
    Python: '#4b8bbe',
    Vue: '#42b883',
    CSS: '#42a5f5',
    HTML: '#e34c26',
  };

  const baseY = 92;
  const lineH = 48;
  const barW = 470;

  const bars = rows.map((r, i) => {
    const y = baseY + i * lineH;
    const pct = r.percent.toFixed(2);
    const width = Math.max(6, Math.round((r.percent / 100) * barW));
    const color = colors[r.name] || '#8dd6ff';
    return `
    <text x="22" y="${y}" fill="${color}" font-size="15" font-family="monospace">${escapeXml(r.name)} ${pct}%</text>
    <rect x="22" y="${y + 8}" width="${barW}" height="12" fill="#253755"/>
    <rect x="22" y="${y + 8}" width="${width}" height="12" fill="${color}"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="300" viewBox="0 0 560 300" role="img" aria-label="CJ1071 Languages Card" shape-rendering="crispEdges">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0c1028"/>
      <stop offset="100%" stop-color="#12243a"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="544" height="284" fill="url(#bg)" stroke="#5de2ff" stroke-width="3"/>
  <rect x="8" y="8" width="544" height="28" fill="#132b4d"/>
  <text x="20" y="27" fill="#a6f0ff" font-size="14" font-family="monospace">ELEMENTAL LANGS PANEL</text>
  <text x="20" y="55" fill="#95a5c9" font-size="13" font-family="monospace">Non-fork repo language byte share · ${escapeXml(updatedDate)}</text>
  ${bars}
</svg>`;
}

function buildOwnedTableRows(ownedRepos) {
  const rows = ownedRepos
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || a.name.localeCompare(b.name))
    .map((r) => {
      const name = `[${escapeMdCell(r.name)}](${r.html_url})`;
      const tech = escapeMdCell(r.language || '-');
      const stars = r.stargazers_count ?? 0;
      const desc = escapeMdCell(r.description || '-');
      return `| ${name} | ${tech} | ${stars} | ${desc} |`;
    });

  return [
    '| Repository | Tech | Stars | Description |',
    '| --- | --- | ---: | --- |',
    ...rows,
  ].join('\n');
}

function buildForkTableRows(forkRepos) {
  const rows = forkRepos
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || a.name.localeCompare(b.name))
    .map((r) => {
      const name = `[${escapeMdCell(r.name)}](${r.html_url})`;
      const tech = escapeMdCell(r.language || '-');
      const stars = r.stargazers_count ?? 0;
      const why = escapeMdCell(r.description || 'Interesting project I track.');
      return `| ${name} | ${tech} | ${stars} | ${why} |`;
    });

  return [
    '| Repository | Tech | Stars | Why I Forked |',
    '| --- | --- | ---: | --- |',
    ...rows,
  ].join('\n');
}

function replaceBlock(text, start, end, replacement) {
  const startIdx = text.indexOf(start);
  const endIdx = text.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(`Marker block not found: ${start} ... ${end}`);
  }
  const before = text.slice(0, startIdx + start.length);
  const after = text.slice(endIdx);
  return `${before}\n${replacement}\n${after}`;
}

async function main() {
  const [user, repos] = await Promise.all([
    ghGet(`https://api.github.com/users/${PROFILE_USER}`),
    ghGet(`https://api.github.com/users/${PROFILE_USER}/repos?per_page=100&type=owner&sort=updated`),
  ]);

  const ownedRepos = repos.filter((r) => !r.fork);
  const forkRepos = repos.filter((r) => r.fork);

  const langMap = new Map();
  for (const repo of ownedRepos) {
    if (repo.name.toLowerCase() === PROFILE_USER.toLowerCase()) continue;
    const langs = await ghGet(repo.languages_url);
    for (const [name, bytes] of Object.entries(langs)) {
      langMap.set(name, (langMap.get(name) || 0) + Number(bytes || 0));
    }
  }

  const totalLangBytes = Array.from(langMap.values()).reduce((sum, v) => sum + v, 0);
  const langs = Array.from(langMap.entries())
    .map(([name, bytes]) => ({ name, bytes, percent: totalLangBytes > 0 ? (bytes / totalLangBytes) * 100 : 0 }))
    .sort((a, b) => b.bytes - a.bytes);

  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const updatedDate = new Date().toISOString().slice(0, 10);

  const statsSvg = renderStatsSvg({
    publicRepos: user.public_repos ?? repos.length,
    ownedRepos: ownedRepos.length,
    forkRepos: forkRepos.length,
    totalStars,
    followers: user.followers ?? 0,
    accountAge: yearsSince(user.created_at),
    updatedDate,
  });

  const langsSvg = renderLangsSvg(langs, updatedDate);

  await fs.mkdir(path.join(ROOT, 'assets'), { recursive: true });
  await Promise.all([
    fs.writeFile(STATS_SVG_PATH, statsSvg, 'utf8'),
    fs.writeFile(LANGS_SVG_PATH, langsSvg, 'utf8'),
  ]);

  const readme = await fs.readFile(README_PATH, 'utf8');
  const ownedTable = buildOwnedTableRows(ownedRepos);
  const forkTable = buildForkTableRows(forkRepos);

  let nextReadme = replaceBlock(readme, '<!-- OWNED_REPOS_START -->', '<!-- OWNED_REPOS_END -->', ownedTable);
  nextReadme = replaceBlock(nextReadme, '<!-- FORKED_REPOS_START -->', '<!-- FORKED_REPOS_END -->', forkTable);

  await fs.writeFile(README_PATH, nextReadme, 'utf8');

  console.log('Profile dashboard updated:', {
    updatedDate,
    ownedRepos: ownedRepos.length,
    forkRepos: forkRepos.length,
    languages: langs.slice(0, 4).map((l) => `${l.name}:${l.percent.toFixed(2)}%`),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
