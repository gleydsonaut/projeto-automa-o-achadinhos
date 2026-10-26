# OfertaLab — extensão entre navegadores

O código usa WebExtensions Manifest V3 com `browser.*` e fallback `chrome.*`. Requer APIs `activeTab`, `scripting` e `storage`. Captura somente após o clique e transmite os itens selecionados exclusivamente ao servidor local. Não lê cookies ou histórico e não contém telemetria. A chave local permite importar produtos por 30 dias e pode ser revogada no painel.

Gere os pacotes: `npm run extension:build`. O resultado fica em `extension-builds/`.

| Navegador | Pacote | Instalação local |
| --- | --- | --- |
| Chrome, Brave, Edge, Opera, Vivaldi e outros Chromium modernos | `chromium/` | Abra a área de extensões, habilite modo desenvolvedor e carregue a pasta sem compactação. |
| Firefox desktop 140+ e derivados compatíveis | `firefox/` | `about:debugging` → Este Firefox → Carregar extensão temporária → manifest.json. Para instalação permanente, submeta o ZIP à assinatura gratuita da Mozilla. |
| Safari no macOS | `safari/` | Fontes para conversão pelo empacotador oficial da Apple e compilação no Xcode. Não é um aplicativo Safari já compilado ou assinado. |
| Navegadores móveis/sem WebExtensions | Não há extensão universal instalável | Use o painel e a importação por arquivo JSON. O acesso ao servidor local de outro dispositivo exige configuração de rede e HTTPS. |

Safari: com Xcode completo, execute `xcrun safari-web-extension-packager extension-builds/safari`. Versões antigas do Xcode usam `safari-web-extension-converter`. Testes locais dependem das opções de desenvolvimento do Safari. A publicação em loja ou distribuição assinada tem requisitos próprios da Apple; não foi contratada nem iniciada. Neste computador há apenas Command Line Tools, portanto a compilação Safari depende de instalar o Xcode completo.

Não é possível prometer funcionamento em literalmente qualquer navegador: extensões dependem das APIs e das regras de instalação do fabricante. O código e os manifestos estão preparados para as três famílias acima; a execução real em cada família ainda precisa de validação no navegador correspondente.

## Uso

1. Inicie o OfertaLab. Em Configurações, gere a chave de importação.
2. Abra a extensão, informe `http://127.0.0.1:3138` e a chave.
3. Abra uma página individual ou de resultados da Shopee, Mercado Livre ou Amazon e clique em ler produtos.
4. Confira preços, selecione produtos e importe. Para vincular a uma lista, copie seu ID do formulário de edição da lista.

O extrator prioriza dados estruturados JSON-LD e utiliza seletores de catálogo conhecidos como alternativa. Mudanças no HTML dos marketplaces podem exigir ajustes. Links de afiliado não são inventados: informe seu link, configure a API Shopee ou a tag Amazon. Um link importado comum não garante comissão.

Referências: [WebExtensions Mozilla](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions), [assinatura Firefox](https://extensionworkshop.com/documentation/publish/), [empacotamento Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari).
