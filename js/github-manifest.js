// Discovers the bundled MIDI files directly from the GitHub repo serving
// this page, via GitHub's public REST API — so dropping a new .mid file
// into midi/ and pushing is enough on its own; nothing else to edit.
//
// Falls back to the static list in js/manifest.js (MIDI_MANIFEST) if this
// fails for any reason: not hosted on github.io (e.g. local testing via
// `python3 -m http.server`), offline, or GitHub's API rate limit hit
// (60 unauthenticated requests/hour per visitor's IP — plenty for normal
// use, but real, hence the fallback).

const GitHubManifest = (() => {

  function detectRepo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return null;
    const owner = m[1];
    const parts = location.pathname.split('/').filter(Boolean);
    // User/organization site (owner.github.io) serves from the domain
    // root; a project site serves from /repo-name/, so the first path
    // segment is the repo name in that case.
    const repo = parts.length > 0 ? parts[0] : `${owner}.github.io`;
    return { owner, repo };
  }

  async function fetchList() {
    const info = detectRepo();
    if (!info) throw new Error('not served from github.io');

    const cacheKey = `velovibe-manifest:${info.owner}/${info.repo}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);

    const url = `https://api.github.com/repos/${info.owner}/${info.repo}/contents/midi`;
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
    const data = await res.json();

    const names = data
      .filter(item => item.type === 'file' && /\.midi?$/i.test(item.name))
      .map(item => item.name);

    if (names.length === 0) throw new Error('GitHub API returned no MIDI files');

    try { sessionStorage.setItem(cacheKey, JSON.stringify(names)); } catch (_) { /* storage full/disabled — fine */ }
    return names;
  }

  return { fetchList };
})();
