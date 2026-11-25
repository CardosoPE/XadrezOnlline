'use strict';
const assert = require('assert');
const WebSocket = require('ws');
const { iniciar } = require('../server.js');

const srv = iniciar(0);
const porta = srv.servidor.address().port;
const sq = (n) => (8 - parseInt(n[1], 10)) * 8 + 'abcdefgh'.indexOf(n[0]);

function cliente() {
  const ws = new WebSocket('ws://127.0.0.1:' + porta + '/ws');
  const fila = [], espera = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    const i = espera.findIndex((e) => e.t === m.t);
    if (i >= 0) espera.splice(i, 1)[0].res(m); else fila.push(m);
  });
  ws.pronto = new Promise((r) => ws.on('open', r));
  ws.envia = (o) => ws.send(JSON.stringify(o));
  ws.espera = (t) => new Promise((res, rej) => {
    const i = fila.findIndex((m) => m.t === t);
    if (i >= 0) return res(fila.splice(i, 1)[0]);
    const e = { t, res };
    espera.push(e);
    setTimeout(() => rej(new Error('timeout esperando ' + t)), 3000);
  });
  return ws;
}

(async () => {
  const a = cliente(), b = cliente();
  await a.pronto; await b.pronto;

  // sala inexistente
  b.envia({ t: 'entrar', codigo: 'ZZZZ', nome: 'Bia' });
  assert.match((await b.espera('erro')).msg, /não encontrada/);

  // criar (A = brancas) e entrar (B)
  a.envia({ t: 'criar', nome: '  Ana <b>  ', cor: 'w' });
  const sa = await a.espera('sala');
  assert.strictEqual(sa.cor, 'w'); assert.match(sa.codigo, /^[A-Z]{4}$/);
  const e0 = await a.espera('estado');
  assert.strictEqual(e0.brancas, 'Ana b'); assert.strictEqual(e0.pretas, null);

  b.envia({ t: 'entrar', codigo: sa.codigo.toLowerCase(), nome: 'Bia' });
  const sb = await b.espera('sala');
  assert.strictEqual(sb.cor, 'b');
  const eb = await b.espera('estado');
  assert.strictEqual(eb.brancas, 'Ana b'); assert.strictEqual(eb.pretas, 'Bia');
  await a.espera('estado');

  // terceiro nao entra
  const c = cliente(); await c.pronto;
  c.envia({ t: 'entrar', codigo: sa.codigo, nome: 'Carla' });
  assert.match((await c.espera('erro')).msg, /cheia/);
  c.close();

  // fora da vez / invalida
  b.envia({ t: 'jogada', from: sq('e7'), to: sq('e5') });
  assert.match((await b.espera('erro')).msg, /sua vez/);
  a.envia({ t: 'jogada', from: sq('e2'), to: sq('e5') });
  assert.match((await a.espera('erro')).msg, /inválida/);

  // mate do pastor
  const lance = async (j, de, para) => {
    j.envia({ t: 'jogada', from: sq(de), to: sq(para) });
    const x = await a.espera('jogada'); const y = await b.espera('jogada');
    assert.deepStrictEqual(x, y); return x;
  };
  await lance(a, 'e2', 'e4'); await lance(b, 'e7', 'e5');
  await lance(a, 'f1', 'c4'); await lance(b, 'b8', 'c6');
  await lance(a, 'd1', 'h5'); await lance(b, 'g8', 'f6');
  const mate = await lance(a, 'h5', 'f7');
  assert.strictEqual(mate.san, 'Qxf7#');
  assert.deepStrictEqual(mate.fim, { motivo: 'xeque-mate', vencedor: 'w' });
  b.envia({ t: 'jogada', from: sq('a7'), to: sq('a6') });
  assert.match((await b.espera('erro')).msg, /terminou/);

  // reconexao de B com o token
  b.close();
  assert.strictEqual((await a.espera('adversario')).online, false);
  const b2 = cliente(); await b2.pronto;
  b2.envia({ t: 'reconectar', codigo: sb.codigo, token: sb.token });
  await b2.espera('sala');
  const er = await b2.espera('estado');
  assert.strictEqual(er.jogadas.length, 7); assert.strictEqual(er.cor, 'b');
  assert.strictEqual((await a.espera('adversario')).online, true);
  const b3 = cliente(); await b3.pronto;
  b3.envia({ t: 'reconectar', codigo: sb.codigo, token: 'errado' });
  await b3.espera('sala-perdida');
  b3.close();

  // revanche: cores trocam
  a.envia({ t: 'revanche' });
  await b2.espera('revanche-pedida');
  b2.envia({ t: 'revanche' });
  assert.strictEqual((await a.espera('sala')).cor, 'b');
  assert.strictEqual((await b2.espera('sala')).cor, 'w');
  const n = await b2.espera('estado');
  assert.strictEqual(n.brancas, 'Bia'); assert.strictEqual(n.jogadas.length, 0); assert.strictEqual(n.fim, null);
  await a.espera('estado');

  // promocao exige a peca; desistencia
  b2.envia({ t: 'desistir' });
  const f = await a.espera('fim');
  assert.deepStrictEqual(f.fim, { motivo: 'desistencia', vencedor: 'b' });

  // sair da sala e sala some quando ninguem sobra
  a.envia({ t: 'sair' }); await a.espera('saiu');
  assert.strictEqual((await b2.espera('adversario')).saiu, true);
  b2.envia({ t: 'sair' }); await b2.espera('saiu');
  assert.strictEqual(srv.salas.size, 0);

  // site estatico + protecao de caminho
  const get = (p) => new Promise((res) => require('http').get({ port: porta, path: p }, (r) => { r.resume(); res(r.statusCode); }));
  assert.strictEqual(await get('/'), 200);
  assert.strictEqual(await get('/xadrez.html'), 200);
  assert.strictEqual(await get('/health'), 200);
  assert.ok([403, 404].includes(await get('/../server.js')));
  assert.ok([403, 404].includes(await get('/%2e%2e/server.js')));
  assert.strictEqual(await get('/nada'), 404);

  console.log('TODOS OS TESTES DO SERVIDOR PASSARAM');
  srv.fechar(() => process.exit(0));
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
