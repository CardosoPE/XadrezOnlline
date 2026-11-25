/* Tela do xadrez: desenha o tabuleiro e liga os cliques ao motor (xadrez-motor.js).
   Modos: dois jogadores no mesmo computador, contra o computador, ou online (WebSocket). */
(function () {
  'use strict';

  var X = window.Xadrez;
  var NOMES = { P: 'peão', N: 'cavalo', B: 'bispo', R: 'torre', Q: 'rainha', K: 'rei' };
  var COR = { w: 'branco', b: 'preto' };
  // Sempre o desenho "cheio"; a cor vem do CSS. ︎ impede que vire emoji.
  var GLIFO = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  var CHAVE_SALA = 'xadrez-sala';
  var CHAVE_NOME = 'xadrez-nome';

  function $(id) { return document.getElementById(id); }
  var el = {
    tab: $('tabuleiro'), msg: $('mensagem'), modo: $('modo'), nivel: $('nivel'), cor: $('cor'),
    opcoesPc: $('opcoes-pc'), novo: $('novo'), desfazer: $('desfazer'), virar: $('virar'),
    lista: $('lista'), vazio: $('vazio'), promo: $('promocao'),
    // online (podem nao existir em outras versoes da pagina)
    painelOnline: $('painel-online'), nome: $('nome'), corSala: $('cor-sala'), criar: $('criar'),
    codigo: $('codigo'), entrar: $('entrar'), lobby: $('lobby'), sala: $('sala'),
    codigoSala: $('codigo-sala'), placar: $('placar'), convite: $('convite'), link: $('link'),
    copiar: $('copiar'), desistir: $('desistir'), revanche: $('revanche'), sair: $('sair'), aviso: $('aviso')
  };
  var temOnline = !!el.painelOnline;

  var jogo;            // { estados: [...], jogadas: [{move, san}] }
  var selecionada = -1;
  var destinos = [];   // jogadas legais da peca selecionada
  var virado = false;
  var foco = 52;       // casa com tabindex=0 (e2)
  var pensando = false;
  var pendente = null; // jogadas de promocao aguardando escolha
  var casas = [];
  var on = novoOn();

  function novoOn() {
    return {
      ws: null, conectando: false, codigo: null, token: null, cor: 'w',
      nomeEu: null, nomeAdv: null, adversarioOnline: true, iniciado: false,
      fim: null, saiu: false, tentativas: 0, reconectando: false
    };
  }

  function estadoAtual() { return jogo.estados[jogo.estados.length - 1]; }
  function modoOnline() { return temOnline && el.modo.value === 'online'; }
  function jogandoContraPc() { return el.modo.value === 'pc'; }
  function corDoComputador() { return el.cor.value === 'w' ? 'b' : 'w'; }
  function vezDoComputador() { return jogandoContraPc() && estadoAtual().turn === corDoComputador(); }
  function nomeCor(c) { return c === 'w' ? 'brancas' : 'pretas'; }
  function oposta(c) { return c === 'w' ? 'b' : 'w'; }

  function novoJogo() {
    jogo = { estados: [X.novoEstado()], jogadas: [] };
    selecionada = -1; destinos = []; pensando = false; pendente = null;
    el.promo.hidden = true;
    virado = jogandoContraPc() && el.cor.value === 'b';
    foco = virado ? 11 : 52;
    desenhar();
    agendarComputador();
  }

  /* ---------- Desenho ---------- */
  function construirCasas() {
    el.tab.innerHTML = '';
    casas = [];
    for (var pos = 0; pos < 64; pos++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'casa';
      b.setAttribute('role', 'gridcell');
      b.addEventListener('click', aoClicar);
      b.addEventListener('keydown', aoTeclar);
      el.tab.appendChild(b);
      casas.push(b);
    }
  }

  function indiceNaPosicao(pos) { return virado ? 63 - pos : pos; }
  function posNaTela(i) { return virado ? 63 - i : i; }

  function desenhar() {
    var s = estadoAtual();
    var lista = X.legais(s);
    var xeque = X.emXeque(s);
    var rei = xeque ? X.casaDoRei(s.board, s.turn) : -1;
    var ultima = jogo.jogadas.length ? jogo.jogadas[jogo.jogadas.length - 1].move : null;

    for (var pos = 0; pos < 64; pos++) {
      var i = indiceNaPosicao(pos), r = i >> 3, c = i & 7, b = casas[pos];
      var peca = s.board[i];
      var cls = 'casa ' + (((r + c) % 2 === 0) ? 'casa--clara' : 'casa--escura');
      if (ultima && (i === ultima.from || i === ultima.to)) cls += ' casa--ultima';
      if (i === selecionada) cls += ' casa--selecionada';
      if (i === rei) cls += ' casa--xeque';
      var d = destinos.filter(function (m) { return m.to === i; });
      if (d.length) cls += ' casa--destino' + ((peca || d[0].flag === 'ep') ? ' casa--captura' : '');
      b.className = cls;
      b.dataset.indice = i;

      var rotulo = X.nomeCasa(i) + ', ' + (peca ? NOMES[peca.charAt(1)] + ' ' + COR[peca.charAt(0)] : 'vazia');
      if (i === selecionada) rotulo += ', selecionada';
      if (d.length) rotulo += ', jogada possível';
      b.setAttribute('aria-label', rotulo);
      b.tabIndex = (i === foco) ? 0 : -1;

      var html = '';
      if (peca) html += '<span class="peca-xadrez peca-xadrez--' + peca.charAt(0) + '" aria-hidden="true">' + GLIFO[peca.charAt(1)] + '︎</span>';
      if (pos % 8 === 0) html += '<span class="coord coord--linha" aria-hidden="true">' + (8 - r) + '</span>';
      if (pos >= 56) html += '<span class="coord coord--coluna" aria-hidden="true">' + 'abcdefgh'.charAt(c) + '</span>';
      b.innerHTML = html;
    }

    mostrarMensagem(s, lista);
    listarJogadas();
    var online = modoOnline();
    el.novo.hidden = online;
    el.desfazer.hidden = online;
    el.desfazer.disabled = jogo.estados.length < 2 || pensando;
    atualizarPainelOnline();
  }

  function sufixoResultado(vencedor) {
    if (!modoOnline() || !on.iniciado) return '';
    return vencedor === on.cor ? ' Você ganhou!' : ' Você perdeu.';
  }

  /* Mensagem que so existe no modo online (antes ou fora das regras do xadrez). */
  function textoOnline() {
    if (!on.codigo) return 'Crie uma sala ou entre com o código de um colega.';
    if (on.reconectando) return 'Conexão perdida. Tentando reconectar...';
    if (!on.iniciado) return 'Esperando o colega entrar na sala ' + on.codigo + '.';
    var f = on.fim;
    if (f && f.motivo === 'desistencia') return f.vencedor === on.cor ? 'O colega desistiu. Você ganhou!' : 'Você desistiu da partida.';
    if (f && f.motivo === 'saiu') return f.vencedor === on.cor ? 'O colega saiu da sala. Você ganhou!' : 'Você saiu da sala.';
    return null;
  }

  function mostrarMensagem(s, lista) {
    var cls = 'status', t;
    var o = modoOnline() ? textoOnline() : null;
    if (o) {
      el.msg.className = cls + (on.fim ? ' status--fim' : '');
      el.msg.textContent = o;
      return;
    }
    var st = X.situacao(s, lista), ganhou = oposta(s.turn);
    if (st === 'xeque-mate') { t = 'Xeque-mate! As ' + nomeCor(ganhou) + ' ganharam.' + sufixoResultado(ganhou); cls += ' status--fim'; }
    else if (st === 'afogamento') { t = 'Empate: as ' + nomeCor(s.turn) + ' não têm jogada e o rei não está em xeque.'; cls += ' status--fim'; }
    else if (st === 'regra-50') { t = 'Empate: 50 jogadas sem capturar nem mover peão.'; cls += ' status--fim'; }
    else if (st === 'material') { t = 'Empate: não há peças suficientes para dar xeque-mate.'; cls += ' status--fim'; }
    else {
      var vez;
      if (modoOnline()) {
        vez = s.turn === on.cor ? 'Sua vez (' + nomeCor(s.turn) + ').' : 'Vez de ' + on.nomeAdv + ' (' + nomeCor(s.turn) + ').';
        if (!on.adversarioOnline) vez += ' O colega está desconectado.';
      } else if (jogandoContraPc()) {
        vez = vezDoComputador() ? (pensando ? 'O computador está pensando...' : 'Vez do computador.') : 'Sua vez (' + nomeCor(s.turn) + ').';
      } else {
        vez = 'Vez das ' + nomeCor(s.turn) + '.';
      }
      t = st === 'xeque' ? 'Xeque! ' + vez : vez;
      if (st === 'xeque') cls += ' status--xeque';
    }
    el.msg.className = cls;
    el.msg.textContent = t;
  }

  function listarJogadas() {
    el.lista.innerHTML = '';
    for (var n = 0; n < jogo.jogadas.length; n += 2) {
      var li = document.createElement('li');
      var a = document.createElement('span'); a.textContent = jogo.jogadas[n].san; li.appendChild(a);
      if (jogo.jogadas[n + 1]) { var b = document.createElement('span'); b.textContent = jogo.jogadas[n + 1].san; li.appendChild(b); }
      el.lista.appendChild(li);
    }
    el.vazio.hidden = jogo.jogadas.length > 0;
    el.lista.scrollTop = el.lista.scrollHeight;
  }

  /* ---------- Jogar ---------- */
  function fimDeJogo() {
    var st = X.situacao(estadoAtual());
    if (['xeque-mate', 'afogamento', 'regra-50', 'material'].indexOf(st) >= 0) return true;
    return modoOnline() && !!on.fim;
  }

  function bloqueadoOnline() {
    return modoOnline() && (!on.iniciado || on.reconectando || estadoAtual().turn !== on.cor);
  }

  function aplicarLocal(m) {
    var s = estadoAtual();
    var san = X.notacao(s, m);
    jogo.estados.push(X.aplicar(s, m));
    jogo.jogadas.push({ move: m, san: san });
  }

  function acharJogada(from, to, promo) {
    return X.legais(estadoAtual()).filter(function (m) {
      return m.from === from && m.to === to && (m.promo || null) === (promo || null);
    })[0];
  }

  function fazerJogada(m) {
    selecionada = -1; destinos = [];
    if (modoOnline()) { // quem confirma a jogada e o servidor
      enviar({ t: 'jogada', from: m.from, to: m.to, promo: m.promo || null });
      desenhar();
      return;
    }
    aplicarLocal(m);
    desenhar();
    agendarComputador();
  }

  function aoClicar(e) {
    var i = parseInt(e.currentTarget.dataset.indice, 10);
    foco = i;
    if (pensando || pendente || fimDeJogo() || vezDoComputador() || bloqueadoOnline()) { desenhar(); return; }
    var s = estadoAtual();
    var alvo = destinos.filter(function (m) { return m.to === i; });
    if (alvo.length) {
      if (alvo[0].promo) { pendente = alvo; el.promo.hidden = false; el.promo.querySelector('button').focus(); return; }
      fazerJogada(alvo[0]);
      return;
    }
    var p = s.board[i];
    if (p && p.charAt(0) === s.turn && i !== selecionada) {
      selecionada = i;
      destinos = X.legais(s).filter(function (m) { return m.from === i; });
    } else {
      selecionada = -1; destinos = [];
    }
    desenhar();
    casas[posNaTela(foco)].focus();
  }

  function aoTeclar(e) {
    var pos = posNaTela(parseInt(e.currentTarget.dataset.indice, 10)), r = pos >> 3, c = pos & 7;
    if (e.key === 'ArrowUp') r--; else if (e.key === 'ArrowDown') r++;
    else if (e.key === 'ArrowLeft') c--; else if (e.key === 'ArrowRight') c++;
    else return;
    e.preventDefault();
    if (r < 0 || r > 7 || c < 0 || c > 7) return;
    foco = indiceNaPosicao(r * 8 + c);
    desenhar();
    casas[r * 8 + c].focus();
  }

  el.promo.addEventListener('click', function (e) {
    var t = e.target.getAttribute && e.target.getAttribute('data-peca');
    if (!t || !pendente) return;
    var m = pendente.filter(function (x) { return x.promo === t; })[0];
    pendente = null;
    el.promo.hidden = true;
    fazerJogada(m);
  });

  /* ---------- Computador ---------- */
  function agendarComputador() {
    if (!vezDoComputador() || fimDeJogo()) return;
    pensando = true;
    desenhar();
    var antes = jogo.estados.length;
    setTimeout(function () {
      if (!pensando || jogo.estados.length !== antes) return;
      var m = X.melhorJogada(estadoAtual(), el.nivel.value);
      pensando = false;
      if (m) fazerJogada(m); else desenhar();
    }, 450);
  }

  /* ---------- Online ---------- */
  function urlServidor() {
    var base = String(window.XADREZ_SERVIDOR || '').trim();
    if (base) return base;
    if (location.protocol === 'file:') return '';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function aviso(t) { if (el.aviso) el.aviso.textContent = t || ''; }

  function enviar(obj) {
    if (on.ws && on.ws.readyState === 1) on.ws.send(JSON.stringify(obj));
  }

  function salvarSessao() {
    try { sessionStorage.setItem(CHAVE_SALA, JSON.stringify({ codigo: on.codigo, token: on.token })); } catch (e) {}
  }
  function limparSessao() { try { sessionStorage.removeItem(CHAVE_SALA); } catch (e) {} }

  function conectar(aoAbrir) {
    var url = urlServidor();
    if (!url) {
      aviso('O modo online só funciona no site publicado, não ao abrir o arquivo direto no computador.');
      return;
    }
    if (on.ws && on.ws.readyState === 1) { aoAbrir(); return; }
    if (on.conectando) return;
    var ws;
    try { ws = new WebSocket(url); } catch (e) { aviso('Não foi possível conectar ao servidor.'); return; }
    on.ws = ws; on.conectando = true;
    if (!on.codigo) aviso('Conectando... o servidor gratuito pode levar até 1 minuto para acordar.');
    ws.onopen = function () { on.conectando = false; on.tentativas = 0; if (!on.codigo) aviso(''); aoAbrir(); };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      receber(m);
    };
    ws.onclose = function () {
      if (on.ws !== ws) return;
      on.ws = null; on.conectando = false;
      if (on.codigo && on.token) { tentarReconectar(); }
      else { aviso('Não foi possível conectar. Tente de novo.'); desenhar(); }
    };
    ws.onerror = function () {};
  }

  function tentarReconectar() {
    if (on.tentativas >= 20) {
      on.reconectando = false;
      aviso('Não foi possível reconectar. Saia da sala e entre de novo.');
      desenhar();
      return;
    }
    on.tentativas++; on.reconectando = true;
    desenhar();
    setTimeout(function () {
      if (!on.codigo) return;
      conectar(function () { enviar({ t: 'reconectar', codigo: on.codigo, token: on.token }); });
    }, Math.min(1000 * on.tentativas, 5000));
  }

  function receber(m) {
    switch (m.t) {
      case 'sala':
        on.codigo = m.codigo; on.cor = m.cor; on.token = m.token;
        salvarSessao();
        aviso('');
        break;
      case 'estado':
        reconstruir(m);
        break;
      case 'jogada':
        var mv = acharJogada(m.from, m.to, m.promo);
        if (!mv) { if (on.ws) on.ws.close(); return; } // fora de sincronia: reconecta e pega o estado
        aplicarLocal(mv);
        if (m.fim) on.fim = m.fim;
        selecionada = -1; destinos = [];
        desenhar();
        break;
      case 'fim':
        on.fim = m.fim;
        if (m.fim && m.fim.motivo === 'saiu') on.saiu = true;
        desenhar();
        break;
      case 'adversario':
        on.adversarioOnline = !!m.online;
        if (m.saiu) on.saiu = true;
        desenhar();
        break;
      case 'revanche-pedida':
        aviso('O colega quer jogar de novo. Clique em Revanche para aceitar.');
        break;
      case 'sala-perdida':
        limparSessao();
        encerrarConexao();
        on = novoOn();
        aviso(m.msg || 'Essa sala não existe mais.');
        novoJogo();
        break;
      case 'erro':
        aviso(m.msg);
        desenhar();
        break;
      case 'saiu':
        break;
    }
  }

  function reconstruir(m) {
    jogo = { estados: [X.novoEstado()], jogadas: [] };
    m.jogadas.forEach(function (j) {
      var mv = acharJogada(j.from, j.to, j.promo);
      if (mv) aplicarLocal(mv);
    });
    on.cor = m.cor;
    on.nomeEu = m.cor === 'w' ? m.brancas : m.pretas;
    on.nomeAdv = m.cor === 'w' ? m.pretas : m.brancas;
    on.iniciado = !!(m.brancas && m.pretas);
    on.fim = m.fim;
    on.saiu = !!(m.fim && m.fim.motivo === 'saiu') || on.saiu && !!m.fim;
    on.adversarioOnline = m.adversarioOnline;
    on.reconectando = false;
    if (!m.fim) on.saiu = false;
    selecionada = -1; destinos = []; pendente = null;
    el.promo.hidden = true;
    virado = on.cor === 'b';
    foco = virado ? 11 : 52;
    if (m.jogadas.length === 0) aviso('');
    desenhar();
  }

  function encerrarConexao() {
    var ws = on.ws;
    on.ws = null;
    if (ws) { try { ws.close(); } catch (e) {} }
  }

  function sairDaSala() {
    if (on.ws && on.ws.readyState === 1) enviar({ t: 'sair' });
    encerrarConexao();
    limparSessao();
    on = novoOn();
    aviso('');
    novoJogo();
  }

  function atualizarPainelOnline() {
    if (!temOnline) return;
    var online = modoOnline();
    el.painelOnline.hidden = !online;
    el.opcoesPc.hidden = !jogandoContraPc();
    if (!online) return;
    var naSala = !!on.codigo;
    el.lobby.hidden = naSala;
    el.sala.hidden = !naSala;
    if (!naSala) return;
    var fim = fimDeJogo();
    el.codigoSala.textContent = on.codigo;
    el.link.value = location.origin + location.pathname + '?sala=' + on.codigo;
    el.convite.hidden = on.iniciado;
    el.placar.textContent = on.iniciado
      ? 'Você: ' + on.nomeEu + ' (' + nomeCor(on.cor) + ') contra ' + on.nomeAdv + ' (' + nomeCor(oposta(on.cor)) + ')'
      : '';
    el.desistir.hidden = !(on.iniciado && !fim);
    el.revanche.hidden = !(on.iniciado && fim && !on.saiu);
  }

  function nomeDigitado() {
    var n = el.nome.value.trim();
    if (!n) { aviso('Digite o seu nome.'); el.nome.focus(); return null; }
    try { localStorage.setItem(CHAVE_NOME, n); } catch (e) {}
    return n;
  }

  if (temOnline) {
    el.criar.addEventListener('click', function () {
      var nome = nomeDigitado();
      if (!nome) return;
      conectar(function () { enviar({ t: 'criar', nome: nome, cor: el.corSala.value }); });
    });

    el.entrar.addEventListener('click', function () {
      var nome = nomeDigitado();
      if (!nome) return;
      var cod = el.codigo.value.trim().toUpperCase();
      if (cod.length !== 4) { aviso('O código da sala tem 4 letras.'); el.codigo.focus(); return; }
      conectar(function () { enviar({ t: 'entrar', codigo: cod, nome: nome }); });
    });

    el.codigo.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.entrar.click(); });
    el.nome.addEventListener('keydown', function (e) { if (e.key === 'Enter') (el.codigo.value ? el.entrar : el.criar).click(); });

    el.copiar.addEventListener('click', function () {
      var ok = function () { aviso('Link copiado!'); };
      var falhou = function () { el.link.select(); aviso('Selecione o link e copie (Ctrl+C).'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.link.value).then(ok, falhou);
      else falhou();
    });

    el.desistir.addEventListener('click', function () {
      if (window.confirm('Quer mesmo desistir da partida?')) enviar({ t: 'desistir' });
    });
    el.revanche.addEventListener('click', function () { enviar({ t: 'revanche' }); aviso('Pedido enviado. Esperando o colega aceitar.'); });
    el.sair.addEventListener('click', sairDaSala);
  }

  /* ---------- Botoes gerais ---------- */
  el.novo.addEventListener('click', novoJogo);

  el.desfazer.addEventListener('click', function () {
    if (jogo.estados.length < 2) return;
    // contra o computador, desfaz a jogada do computador e a sua
    var tirar = Math.min(jogandoContraPc() ? 2 : 1, jogo.jogadas.length);
    for (var k = 0; k < tirar; k++) { jogo.estados.pop(); jogo.jogadas.pop(); }
    selecionada = -1; destinos = []; pensando = false;
    desenhar();
    agendarComputador();
  });

  el.virar.addEventListener('click', function () { virado = !virado; desenhar(); });

  el.modo.addEventListener('change', function () {
    if (on.codigo || on.ws) sairDaSala(); // trocar de modo sai da sala
    aviso('');
    novoJogo();
  });
  el.nivel.addEventListener('change', novoJogo);
  el.cor.addEventListener('change', novoJogo);

  /* ---------- Inicio ---------- */
  construirCasas();
  (function iniciar() {
    var params = new URLSearchParams(location.search);
    var salaConvite = (params.get('sala') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    var salva = null;
    try { salva = JSON.parse(sessionStorage.getItem(CHAVE_SALA) || 'null'); } catch (e) {}
    if (temOnline) {
      try { el.nome.value = localStorage.getItem(CHAVE_NOME) || ''; } catch (e) {}
    }

    if (temOnline && salaConvite) {
      el.modo.value = 'online';
      el.codigo.value = salaConvite;
      novoJogo();
      aviso('Digite o seu nome e clique em Entrar na sala.');
      (el.nome.value ? el.entrar : el.nome).focus();
    } else if (temOnline && salva && salva.codigo && salva.token) {
      el.modo.value = 'online';
      novoJogo();
      on.codigo = salva.codigo; on.token = salva.token;
      tentarReconectar();
    } else {
      novoJogo();
    }
  })();
})();
