// Botao "Mostrar/Ocultar" da senha. Sem ele a tela continua funcionando.
(function () {
  var botao = document.getElementById('ver-senha');
  var campo = document.getElementById('senha');
  if (!botao || !campo) return;

  botao.hidden = false;
  botao.addEventListener('click', function () {
    var mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    botao.setAttribute('aria-pressed', String(mostrar));
    campo.focus();
  });
})();
