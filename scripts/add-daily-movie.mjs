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
const CANDIDATES = join(ROOT, 'data', 'candidatos.json');
// ~1 mês de filmes já cadastrados à frente, para dar tempo de escolher as imagens
// de todos de uma vez na página de curadoria
const BUFFER_DAYS = Number(process.env.BUFFER_DAYS || 35);
const MIN_IMAGES = 10;      // filmes com menos imagens diferentes que isso são pulados
const MAX_CANDIDATES = 80;  // imagens oferecidas na página de curadoria
const CANDIDATES_VERSION = 2; // mudou o jeito de gerar a lista? aumente para refazer todos os dias
const IMG = 'https://image.tmdb.org/t/p/w1280';
const THUMB = 'https://image.tmdb.org/t/p/w300';
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

/**
 * Comparação visual: a mesma foto às vezes aparece no TMDB como arquivos
 * diferentes. Cada imagem vira uma "impressão digital" de 64 bits (dHash),
 * calculada sobre a versão pequena; impressões quase iguais = mesma foto.
 * Precisa do pacote jpeg-js (o workflow instala); sem ele, a comparação é pulada.
 */
let jpeg = null;
try { jpeg = (await import('jpeg-js')).default; } catch { console.warn('jpeg-js não encontrado: fotos repetidas não serão detectadas.'); }
const SAME_PHOTO = 10; // bits diferentes (de 64) até onde ainda é a mesma foto
const hashCache = new Map();
const fileOf = (url) => url.slice(url.lastIndexOf('/'));

async function dhash(url) {
  const file = fileOf(url);
  if (!jpeg) return null;
  if (hashCache.has(file)) return hashCache.get(file);
  let hash = null;
  try {
    const res = await fetch(THUMB + file);
    if (res.ok) {
      const { width, height, data } = jpeg.decode(Buffer.from(await res.arrayBuffer()), { useTArray: true, formatAsRGBA: true });
      const W = 9, H = 8, sum = new Float64Array(W * H), count = new Uint32Array(W * H);
      for (let y = 0; y < height; y++) {
        const row = Math.floor((y * H) / height) * W;
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4, cell = row + Math.floor((x * W) / width);
          sum[cell] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          count[cell]++;
        }
      }
      const g = Array.from(sum, (v, i) => v / (count[i] || 1));
      hash = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) hash.push(g[y * W + x] < g[y * W + x + 1]);
    }
  } catch (e) { console.warn(`  não deu para comparar ${file}: ${e.message}`); }
  hashCache.set(file, hash);
  return hash;
}

const samePhoto = (a, b) => {
  if (!a || !b) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff <= SAME_PHOTO;
};

/** Tira da lista (já ordenada) as imagens que repetem uma foto anterior. */
async function uniquePhotos(urls, limit = 40) {
  // calcula as impressões em paralelo (de 8 em 8) antes de comparar
  const ahead = urls.slice(0, Math.ceil(limit * 1.5));
  for (let i = 0; i < ahead.length; i += 8) await Promise.all(ahead.slice(i, i + 8).map(dhash));
  const kept = [];
  for (const url of urls) {
    if (kept.length >= limit) break;
    const h = await dhash(url);
    if (!kept.some((k) => samePhoto(k.h, h))) kept.push({ url, h });
  }
  return kept.map((k) => k.url);
}

const DISCOVER = { language: 'pt-BR', sort_by: 'vote_count.desc', 'vote_count.gte': '3000', include_adult: 'false' };

/**
 * Ordena as imagens da mais fácil para a mais difícil de reconhecer.
 * A imagem principal do filme no TMDB (backdrop_path) e as mais votadas são as
 * mais icônicas, então entregam o filme; as menos votadas costumam ser cenas
 * menos conhecidas. Só entram imagens sem texto e com boa resolução.
 */
function rankByEase(backdrops, mainPath) {
  const good = backdrops.filter((b) => b.width >= 1280 && !b.iso_639_1)
    .sort((a, b) => b.vote_count - a.vote_count || b.vote_average - a.vote_average);
  const main = good.find((b) => b.file_path === mainPath);
  return main ? [main, ...good.filter((b) => b !== main)] : good;
}

/**
 * Escolhe 6 imagens indo da mais difícil para a mais fácil: as 5 primeiras
 * saem de faixas cada vez mais conhecidas do ranking e a última é a mais icônica.
 */
function pickFrames(ranked) {
  const rest = ranked.slice(1, 21);
  const frames = [];
  for (let i = 4; i >= 0; i--) {
    frames.push(pick(rest.slice(Math.floor((i * rest.length) / 5), Math.floor(((i + 1) * rest.length) / 5))));
  }
  return [...frames, ranked[0]];
}

/** Imagens do filme, da mais fácil para a mais difícil, sem fotos repetidas. */
const rankedCache = new Map();
async function rankedImages(id, mainPath) {
  if (rankedCache.has(id)) return rankedCache.get(id);
  if (mainPath === undefined) mainPath = (await tmdb(`/movie/${id}`)).backdrop_path;
  const { backdrops = [] } = await tmdb(`/movie/${id}/images`, { include_image_language: 'null' });
  const ranked = await uniquePhotos(rankByEase(backdrops, mainPath).map((b) => IMG + b.file_path));
  rankedCache.set(id, ranked);
  return ranked;
}

/**
 * Lista maior para a página de curadoria: aceita também imagens de resolução um
 * pouco menor (continua sem imagens com texto), sem fotos repetidas.
 */
async function candidateImages(id, frames) {
  const { backdrops = [] } = await tmdb(`/movie/${id}/images`, { include_image_language: 'null' });
  const urls = backdrops.filter((b) => b.width >= 1000 && !b.iso_639_1)
    .sort((a, b) => b.vote_count - a.vote_count || b.vote_average - a.vote_average)
    .map((b) => IMG + b.file_path).filter((u) => !frames.includes(u));
  return [...frames, ...await uniquePhotos(urls, MAX_CANDIDATES)];
}

/** Reordena as imagens de um dia já cadastrado: mais difícil primeiro. */
async function reorderDay(day) {
  const ranked = await rankedImages(day.tmdbId);
  const ease = (url) => { const i = ranked.indexOf(url); return i < 0 ? Infinity : i; };
  day.frames = day.frames.slice().sort((a, b) => ease(b) - ease(a));
  day.ordenado = true;
}

/**
 * Troca imagens marcadas em "trocar" (ex.: repetidas) por outras ainda não
 * usadas, mantendo a posição: posições iniciais recebem imagens menos
 * conhecidas e as finais, mais conhecidas.
 */
async function replaceFrames(day) {
  const pool = (await rankedImages(day.tmdbId)).slice(0, 21);
  for (const url of day.trocar) {
    const pos = day.frames.indexOf(url);
    const others = await Promise.all(day.frames.filter((_, i) => i !== pos).map(dhash));
    const free = [];
    for (const u of pool) {
      if (!day.frames.includes(u) && !others.some((h) => samePhoto(h, hashCache.get(fileOf(u))))) free.push(u);
    }
    if (pos < 0 || !free.length) continue;
    const target = Math.round(((day.frames.length - 1 - pos) / (day.frames.length - 1)) * (pool.length - 1));
    free.sort((a, b) => Math.abs(pool.indexOf(a) - target) - Math.abs(pool.indexOf(b) - target));
    day.frames[pos] = free[0];
  }
  delete day.trocar;
}

async function nextMovie(used) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const page = 1 + Math.floor(Math.random() * 25); // ~500 filmes mais votados
    const { results = [] } = await tmdb('/discover/movie', { ...DISCOVER, page });
    for (const cand of shuffle(results)) {
      if (cand.adult || used.has(cand.id) || !cand.release_date) continue;
      const movie = await tmdb(`/movie/${cand.id}`, { language: 'pt-BR' });
      // só imagens sem texto, sem fotos repetidas e com variedade suficiente
      const ranked = await rankedImages(cand.id, movie.backdrop_path);
      if (ranked.length < MIN_IMAGES) { console.log(`  pulando ${movie.title}: só ${ranked.length} imagens diferentes`); used.add(cand.id); continue; }

      const title = movie.title || cand.title;
      const year = Number(movie.release_date.slice(0, 4));
      const aliases = [...new Set([movie.original_title].filter((t) => t && norm(t) !== norm(title)))];
      return { title, year, tmdbId: movie.id, aliases, frames: pickFrames(ranked), ordenado: true };
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

// dias antigos (vindos do TMDB) que ainda não foram ordenados por dificuldade
// ("curado": escolhido à mão na página de curadoria; o script não mexe mais)
let reordered = 0;
for (const day of data.days) {
  if (day.curado && day.trocar) { delete day.trocar; reordered++; }
  if (day.curado || day.ordenado || !day.tmdbId || !day.frames.every((f) => f.startsWith(IMG))) continue;
  await reorderDay(day);
  reordered++;
  console.log(`  dia ${day.day}: imagens reordenadas por dificuldade`);
}
for (const day of data.days) {
  if (!day.trocar || !day.tmdbId) continue;
  await replaceFrames(day);
  reordered++;
  console.log(`  dia ${day.day}: imagens repetidas trocadas`);
}

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

if (added || reordered) await writeFile(MOVIES, serialize(data));

// imagens candidatas de todos os dias (passados, hoje e futuros), para a página
// de curadoria (curadoria.html). Cada dia é gerado uma vez; a lista de um dia
// inclui sempre as imagens que ele usa agora.
let candidates = {};
try { candidates = JSON.parse(await readFile(CANDIDATES, 'utf8')); } catch { /* arquivo novo */ }
const before = JSON.stringify(candidates);
if (candidates._versao !== CANDIDATES_VERSION) candidates = {};
delete candidates._versao;
const known = new Set(data.days.map((d) => String(d.day)));
for (const key of Object.keys(candidates)) if (!known.has(key)) delete candidates[key];
for (const day of data.days) {
  if (!day.tmdbId) continue;
  const list = candidates[day.day];
  if (list && day.frames.every((f) => list.includes(f))) continue;
  candidates[day.day] = list ? [...new Set([...day.frames, ...list])] : await candidateImages(day.tmdbId, day.frames);
  console.log(`  dia ${day.day}: ${candidates[day.day].length} imagens para a curadoria`);
}
const sorted = Object.entries(candidates).sort((a, b) => Number(a[0]) - Number(b[0]));
candidates = { _versao: CANDIDATES_VERSION, ...Object.fromEntries(sorted) };
if (JSON.stringify(candidates) !== before) {
  const lines = Object.entries(candidates).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  await writeFile(CANDIDATES, `{\n${lines.join(',\n')}\n}\n`);
  console.log(`Imagens candidatas salvas para os dias: ${Object.keys(candidates).join(', ') || 'nenhum'}.`);
}
const total = await refreshTitles(data);
console.log(`${added} filme(s) adicionado(s). Autocompletar com ${total} títulos.`);
