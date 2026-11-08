#!/usr/bin/env node
/**
 * Adiciona filmes novos em data/movies.json usando a API do TMDB.
 * Mantém sempre alguns dias de folga no futuro, para o jogo não parar se o
 * GitHub Actions atrasar. As imagens NÃO são baixadas: o jogo usa as URLs do
 * CDN do TMDB, então o repositório não cresce com o tempo.
 *
 * Uso:  TMDB_TOKEN=... node scripts/add-daily-movie.mjs
 *       (ou TMDB_API_KEY=... com a chave v3)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOVIES = join(ROOT, 'data', 'movies.json');
const TITLES = join(ROOT, 'data', 'titles.json');
const BUFFER_DAYS = Number(process.env.BUFFER_DAYS || 3);
const IMG = 'https://image.tmdb.org/t/p/w1280';
const API = 'https://api.themoviedb.org/3';

const token = process.env.TMDB_TOKEN;
const apiKey = process.env.TMDB_API_KEY;
if (!token && !apiKey) {
  console.error('Defina TMDB_TOKEN (token de leitura v4) ou TMDB_API_KEY (chave v3).');
  process.exit(1);
}

async function tmdb(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!token) url.searchParams.set('api_key', apiKey);
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}`, accept: 'application/json' } : {} });
  if (!res.ok) throw new Error(`TMDB ${res.status} em ${path}: ${await res.text()}`);
  return res.json();
}

const DAY_MS = 86400000;
const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const todayIn = (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const label = (title, year) => `${title} (${year})`;
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const DISCOVER = { language: 'pt-BR', sort_by: 'vote_count.desc', 'vote_count.gte': '3000', include_adult: 'false' };

async function nextMovie(used) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const page = 1 + Math.floor(Math.random() * 25); // ~500 filmes mais votados
    const { results = [] } = await tmdb('/discover/movie', { ...DISCOVER, page });
    for (const cand of shuffle(results)) {
      if (cand.adult || used.has(cand.id) || !cand.release_date) continue;
      const movie = await tmdb(`/movie/${cand.id}`, { language: 'pt-BR' });
      // só imagens sem texto (sem o título do filme escrito)
      const { backdrops = [] } = await tmdb(`/movie/${cand.id}/images`, { include_image_language: 'null' });
      const good = backdrops.filter((b) => b.width >= 1280).sort((a, b) => b.vote_count - a.vote_count || b.vote_average - a.vote_average);
      if (good.length < 6) { console.log(`  pulando ${movie.title}: só ${good.length} imagens`); used.add(cand.id); continue; }

      // 6 imagens entre as 12 mais votadas; a mais icônica fica por último
      const chosen = shuffle(good.slice(0, 12)).slice(0, 6).sort((a, b) => a.vote_average - b.vote_average || a.vote_count - b.vote_count);
      const title = movie.title || cand.title;
      const year = Number(movie.release_date.slice(0, 4));
      const aliases = [...new Set([movie.original_title].filter((t) => t && norm(t) !== norm(title)))];
      return { title, year, tmdbId: movie.id, aliases, frames: chosen.map((b) => IMG + b.file_path) };
    }
  }
  throw new Error('Não foi possível encontrar um filme novo com imagens suficientes.');
}

async function refreshTitles(data) {
  let titles = [];
  try { titles = JSON.parse(await readFile(TITLES, 'utf8')); } catch { /* arquivo novo */ }
  const map = new Map(titles.map((t) => [norm(t), t]));
  const add = (t, y) => { const l = label(t, y); if (!map.has(norm(l))) map.set(norm(l), l); };
  data.days.forEach((m) => add(m.title, m.year));

  // na primeira vez, preenche o autocompletar com os filmes mais populares
  const pages = map.size < 500 ? 25 : 2;
  for (let page = 1; page <= pages; page++) {
    const { results = [] } = await tmdb('/discover/movie', { ...DISCOVER, 'vote_count.gte': '1500', page });
    results.forEach((r) => r.release_date && add(r.title, r.release_date.slice(0, 4)));
  }
  const out = [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  await writeFile(TITLES, JSON.stringify(out, null, 0).replace(/","/g, '",\n"').replace(/^\[/, '[\n').replace(/\]$/, '\n]\n'));
  return out.length;
}

function serialize(data) {
  const days = data.days.map((d) => '    ' + JSON.stringify(d).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/^\{/, '{ ').replace(/\}$/, ' }'));
  return `{\n  "startDate": ${JSON.stringify(data.startDate)},\n  "timeZone": ${JSON.stringify(data.timeZone)},\n  "days": [\n${days.join(',\n')}\n  ]\n}\n`;
}

const data = JSON.parse(await readFile(MOVIES, 'utf8'));
const today = Math.floor((toUTC(todayIn(data.timeZone)) - toUTC(data.startDate)) / DAY_MS) + 1;
const target = today + BUFFER_DAYS;
const used = new Set(data.days.map((d) => d.tmdbId));
let last = data.days.length ? data.days[data.days.length - 1].day : 0;

console.log(`Hoje é o dia ${today}. Último dia cadastrado: ${last}. Meta: ${target}.`);
let added = 0;
while (last < target) {
  const movie = await nextMovie(used);
  last += 1;
  used.add(movie.tmdbId);
  data.days.push({ day: last, ...movie });
  added++;
  console.log(`  dia ${last}: ${label(movie.title, movie.year)}`);
}

if (added) await writeFile(MOVIES, serialize(data));
const total = await refreshTitles(data);
console.log(`${added} filme(s) adicionado(s). Autocompletar com ${total} títulos.`);
