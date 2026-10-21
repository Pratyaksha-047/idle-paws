'use strict';

// Parses the user's game links from the extension settings. Each value is "https://site" or
// "Name | https://site"; one value may also hold several entries separated by newlines or commas.
// Unfilled settings arrive as the literal "${user_config.games}" and are ignored.
const parseGames = (values) => {
  const games = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== 'string' || value.startsWith('${')) continue;
    for (const raw of value.split(/[\n,]/)) {
      const entry = raw.trim();
      if (!entry) continue;
      const bar = entry.lastIndexOf('|');
      const name = bar >= 0 ? entry.slice(0, bar).trim() : '';
      const link = (bar >= 0 ? entry.slice(bar + 1) : entry).trim();
      let url;
      try {
        url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`);
      } catch {
        continue;
      }
      if (!['https:', 'http:'].includes(url.protocol) || seen.has(url.href)) continue;
      seen.add(url.href);
      games.push({ name: name || url.hostname.replace(/^www\./, ''), url: url.href });
    }
  }
  return games;
};

module.exports = { parseGames };
