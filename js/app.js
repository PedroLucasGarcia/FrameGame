/* FrameGame — um filme por dia, 6 imagens, 6 chances. */
(() => {
  'use strict';

  const MAX_TRIES = 6;
  const STORE_KEY = 'framegame:v1';
  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);

  let data = null;          // conteúdo de data/movies.json
  let titles = [];          // lista para o autocompletar
  let todayNum = 1;         // número do filme de hoje
  let current = null;       // filme em exibição
  let viewFrame = 0;        // índice da imagem mostrada
  let activeSuggestion = -1;

  /* ---------- armazenamento local ---------- */
  const store = (() => {
    let state = { games: {}, seenHelp: false };
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
      // limpa as chaves da versão antiga do jogo
      ['movieName', 'currentImage', 'feedback', 'currentFrame', 'frameFase'].forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* navegador sem localStorage: joga sem salvar */ }
    return {
      state,
      save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} },
      game(day) {
        if (!state.games[day]) state.games[day] = { guesses: [], status: 'playing' };
        return state.games[day];
      },
      peek(day) { return state.games[day]; },
    };
  })();

  /* ---------- datas ---------- */
  function dateInTz(date, timeZone) {
    // "AAAA-MM-DD" no fuso do jogo
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
  const toUTC = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const dayOf = (dateStr) => Math.floor((toUTC(dateStr) - toUTC(data.startDate)) / DAY_MS) + 1;
  const dateOfDay = (n) => new Date(toUTC(data.startDate) + (n - 1) * DAY_MS);
  const fmtDate = (n) => dateOfDay(n).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });

  function msUntilNextDay() {
    const now = new Date();
    const today = dateInTz(now, data.timeZone);
    // procura, minuto a minuto em saltos, o instante em que a data muda no fuso do jogo
    let lo = now.getTime(), hi = lo + DAY_MS + 3600000;
    while (hi - lo > 1000) {
      const mid = (lo + hi) / 2;
      if (dateInTz(new Date(mid), data.timeZone) === today) lo = mid; else hi = mid;
    }
    return hi - now.getTime();
  }

  /* ---------- comparação de respostas ---------- */
  function norm(s) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\(\s*\d{4}\s*\)\s*$/, '')
      .replace(/&/g, ' e ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/^(o|a|os|as|the)\s+/, '');
  }
  const yearOf = (s) => { const m = String(s).match(/\((\d{4})\)\s*$/); return m ? Number(m[1]) : null; };
  const label = (m) => `${m.title} (${m.year})`;

  function isCorrect(guess, movie) {
    const y = yearOf(guess);
    if (y && y !== movie.year) return false; // ex.: "O Rei Leão (2019)" não é "O Rei Leão (1994)"
    const g = norm(guess);
    return [movie.title, ...(movie.aliases || [])].some((t) => norm(t) === g);
  }

  /* ---------- carregamento ---------- */
  async function init() {
    try {
      const [moviesRes, titlesRes] = await Promise.all([
        fetch('data/movies.json', { cache: 'no-cache' }),
        fetch('data/titles.json', { cache: 'no-cache' }),
      ]);
      data = await moviesRes.json();
      titles = titlesRes.ok ? await titlesRes.json() : [];
    } catch (err) {
      $('loading').textContent = 'Não foi possível carregar o jogo. Tente recarregar a página.';
      return;
    }

    const set = new Map(titles.map((t) => [norm(t) + yearOf(t), t]));
    data.days.forEach((m) => set.set(norm(m.title) + m.year, label(m)));
    titles = [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // ?hoje=AAAA-MM-DD só funciona em ambiente local, para testar dias futuros
    const override = new URLSearchParams(location.search).get('hoje');
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
    const today = local && override ? override : dateInTz(new Date(), data.timeZone);
    todayNum = Math.min(dayOf(today), data.days.length ? data.days[data.days.length - 1].day : 1);

    bindUI();
    window.addEventListener('hashchange', route);
    route();
    $('loading').hidden = true;
    $('board').hidden = false;

    if (!store.state.seenHelp) {
      store.state.seenHelp = true;
      store.save();
      openModal('help');
    }
    setInterval(tick, 1000);
  }

  const available = () => data.days.filter((m) => m.day >= 1 && m.day <= todayNum);
  const movieByDay = (n) => data.days.find((m) => m.day === n);

  function route() {
    const m = location.hash.match(/^#\/dia\/(\d+)/);
    let n = m ? Number(m[1]) : todayNum;
    if (!movieByDay(n) || n > todayNum || n < 1) {
      n = todayNum;
      if (m) history.replaceState(null, '', location.pathname + location.search + '#/');
    }
    load(n);
  }
  const goTo = (n) => { location.hash = n === todayNum ? '#/' : `#/dia/${n}`; };

  /* ---------- tela do jogo ---------- */
  function load(n) {
    current = movieByDay(n);
    if (!current) {
      $('loading').hidden = false;
      $('loading').textContent = 'Ainda não há filmes liberados. Volte amanhã!';
      $('board').hidden = true;
      return;
    }
    const g = store.peek(n);
    viewFrame = g && g.status !== 'playing' ? MAX_TRIES - 1 : unlocked(g) - 1;
    if (g && g.status === 'won') viewFrame = g.guesses.length - 1;
    $('guessInput').value = '';
    closeSuggestions();
    render();
    // pré-carrega as imagens já liberadas e a próxima
    current.frames.slice(0, unlocked(g) + 1).forEach((src) => { const i = new Image(); i.src = src; });
  }

  const unlocked = (g) => (!g ? 1 : g.status === 'playing' ? Math.min(g.guesses.length + 1, MAX_TRIES) : MAX_TRIES);

  function render() {
    const n = current.day;
    const g = store.peek(n) || { guesses: [], status: 'playing' };
    const open = unlocked(g);
    const finished = g.status !== 'playing';

    $('dayTitle').textContent = `FrameGame #${n}`;
    $('dayDate').textContent = n === todayNum ? `Hoje · ${fmtDate(n)}` : fmtDate(n);
    $('prevDay').disabled = n <= 1;
    $('nextDay').disabled = n >= todayNum;

    const img = $('frameImg');
    $('frameError').hidden = true;
    img.hidden = false;
    img.src = current.frames[viewFrame];
    img.alt = `Imagem ${viewFrame + 1} de ${MAX_TRIES}`;

    // abas das imagens
    const tabs = $('frameTabs');
    tabs.innerHTML = '';
    for (let i = 0; i < MAX_TRIES; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = i + 1;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === viewFrame));
      b.className = 'tab';
      if (i === viewFrame) b.classList.add('active');
      if (i < g.guesses.length) b.classList.add(g.status === 'won' && i === g.guesses.length - 1 ? 'win' : 'miss');
      b.disabled = i >= open;
      b.addEventListener('click', () => { viewFrame = i; render(); });
      tabs.appendChild(b);
    }

    // palpites
    const list = $('guesses');
    list.innerHTML = '';
    g.guesses.forEach((guess, i) => {
      const li = document.createElement('li');
      const win = g.status === 'won' && i === g.guesses.length - 1;
      li.className = guess === null ? 'skip' : win ? 'win' : 'miss';
      const icon = guess === null ? 'fa-forward' : win ? 'fa-check' : 'fa-xmark';
      li.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
      li.querySelector('span').textContent = guess === null ? 'Pulou' : guess;
      list.appendChild(li);
    });

    $('guessForm').hidden = finished;
    $('result').hidden = !finished;
    if (finished) {
      $('resultTitle').textContent = g.status === 'won'
        ? (g.guesses.length === 1 ? 'Na primeira! 🎬' : `Você acertou em ${g.guesses.length} tentativas!`)
        : 'Não foi dessa vez.';
      $('resultTitle').className = 'result-title ' + g.status;
      $('resultMovie').textContent = label(current);
      tick();
    } else {
      $('skipBtn').textContent = '';
      $('skipBtn').append(open === MAX_TRIES ? 'Desistir ' : 'Pular ');
      $('skipBtn').insertAdjacentHTML('beforeend', '<i class="fa-solid fa-forward"></i>');
    }
  }

  function play(guess) {
    const g = store.game(current.day);
    if (g.status !== 'playing') return;
    if (guess !== null) {
      guess = guess.trim();
      if (!guess) return;
      if (g.guesses.some((x) => x && norm(x) === norm(guess) && yearOf(x) === yearOf(guess))) {
        toast('Você já tentou esse filme.');
        return;
      }
    }
    g.guesses.push(guess);
    if (guess !== null && isCorrect(guess, current)) g.status = 'won';
    else if (g.guesses.length >= MAX_TRIES) g.status = 'lost';
    else if (guess !== null) toast('Errou! Nova imagem liberada.');
    store.save();

    viewFrame = g.status === 'won' ? g.guesses.length - 1 : unlocked(g) - 1;
    if (g.status === 'lost') viewFrame = MAX_TRIES - 1;
    $('guessInput').value = '';
    closeSuggestions();
    render();
    if (g.status !== 'playing') setTimeout(() => openModal('stats'), 900);
  }

  /* ---------- autocompletar ---------- */
  function suggest() {
    const q = norm($('guessInput').value);
    const ul = $('suggestions');
    activeSuggestion = -1;
    if (q.length < 2) return closeSuggestions();
    const starts = [], contains = [];
    for (const t of titles) {
      const n = norm(t);
      if (n.startsWith(q)) starts.push(t);
      else if (n.includes(q)) contains.push(t);
      if (starts.length >= 8) break;
    }
    const items = starts.concat(contains).slice(0, 8);
    if (!items.length) return closeSuggestions();
    ul.innerHTML = '';
    items.forEach((t, i) => {
      const li = document.createElement('li');
      li.id = `sug-${i}`;
      li.setAttribute('role', 'option');
      li.textContent = t;
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(t); });
      ul.appendChild(li);
    });
    ul.hidden = false;
    $('guessInput').setAttribute('aria-expanded', 'true');
  }
  function closeSuggestions() {
    $('suggestions').hidden = true;
    $('suggestions').innerHTML = '';
    $('guessInput').setAttribute('aria-expanded', 'false');
    $('guessInput').removeAttribute('aria-activedescendant');
    activeSuggestion = -1;
  }
  function pick(t) { $('guessInput').value = t; closeSuggestions(); $('guessInput').focus(); }
  function moveSuggestion(dir) {
    const items = [...$('suggestions').children];
    if (!items.length) return;
    activeSuggestion = (activeSuggestion + dir + items.length) % items.length;
    items.forEach((li, i) => li.classList.toggle('active', i === activeSuggestion));
    $('guessInput').setAttribute('aria-activedescendant', items[activeSuggestion].id);
    items[activeSuggestion].scrollIntoView({ block: 'nearest' });
  }

  /* ---------- estatísticas ---------- */
  function stats() {
    const games = Object.entries(store.state.games)
      .map(([d, g]) => ({ day: Number(d), ...g }))
      .filter((g) => g.status !== 'playing');
    const won = games.filter((g) => g.status === 'won');
    const dist = Array(MAX_TRIES).fill(0);
    won.forEach((g) => { dist[g.guesses.length - 1]++; });

    const wonDays = new Set(won.map((g) => g.day));
    let best = 0, run = 0;
    for (let d = 1; d <= todayNum; d++) { run = wonDays.has(d) ? run + 1 : 0; best = Math.max(best, run); }
    let cur = 0;
    let d = wonDays.has(todayNum) || !store.peek(todayNum) || store.peek(todayNum).status === 'playing' ? todayNum : 0;
    if (d && !wonDays.has(d)) d--;
    while (d >= 1 && wonDays.has(d)) { cur++; d--; }

    return { played: games.length, wins: won.length, pct: games.length ? Math.round((won.length / games.length) * 100) : 0, cur, best, dist };
  }

  function renderStats() {
    const s = stats();
    $('statGrid').innerHTML = [
      [s.played, 'Jogos'], [`${s.pct}%`, 'Acertos'], [s.cur, 'Sequência atual'], [s.best, 'Melhor sequência'],
    ].map(([v, l]) => `<div class="stat"><strong>${v}</strong><span>${l}</span></div>`).join('');
    const max = Math.max(1, ...s.dist);
    const g = current && store.peek(current.day);
    const hl = g && g.status === 'won' ? g.guesses.length - 1 : -1;
    $('dist').innerHTML = s.dist.map((v, i) =>
      `<div class="dist-row"><span>${i + 1}</span><div class="bar${i === hl ? ' hl' : ''}" style="width:${Math.max(8, (v / max) * 100)}%">${v}</div></div>`
    ).join('');
  }

  function renderArchive() {
    const grid = $('archiveGrid');
    grid.innerHTML = '';
    available().slice().reverse().forEach((m) => {
      const g = store.peek(m.day);
      const status = !g || (g.status === 'playing' && !g.guesses.length) ? 'new' : g.status;
      const a = document.createElement('a');
      a.href = m.day === todayNum ? '#/' : `#/dia/${m.day}`;
      a.className = `day-card ${status}` + (current && current.day === m.day ? ' current' : '');
      const badge = {
        new: '<i class="fa-solid fa-play"></i> Jogar',
        playing: `<i class="fa-solid fa-hourglass-half"></i> ${g ? g.guesses.length : 0}/${MAX_TRIES}`,
        won: `<i class="fa-solid fa-check"></i> ${g ? g.guesses.length : 0}/${MAX_TRIES}`,
        lost: '<i class="fa-solid fa-xmark"></i> X/6',
      }[status];
      a.innerHTML = `<strong>#${m.day}</strong><span class="date">${m.day === todayNum ? 'Hoje' : fmtDate(m.day)}</span><span class="badge">${badge}</span>`;
      a.addEventListener('click', () => $('archive').close());
      grid.appendChild(a);
    });
  }

  /* ---------- compartilhar ---------- */
  async function share() {
    const g = store.peek(current.day);
    if (!g) return;
    const squares = Array.from({ length: MAX_TRIES }, (_, i) => {
      if (i >= g.guesses.length) return '⬛';
      if (g.status === 'won' && i === g.guesses.length - 1) return '🟩';
      return g.guesses[i] === null ? '⬜' : '🟥';
    }).join(' ');
    const url = location.origin + location.pathname;
    const text = `FrameGame #${current.day}\n🎥 ${squares}\n${url}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Resultado copiado!'); }
    } catch (_) { /* usuário cancelou */ }
  }

  /* ---------- utilidades de interface ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, 2200);
  }

  function openModal(id) {
    if (id === 'stats') renderStats();
    if (id === 'archive') renderArchive();
    const d = $(id);
    if (!d.open) d.showModal();
  }

  function tick() {
    if (!data || $('result').hidden) return;
    const ms = msUntilNextDay();
    const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    $('countdown').textContent = `Próximo filme em ${h}:${m}:${s}`;
    if (ms < 1500) setTimeout(() => location.reload(), 2000);
  }

  function bindUI() {
    // logo: recarrega a página e volta para o jogo de hoje
    document.querySelector(".brand").addEventListener("click", (e) => {
      e.preventDefault();
      location.href = location.pathname + location.search;
    });
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
    document.querySelectorAll('dialog').forEach((d) => {
      d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); // clique fora fecha
    });

    $('prevDay').addEventListener('click', () => goTo(current.day - 1));
    $('nextDay').addEventListener('click', () => goTo(current.day + 1));
    $('frameImg').addEventListener('error', () => { $('frameImg').hidden = true; $('frameError').hidden = false; });

    $('guessForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const items = [...$('suggestions').children];
      if (activeSuggestion >= 0 && items[activeSuggestion]) return pick(items[activeSuggestion].textContent);
      play($('guessInput').value);
    });
    $('skipBtn').addEventListener('click', () => play(null));
    $('shareBtn').addEventListener('click', share);

    const input = $('guessInput');
    input.addEventListener('input', suggest);
    input.addEventListener('blur', () => setTimeout(closeSuggestions, 100));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); }
      else if (e.key === 'Escape') closeSuggestions();
    });

    document.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || e.target === input) return;
      if (e.key === 'ArrowLeft' && current.day > 1) goTo(current.day - 1);
      if (e.key === 'ArrowRight' && current.day < todayNum) goTo(current.day + 1);
    });
  }

  init();
})();
