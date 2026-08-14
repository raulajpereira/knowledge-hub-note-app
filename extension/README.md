# Knowledge Hub Clipper

Extensão do Chrome para guardar a página (ou o texto selecionado) que estás a
ver como uma nota no teu Knowledge Hub. Não está na Chrome Web Store — é
instalada manualmente ("load unpacked"), o que é suficiente para uso próprio
ou de uma equipa.

## Instalar

1. Descarrega/faz `git clone` deste repositório (ou só a pasta `extension/`).
2. Abre `chrome://extensions` no Chrome.
3. Ativa o **Modo de programador** (canto superior direito).
4. Clica em **Carregar sem compactação** ("Load unpacked") e escolhe a pasta
   `extension/`.
5. O ícone do Knowledge Hub aparece na barra de ferramentas. Fixa-o (ícone de
   pin) para ficar sempre visível.

## Usar

1. Numa página qualquer, clica no ícone da extensão.
2. Na primeira vez, indica o endereço do teu Knowledge Hub (ex.:
   `https://a-tua-app.com`) e entra com a tua conta — fica guardado neste
   browser, não precisas de repetir.
3. A extensão lê a página automaticamente:
   - Se tiveres **texto selecionado**, usa só isso.
   - Caso contrário, tenta extrair o **artigo principal** da página (título +
     corpo, sem menus/anúncios).
4. Ajusta título, tags e o conteúdo diretamente no popup.
5. **Criar** guarda a nota. **Cancelar** fecha sem criar nada.

## Notas técnicas

- A extração de artigos usa [Readability.js](https://github.com/mozilla/readability)
  da Mozilla (Apache 2.0), vendida em `vendor/`.
- A sessão (token) e o endereço do servidor ficam em `chrome.storage.local`,
  isolados de tudo o resto — não usa nem interfere com o login do site normal.
- Fala diretamente com a mesma API do site (`POST /api/notes`, etc.) — sem
  backend próprio.
