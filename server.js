'use strict';
/*
 * Servidor do xadrez online.
 *  - Serve o site (pasta public/) por HTTP.
 *  - Recebe as partidas por WebSocket em /ws. Cada jogada e conferida aqui com o
 *    mesmo motor de regras do navegador (public/js/xadrez-motor.js).
 *  - Salas ficam so na memoria: se o servidor reiniciar, as partidas em andamento acabam.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const X = require('./public/js/xadrez-motor.js');

const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O, para nao confundir com 1 e 0
const MAX_SALAS = 5000;
const FINS_DO_MOTOR = ['xeque-mate', 'afogamento', 'regra-50', 'material'];

function oposta(c) { return c === 'w' ? 'b' : 'w'; }

function iniciar(porta) {
  var salas = new Map();

  /* ---------- HTTP (site estatico) ---------- */
  var servidor = http.createServer(function (req, res) {
    var cab = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (req.url === '/health') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'text/plain' }, cab));
      return res.end('ok');
    }
    var p;
    try { p = decodeURIComponent(req.url.split('?')[0]); }
    catch (e) { res.writeHead(400, cab); return res.end(); }
    if (p === '/') p = '/login.html';
    var arquivo = path.normalize(path.join(PUBLIC, p));
    if (arquivo.indexOf(PUBLIC + path.sep) !== 0) { res.writeHead(403, cab); return res.end(); }
    fs.readFile(arquivo, function (err, dados) {
      if (err) {
        res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cab));
        return res.end('Página não encontrada.');
      }
      res.writeHead(200, Object.assign({
        'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      }, cab));
      res.end(dados);
    });
  });

  /* ---------- Salas ---------- */
  function novoCodigo() {
    for (;;) {
      var c = '';
      for (var i = 0; i < 4; i++) c += LETRAS.charAt(crypto.randomInt(LETRAS.length));
      if (!salas.has(c)) return c;
    }
  }

  function limparNome(n) {
    n = String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
    return n || 'Jogador';
  }

  function enviar(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
  function erro(ws, msg) { enviar(ws, { t: 'erro', msg: msg }); }

  function transmitir(sala, obj) {
    ['w', 'b'].forEach(function (c) { if (sala.jogadores[c]) enviar(sala.jogadores[c].ws, obj); });
  }

  function iniciada(sala) { return !!(sala.nomes.w && sala.nomes.b); }

  function estadoPara(sala, cor) {
    var outro = sala.jogadores[oposta(cor)];
    return {
      t: 'estado',
      codigo: sala.codigo,
      cor: cor,
      brancas: sala.nomes.w,
      pretas: sala.nomes.b,
      jogadas: sala.jogadas.map(function (j) { return { from: j.from, to: j.to, promo: j.promo }; }),
      fim: sala.fim,
      adversarioOnline: !!(outro && outro.ws)
    };
  }

  function enviarEstadoA(sala, cor) {
    var j = sala.jogadores[cor];
    if (j) enviar(j.ws, estadoPara(sala, cor));
  }

  function criar(ws, msg) {
    if (ws.sala) return erro(ws, 'Você já está em uma sala.');
    if (salas.size >= MAX_SALAS) return erro(ws, 'O servidor está cheio. Tente de novo em alguns minutos.');
    var cor = (msg.cor === 'w' || msg.cor === 'b') ? msg.cor : (crypto.randomInt(2) ? 'w' : 'b');
    var sala = {
      codigo: novoCodigo(),
      jogadores: { w: null, b: null },
      nomes: { w: null, b: null },
      estado: X.novoEstado(),
      jogadas: [],
      fim: null,
      revanche: { w: false, b: false },
      uso: Date.now(),
      criada: Date.now()
    };
    var token = crypto.randomBytes(12).toString('hex');
    sala.jogadores[cor] = { token: token, ws: ws };
    sala.nomes[cor] = limparNome(msg.nome);
    salas.set(sala.codigo, sala);
    ws.sala = sala; ws.cor = cor;
    enviar(ws, { t: 'sala', codigo: sala.codigo, cor: cor, token: token });
    enviarEstadoA(sala, cor);
  }

  function entrar(ws, msg) {
    if (ws.sala) return erro(ws, 'Você já está em uma sala.');
    var sala = salas.get(String(msg.codigo || '').toUpperCase().trim());
    if (!sala) return erro(ws, 'Sala não encontrada. Confira o código.');
    var cor = !sala.jogadores.w ? 'w' : !sala.jogadores.b ? 'b' : null;
    if (!cor || sala.fim) return erro(ws, 'Esta sala já está cheia ou foi encerrada.');
    var token = crypto.randomBytes(12).toString('hex');
    sala.jogadores[cor] = { token: token, ws: ws };
    sala.nomes[cor] = limparNome(msg.nome);
    sala.uso = Date.now();
    ws.sala = sala; ws.cor = cor;
    enviar(ws, { t: 'sala', codigo: sala.codigo, cor: cor, token: token });
    enviarEstadoA(sala, 'w');
    enviarEstadoA(sala, 'b');
  }

  function reconectar(ws, msg) {
    var sala = salas.get(String(msg.codigo || '').toUpperCase().trim());
    if (!sala) return enviar(ws, { t: 'sala-perdida', msg: 'Essa sala não existe mais.' });
    var cor = ['w', 'b'].filter(function (c) { return sala.jogadores[c] && sala.jogadores[c].token === msg.token; })[0];
    if (!cor) return enviar(ws, { t: 'sala-perdida', msg: 'Não foi possível voltar para essa sala.' });
    var j = sala.jogadores[cor];
    if (j.ws && j.ws !== ws) { j.ws.sala = null; j.ws.close(); }
    j.ws = ws; ws.sala = sala; ws.cor = cor;
    sala.uso = Date.now();
    enviar(ws, { t: 'sala', codigo: sala.codigo, cor: cor, token: j.token });
    enviarEstadoA(sala, cor);
    var outro = sala.jogadores[oposta(cor)];
    if (outro) enviar(outro.ws, { t: 'adversario', online: true });
  }

  function jogada(ws, msg) {
    var sala = ws.sala;
    if (!sala) return erro(ws, 'Você não está em uma sala.');
    if (sala.fim) return erro(ws, 'A partida já terminou.');
    if (!iniciada(sala)) return erro(ws, 'Espere o colega entrar na sala.');
    var s = sala.estado;
    if (s.turn !== ws.cor) return erro(ws, 'Não é a sua vez.');
    if (!Number.isInteger(msg.from) || !Number.isInteger(msg.to)) return erro(ws, 'Jogada inválida.');
    var promo = msg.promo ? String(msg.promo) : null;
    var lista = X.legais(s);
    var m = lista.filter(function (x) { return x.from === msg.from && x.to === msg.to && (x.promo || null) === promo; })[0];
    if (!m) return erro(ws, 'Jogada inválida.');
    var san = X.notacao(s, m, lista);
    sala.estado = X.aplicar(s, m);
    sala.jogadas.push({ from: m.from, to: m.to, promo: promo, san: san });
    sala.uso = Date.now();
    var st = X.situacao(sala.estado);
    if (FINS_DO_MOTOR.indexOf(st) >= 0) sala.fim = { motivo: st, vencedor: st === 'xeque-mate' ? ws.cor : null };
    transmitir(sala, { t: 'jogada', from: m.from, to: m.to, promo: promo, san: san, fim: sala.fim });
  }

  function desistir(ws) {
    var sala = ws.sala;
    if (!sala || sala.fim || !iniciada(sala)) return;
    sala.fim = { motivo: 'desistencia', vencedor: oposta(ws.cor) };
    sala.uso = Date.now();
    transmitir(sala, { t: 'fim', fim: sala.fim });
  }

  function revanche(ws) {
    var sala = ws.sala;
    if (!sala || !sala.fim || !sala.jogadores.w || !sala.jogadores.b) return;
    sala.revanche[ws.cor] = true;
    if (!(sala.revanche.w && sala.revanche.b)) {
      return enviar(sala.jogadores[oposta(ws.cor)].ws, { t: 'revanche-pedida' });
    }
    // troca as cores e recomeca
    var j = sala.jogadores, n = sala.nomes;
    sala.jogadores = { w: j.b, b: j.w };
    sala.nomes = { w: n.b, b: n.w };
    ['w', 'b'].forEach(function (c) { if (sala.jogadores[c].ws) sala.jogadores[c].ws.cor = c; });
    sala.estado = X.novoEstado();
    sala.jogadas = [];
    sala.fim = null;
    sala.revanche = { w: false, b: false };
    sala.uso = Date.now();
    ['w', 'b'].forEach(function (c) {
      var jc = sala.jogadores[c];
      enviar(jc.ws, { t: 'sala', codigo: sala.codigo, cor: c, token: jc.token });
      enviarEstadoA(sala, c);
    });
  }

  function sair(ws) {
    var sala = ws.sala, cor = ws.cor;
    if (!sala) return;
    var outro = sala.jogadores[oposta(cor)];
    sala.jogadores[cor] = null;
    ws.sala = null; ws.cor = null;
    if (iniciada(sala) && !sala.fim) {
      sala.fim = { motivo: 'saiu', vencedor: oposta(cor) };
      transmitir(sala, { t: 'fim', fim: sala.fim });
    }
    if (outro) enviar(outro.ws, { t: 'adversario', online: false, saiu: true });
    if (!sala.jogadores.w && !sala.jogadores.b) salas.delete(sala.codigo);
    enviar(ws, { t: 'saiu' });
  }

  /* ---------- WebSocket ---------- */
  var wss = new WebSocketServer({ server: servidor, path: '/ws', maxPayload: 2048 });

  wss.on('connection', function (ws) {
    ws.isAlive = true;
    ws.cota = 0;
    ws.sala = null;
    ws.cor = null;
    ws.on('pong', function () { ws.isAlive = true; });
    ws.on('error', function () {});
    ws.on('message', function (dados, binario) {
      if (binario) return;
      if (++ws.cota > 40) { ws.close(1008, 'Muitas mensagens'); return; }
      var msg;
      try { msg = JSON.parse(dados.toString()); } catch (e) { return; }
      if (!msg || typeof msg !== 'object') return;
      try {
        switch (msg.t) {
          case 'criar': criar(ws, msg); break;
          case 'entrar': entrar(ws, msg); break;
          case 'reconectar': reconectar(ws, msg); break;
          case 'jogada': jogada(ws, msg); break;
          case 'desistir': desistir(ws); break;
          case 'revanche': revanche(ws); break;
          case 'sair': sair(ws); break;
        }
      } catch (e) {
        console.error('Erro ao tratar mensagem:', e);
        erro(ws, 'Algo deu errado. Tente de novo.');
      }
    });
    ws.on('close', function () {
      var sala = ws.sala;
      if (!sala) return;
      var j = sala.jogadores[ws.cor];
      if (j && j.ws === ws) {
        j.ws = null;
        var outro = sala.jogadores[oposta(ws.cor)];
        if (outro) enviar(outro.ws, { t: 'adversario', online: false });
      }
      sala.uso = Date.now();
    });
  });

  var temporizadores = [
    setInterval(function () { wss.clients.forEach(function (ws) { ws.cota = 0; }); }, 10000),
    setInterval(function () {
      wss.clients.forEach(function (ws) {
        if (!ws.isAlive) { ws.terminate(); return; }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000),
    setInterval(function () { // limpa salas abandonadas
      var agora = Date.now();
      salas.forEach(function (sala, codigo) {
        var ninguem = ['w', 'b'].every(function (c) { return !sala.jogadores[c] || !sala.jogadores[c].ws; });
        if ((ninguem && agora - sala.uso > 30 * 60 * 1000) || agora - sala.criada > 6 * 3600 * 1000) salas.delete(codigo);
      });
    }, 5 * 60 * 1000)
  ];
  temporizadores.forEach(function (t) { t.unref(); });

  servidor.listen(porta);
  return {
    servidor: servidor,
    salas: salas,
    fechar: function (cb) {
      temporizadores.forEach(clearInterval);
      wss.clients.forEach(function (ws) { ws.terminate(); });
      wss.close(function () { servidor.close(cb); });
    }
  };
}

module.exports = { iniciar: iniciar };

if (require.main === module) {
  var porta = process.env.PORT || 3000;
  iniciar(porta);
  console.log('Xadrez online rodando em http://localhost:' + porta);
}
