# FrameGame

FrameGame é um jogo diário de adivinhar filmes. A cada dia surge um filme novo, e o desafio é descobrir qual é vendo apenas cenas dele.

## Como jogar

- Você tem **6 chances** para acertar o filme.
- A cada erro ou pulo, uma nova cena é revelada, com mais pistas.
- O campo de palpite sugere títulos enquanto você digita.
- Ao terminar, dá para **compartilhar o resultado** com quadradinhos 🟥🟩 sem revelar a resposta.

## Recursos

- **Um filme novo por dia**, liberado à meia-noite (horário de Brasília).
- **Jogos anteriores**: quem chegou depois pode jogar todos os dias que já passaram.
- **Estatísticas**: vitórias, sequência atual, melhor sequência e distribuição de acertos.
- **Progresso salvo no navegador**, sem cadastro ou login.
- **Layout responsivo** para celular, tablet e computador.

## Como o projeto funciona

- O site é estático: HTML, CSS e JavaScript puro, sem framework e sem etapa de build.
- Os filmes de cada dia ficam em uma lista em JSON, numerada a partir da data de estreia do jogo.
- Um workflow do GitHub Actions roda todos os dias e adiciona filmes novos automaticamente usando a API do TMDB.
- As cenas são carregadas direto do CDN do TMDB, então o repositório não cresce com imagens novas.
- Publicado na Vercel, que atualiza o site a cada commit.

## Tecnologias

- HTML, CSS e JavaScript
- Node.js (script de atualização diária)
- GitHub Actions
- API do TMDB
- Vercel

## Créditos

Imagens e dados de filmes: [TMDB](https://www.themoviedb.org/). Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.

Inspirado no [Framed](https://framed.wtf).
