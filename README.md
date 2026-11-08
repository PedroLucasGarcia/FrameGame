# FrameGame

Adivinhe o filme do dia vendo apenas uma imagem. Inspirado no [Framed](https://framed.wtf).

- **Um filme novo por dia**, liberado à meia-noite (horário de Brasília).
- **6 chances**: a cada erro ou pulo, uma nova cena é revelada.
- **Jogos anteriores**: quem chegou depois pode jogar todos os dias que já passaram (ícone de calendário).
- **Progresso salvo no navegador** (`localStorage`): palpites, vitórias, sequência e distribuição de acertos.
- **Compartilhar** o resultado com quadradinhos 🟥🟩, como no Framed.
- Layout responsivo para celular, tablet e desktop.

## Como funciona

| Arquivo | Para que serve |
|---|---|
| `index.html`, `css/style.css`, `js/app.js` | O jogo (site estático, sem build) |
| `data/movies.json` | Lista de filmes por dia (`startDate` = dia 1) |
| `data/titles.json` | Títulos usados no autocompletar |
| `frames/1..7/` | Imagens dos 7 primeiros filmes (as antigas fases) |
| `scripts/add-daily-movie.mjs` | Busca filmes novos no TMDB |
| `.github/workflows/daily-movie.yml` | Roda o script todo dia |

O número do dia é calculado a partir de `startDate` no fuso `America/Sao_Paulo`. O site mostra só os dias que já chegaram, mesmo que o JSON tenha filmes futuros.

### Imagens sem pesar o repositório

Os filmes novos **não têm imagens salvas no projeto**. O script guarda apenas os links do CDN do TMDB (`https://image.tmdb.org/t/p/w1280/...`), então cada dia novo acrescenta só uma linha de texto ao `movies.json`.

## Atualização automática (uma vez só)

1. Crie uma conta grátis em [themoviedb.org](https://www.themoviedb.org/signup) e vá em **Configurações → API**. Copie o **Token de leitura da API** (o token longo, "v4").
2. No GitHub, abra o repositório → **Settings → Secrets and variables → Actions → New repository secret**:
   - Nome: `TMDB_TOKEN`
   - Valor: o token copiado
3. Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**.
4. Na aba **Actions**, abra **Filme do dia** e clique em **Run workflow** para testar.

Depois disso, todo dia às 23h (Brasília) o workflow garante que existam filmes para os próximos 3 dias e faz o commit sozinho.

> Os títulos dos filmes futuros ficam visíveis no `data/movies.json`. Quem abrir o arquivo pode ver as respostas — o mesmo acontece em vários jogos diários.

## Publicar no GitHub Pages

**Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**. Cada commit do workflow publica o site de novo.

## Rodar localmente

O jogo carrega arquivos JSON, então precisa de um servidor (abrir o `index.html` direto não funciona):

```bash
python -m http.server 8000
```

Abra `http://localhost:8000`. Para simular outra data, use `http://localhost:8000/?hoje=2026-11-12` (só funciona em localhost).

Para gerar filmes manualmente:

```bash
TMDB_TOKEN=seu_token node scripts/add-daily-movie.mjs
```

## Créditos

Imagens e dados de filmes: [TMDB](https://www.themoviedb.org/). Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.
