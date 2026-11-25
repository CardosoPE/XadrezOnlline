/* Motor de xadrez (regras completas + computador simples). Sem dependencias.
   Tabuleiro: vetor de 64 casas; indice = linha*8 + coluna; linha 0 = 8a fileira (topo, lado das pretas).
   Pecas: 'wP','bK' etc. (cor + tipo: P,N,B,R,Q,K). */
(function (raiz) {
  'use strict';

  var KN = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  var KG = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  var DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
  var ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
  var VALOR = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

  function nomeCasa(i) { return 'abcdefgh'.charAt(i & 7) + (8 - (i >> 3)); }
  function dentro(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function oposta(cor) { return cor === 'w' ? 'b' : 'w'; }

  function novoEstado() {
    return deFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  }

  function deFEN(fen) {
    var p = fen.trim().split(/\s+/);
    var b = new Array(64).fill(null);
    var linhas = p[0].split('/');
    for (var r = 0; r < 8; r++) {
      var c = 0;
      for (var k = 0; k < linhas[r].length; k++) {
        var ch = linhas[r].charAt(k);
        if (/\d/.test(ch)) { c += parseInt(ch, 10); }
        else { b[r * 8 + c] = (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase(); c++; }
      }
    }
    var dir = p[2] || '-';
    var ep = -1;
    if (p[3] && p[3] !== '-') { ep = (8 - parseInt(p[3].charAt(1), 10)) * 8 + 'abcdefgh'.indexOf(p[3].charAt(0)); }
    return {
      board: b,
      turn: p[1] || 'w',
      castling: { wK: dir.indexOf('K') >= 0, wQ: dir.indexOf('Q') >= 0, bK: dir.indexOf('k') >= 0, bQ: dir.indexOf('q') >= 0 },
      ep: ep,
      half: parseInt(p[4] || '0', 10),
      full: parseInt(p[5] || '1', 10)
    };
  }

  /* A casa sq esta atacada por pecas da cor "por"? */
  function atacada(b, sq, por) {
    var r = sq >> 3, c = sq & 7, i, rr, cc;
    var pr = por === 'w' ? r + 1 : r - 1;
    for (i = -1; i <= 1; i += 2) {
      cc = c + i;
      if (dentro(pr, cc) && b[pr * 8 + cc] === por + 'P') return true;
    }
    for (i = 0; i < 8; i++) {
      rr = r + KN[i][0]; cc = c + KN[i][1];
      if (dentro(rr, cc) && b[rr * 8 + cc] === por + 'N') return true;
    }
    for (i = 0; i < 8; i++) {
      rr = r + KG[i][0]; cc = c + KG[i][1];
      if (dentro(rr, cc) && b[rr * 8 + cc] === por + 'K') return true;
    }
    var d, t, p;
    for (d = 0; d < 4; d++) {
      rr = r + DIAG[d][0]; cc = c + DIAG[d][1];
      while (dentro(rr, cc)) {
        p = b[rr * 8 + cc];
        if (p) { if (p.charAt(0) === por && (p.charAt(1) === 'B' || p.charAt(1) === 'Q')) return true; break; }
        rr += DIAG[d][0]; cc += DIAG[d][1];
      }
      rr = r + ORTH[d][0]; cc = c + ORTH[d][1];
      while (dentro(rr, cc)) {
        p = b[rr * 8 + cc];
        if (p) { if (p.charAt(0) === por && (p.charAt(1) === 'R' || p.charAt(1) === 'Q')) return true; break; }
        rr += ORTH[d][0]; cc += ORTH[d][1];
      }
    }
    return false;
  }

  function casaDoRei(b, cor) {
    for (var i = 0; i < 64; i++) { if (b[i] === cor + 'K') return i; }
    return -1;
  }

  function emXeque(s) {
    var k = casaDoRei(s.board, s.turn);
    return k >= 0 && atacada(s.board, k, oposta(s.turn));
  }

  /* Jogadas que respeitam o movimento das pecas (ainda podem deixar o rei em xeque). */
  function pseudo(s) {
    var b = s.board, eu = s.turn, op = oposta(eu), out = [];
    function add(from, to, flag, promo) {
      var m = { from: from, to: to, piece: b[from], capture: b[to] || null };
      if (flag) m.flag = flag;
      if (promo) m.promo = promo;
      out.push(m);
    }
    function peao(from, to) {
      var ultima = eu === 'w' ? 0 : 7;
      if ((to >> 3) === ultima) { ['Q', 'R', 'B', 'N'].forEach(function (t) { add(from, to, null, t); }); }
      else add(from, to);
    }
    for (var i = 0; i < 64; i++) {
      var p = b[i];
      if (!p || p.charAt(0) !== eu) continue;
      var t = p.charAt(1), r = i >> 3, c = i & 7, k, rr, cc, to, d;
      if (t === 'P') {
        var dir = eu === 'w' ? -1 : 1, inicio = eu === 'w' ? 6 : 1, r1 = r + dir;
        if (r1 >= 0 && r1 < 8) {
          if (!b[r1 * 8 + c]) {
            peao(i, r1 * 8 + c);
            if (r === inicio && !b[(r + 2 * dir) * 8 + c]) add(i, (r + 2 * dir) * 8 + c, 'double');
          }
          for (k = -1; k <= 1; k += 2) {
            cc = c + k;
            if (cc < 0 || cc > 7) continue;
            to = r1 * 8 + cc;
            if (b[to] && b[to].charAt(0) === op) peao(i, to);
            else if (to === s.ep) { out.push({ from: i, to: to, piece: p, capture: op + 'P', flag: 'ep' }); }
          }
        }
      } else if (t === 'N' || t === 'K') {
        var passos = t === 'N' ? KN : KG;
        for (k = 0; k < 8; k++) {
          rr = r + passos[k][0]; cc = c + passos[k][1];
          if (!dentro(rr, cc)) continue;
          to = rr * 8 + cc;
          if (!b[to] || b[to].charAt(0) === op) add(i, to);
        }
        if (t === 'K') {
          var base = eu === 'w' ? 56 : 0;
          if (i === base + 4 && !atacada(b, i, op)) {
            if (s.castling[eu + 'K'] && !b[base + 5] && !b[base + 6] && b[base + 7] === eu + 'R' &&
                !atacada(b, base + 5, op) && !atacada(b, base + 6, op)) add(i, base + 6, 'O-O');
            if (s.castling[eu + 'Q'] && !b[base + 3] && !b[base + 2] && !b[base + 1] && b[base] === eu + 'R' &&
                !atacada(b, base + 3, op) && !atacada(b, base + 2, op)) add(i, base + 2, 'O-O-O');
          }
        }
      } else {
        var dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : DIAG.concat(ORTH);
        for (d = 0; d < dirs.length; d++) {
          rr = r + dirs[d][0]; cc = c + dirs[d][1];
          while (dentro(rr, cc)) {
            to = rr * 8 + cc;
            if (!b[to]) add(i, to);
            else { if (b[to].charAt(0) === op) add(i, to); break; }
            rr += dirs[d][0]; cc += dirs[d][1];
          }
        }
      }
    }
    return out;
  }

  /* Devolve um NOVO estado depois da jogada (nao altera o original). */
  function aplicar(s, m) {
    var b = s.board.slice(), eu = s.turn, peca = b[m.from];
    b[m.from] = null;
    if (m.flag === 'ep') b[m.to + (eu === 'w' ? 8 : -8)] = null;
    b[m.to] = m.promo ? eu + m.promo : peca;
    if (m.flag === 'O-O') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.flag === 'O-O-O') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    var dir = { wK: s.castling.wK, wQ: s.castling.wQ, bK: s.castling.bK, bQ: s.castling.bQ };
    if (peca === 'wK') { dir.wK = false; dir.wQ = false; }
    if (peca === 'bK') { dir.bK = false; dir.bQ = false; }
    [m.from, m.to].forEach(function (q) {
      if (q === 63) dir.wK = false;
      if (q === 56) dir.wQ = false;
      if (q === 7) dir.bK = false;
      if (q === 0) dir.bQ = false;
    });
    return {
      board: b,
      turn: oposta(eu),
      castling: dir,
      ep: m.flag === 'double' ? (m.from + m.to) / 2 : -1,
      half: (peca.charAt(1) === 'P' || m.capture) ? 0 : s.half + 1,
      full: s.full + (eu === 'b' ? 1 : 0)
    };
  }

  function legais(s) {
    var eu = s.turn, op = oposta(eu);
    return pseudo(s).filter(function (m) {
      var ns = aplicar(s, m);
      var k = casaDoRei(ns.board, eu);
      return k < 0 || !atacada(ns.board, k, op);
    });
  }

  function materialInsuficiente(b) {
    var menores = 0;
    for (var i = 0; i < 64; i++) {
      var p = b[i];
      if (!p) continue;
      var t = p.charAt(1);
      if (t === 'K') continue;
      if (t === 'B' || t === 'N') menores++; else return false;
    }
    return menores <= 1;
  }

  /* 'jogando' | 'xeque' | 'xeque-mate' | 'afogamento' | 'regra-50' | 'material' */
  function situacao(s, lista) {
    lista = lista || legais(s);
    var xeque = emXeque(s);
    if (!lista.length) return xeque ? 'xeque-mate' : 'afogamento';
    if (s.half >= 100) return 'regra-50';
    if (materialInsuficiente(s.board)) return 'material';
    return xeque ? 'xeque' : 'jogando';
  }

  /* Notacao algebrica (ex.: e4, Cf3, exd5, O-O, e8=D+). Usa letras internacionais das pecas. */
  function notacao(s, m, lista) {
    var base;
    if (m.flag === 'O-O') base = 'O-O';
    else if (m.flag === 'O-O-O') base = 'O-O-O';
    else {
      var t = m.piece.charAt(1), dest = nomeCasa(m.to), col = 'abcdefgh'.charAt(m.from & 7);
      if (t === 'P') {
        base = (m.capture ? col + 'x' : '') + dest + (m.promo ? '=' + m.promo : '');
      } else {
        base = t;
        var outros = (lista || legais(s)).filter(function (o) { return o.from !== m.from && o.piece === m.piece && o.to === m.to; });
        if (outros.length) {
          var mesmaColuna = outros.some(function (o) { return (o.from & 7) === (m.from & 7); });
          var mesmaLinha = outros.some(function (o) { return (o.from >> 3) === (m.from >> 3); });
          if (!mesmaColuna) base += col;
          else if (!mesmaLinha) base += (8 - (m.from >> 3));
          else base += nomeCasa(m.from);
        }
        base += (m.capture ? 'x' : '') + dest;
      }
    }
    var st = situacao(aplicar(s, m));
    return base + (st === 'xeque-mate' ? '#' : st === 'xeque' ? '+' : '');
  }

  /* ---------------- Computador ---------------- */
  function avaliar(s) { // pontos do ponto de vista das brancas
    var total = 0;
    for (var i = 0; i < 64; i++) {
      var p = s.board[i];
      if (!p) continue;
      var cor = p.charAt(0), t = p.charAt(1), r = i >> 3, c = i & 7;
      var v = VALOR[t];
      var centro = (3.5 - Math.abs(c - 3.5)) + (3.5 - Math.abs(r - 3.5));
      if (t === 'N' || t === 'B') v += centro * 5;
      else if (t === 'P') v += (cor === 'w' ? 6 - r : r - 1) * 6 + centro;
      else if (t === 'Q') v += centro;
      total += cor === 'w' ? v : -v;
    }
    return total;
  }

  function busca(s, prof, alfa, beta) { // negamax com poda alfa-beta
    var lista = legais(s);
    if (!lista.length) return emXeque(s) ? -(100000 + prof) : 0;
    if (prof === 0) return (s.turn === 'w' ? 1 : -1) * avaliar(s);
    lista.sort(function (a, b) { return (b.capture ? 1 : 0) - (a.capture ? 1 : 0); });
    var melhor = -Infinity;
    for (var i = 0; i < lista.length; i++) {
      var v = -busca(aplicar(s, lista[i]), prof - 1, -beta, -alfa);
      if (v > melhor) melhor = v;
      if (v > alfa) alfa = v;
      if (alfa >= beta) break;
    }
    return melhor;
  }

  function sortear(v) { return v[Math.floor(Math.random() * v.length)]; }

  /* nivel: 'facil' | 'medio' | 'dificil' */
  function melhorJogada(s, nivel) {
    var lista = legais(s);
    if (!lista.length) return null;
    if (nivel === 'facil') {
      var caps = lista.filter(function (m) { return m.capture; });
      return (caps.length && Math.random() < 0.5) ? sortear(caps) : sortear(lista);
    }
    var prof = nivel === 'dificil' ? 3 : 2, melhor = -Infinity, empatadas = [];
    lista.forEach(function (m) {
      var v = -busca(aplicar(s, m), prof - 1, -Infinity, Infinity);
      if (v > melhor) { melhor = v; empatadas = [m]; }
      else if (v === melhor) empatadas.push(m);
    });
    return sortear(empatadas);
  }

  function perft(s, prof) {
    if (prof === 0) return 1;
    var n = 0;
    legais(s).forEach(function (m) { n += perft(aplicar(s, m), prof - 1); });
    return n;
  }

  var Xadrez = {
    novoEstado: novoEstado, deFEN: deFEN, legais: legais, aplicar: aplicar, situacao: situacao,
    emXeque: emXeque, notacao: notacao, melhorJogada: melhorJogada, nomeCasa: nomeCasa,
    casaDoRei: casaDoRei, perft: perft
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Xadrez;
  else raiz.Xadrez = Xadrez;
})(typeof window !== 'undefined' ? window : this);
