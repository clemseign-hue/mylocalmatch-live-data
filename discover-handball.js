// Vérification ponctuelle (0 crédit) : règles d'accès de ffhandball.fr (robots.txt) et structure
// des pages publiques de compétitions. Robot identifié honnêtement. Résultat : debug-handball.json
const fs = require('fs');
const UA = 'MyLocalMatch/1.0 (+https://github.com/clemseign-hue/mylocalmatch-live-data)';
const PAGES = ['https://www.ffhandball.fr/robots.txt', 'https://www.ffhandball.fr/competitions/'];

(async () => {
  const out = [];
  for (const url of PAGES) {
    const e = { url };
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      const text = await r.text();
      Object.assign(e, { status: r.status, finalUrl: r.url, length: text.length });
      if (url.endsWith('robots.txt')) e.robots = text.slice(0, 3000);
      else {
        e.links = [...new Set(text.match(/https?:\/\/(?:www\.)?ffhandball\.fr\/competitions\/[^"'\s<>]+/g) || [])].slice(0, 40);
        e.hasStructuredData = /application\/ld\+json/.test(text);
        e.head = text.slice(0, 800);
      }
    } catch (err) { e.error = err.message; }
    out.push(e);
    console.log(e.status || e.error, url);
    await new Promise(r => setTimeout(r, 2000));
  }
  fs.writeFileSync('debug-handball.json', JSON.stringify(out, null, 2));
})();
