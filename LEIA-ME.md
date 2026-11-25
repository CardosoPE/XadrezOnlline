# Jogos Educativos - Xadrez online

Site (HTML/CSS/JS) + servidor Node com WebSocket. O servidor confere todas as jogadas com o mesmo
motor de regras do navegador, então ninguém joga fora da vez nem faz jogada ilegal.

```
server.js          servidor (site + WebSocket em /ws)
public/            o site (login.html, home.html, xadrez.html, css/, js/)
test/              teste automático do servidor (npm test)
render.yaml        configuração pronta para o Render
```

## Rodar no seu computador

Precisa do Node 18 ou mais novo (https://nodejs.org).

```powershell
npm install
npm start
```

Abra http://localhost:3000 em **duas abas** (uma delas anônima). Em xadrez, escolha
"Online (outro computador)", crie uma sala numa aba e entre com o código na outra.

## Publicar no Render (grátis)

1. Suba esta pasta para o GitHub (veja os comandos abaixo).
2. No Render: **New → Web Service**, escolha o repositório.
3. Runtime **Node**, Build Command `npm install`, Start Command `npm start`, plano **Free**.
   (Se usar o `render.yaml`, em **New → Blueprint** isso já vem preenchido.)
4. Quando terminar, o endereço `https://SEU-APP.onrender.com` abre o site. Mande o link da sala para o colega.

Vercel e Neon **não são necessários**: o Vercel não mantém conexões WebSocket, e as salas ficam na memória do servidor.

Avisos do plano grátis do Render:
- Depois de ~15 min sem uso o servidor dorme; o primeiro acesso demora até 1 minuto para acordar.
- Se o servidor reiniciar, as partidas em andamento acabam (as salas ficam só na memória).

## Se o site ficar em outro lugar (ex.: Vercel)

Edite `public/js/config.js` e coloque o endereço do servidor:
`window.XADREZ_SERVIDOR = 'wss://SEU-APP.onrender.com/ws';`

## Como funciona o online

- Quem cria a sala recebe um código de 4 letras e um link (`xadrez.html?sala=ABCD`).
- O colega abre o link, digita o nome e entra. Só entram 2 jogadores por sala.
- Se a conexão cair ou a página for recarregada, o jogador volta sozinho para a partida.
- Há desistir, sair da sala e revanche (as cores trocam).
