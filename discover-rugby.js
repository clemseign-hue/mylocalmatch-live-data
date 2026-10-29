// Exploration ponctuelle des sites FFR (rugby) : accès direct depuis GitHub (sans ScraperAPI, 0 crédit)
// et repérage des adresses d'API utilisées par les pages. Résultat : debug-rugby.json
const fs = require('fs');
const PAGES = [
  'https://competitions.ffr.fr/',
  'https://competitions.ffr.fr/competitions',
  'https://www.ffr.fr/competitions',
  'https://www.ffr.fr/',
  'https://liguerugbyaura.ffr.fr/',
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

(async () => {
  const out = [];
  for (const url of PAGES) {
    const entry = { url };
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      entry.status = res.status;
      entry.finalUrl = res.url;
      entry.length = text.length;
      entry.framework = ['__NEXT_DATA__', '__NUXT__', '__NUXT_DATA__', 'ng-version', 'data-reactroot', 'wp-content'].filter(k => text.includes(k));
      entry.apiUrls = [...new Set(text.match(/https?:\/\/[^"'\s<>)\\]*(?:api|graphql|json)[^"'\s<>)\\]*/gi) || [])].slice(0, 40);
      entry.scripts = [...new Set([...text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]))].slice(0, 20);
      entry.competitionLinks = [...new Set(text.match(/\/competitions\/[a-z0-9\-\/]+/gi) || [])].slice(0, 40);
      entry.head = text.slice(0, 1500);
      // Cherche aussi les URLs d'API dans les scripts JS de la page
      const js = entry.scripts.filter(s => /\.js/.test(s)).slice(0, 6);
      entry.jsApi = [];
      for (const src of js) {
        try {
          const abs = new URL(src, res.url).href;
          const r = await fetch(abs, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
          const code = await r.text();
          entry.jsApi.push({ src: abs, found: [...new Set(code.match(/https?:\/\/[a-z0-9.\-]*(?:api|graphql)[a-z0-9.\-\/]*/gi) || [])].slice(0, 20), paths: [...new Set(code.match(/["'`]\/(?:api|v\d)\/[a-zA-Z0-9_\-\/{}$.]+["'`]/g) || [])].slice(0, 30) });
        } catch (e) { entry.jsApi.push({ src, error: e.message }); }
      }
    } catch (e) { entry.error = e.message; }
    out.push(entry);
    console.log(entry.status || entry.error, url);
  }
  fs.writeFileSync('debug-rugby.json', JSON.stringify(out, null, 2));
})();
