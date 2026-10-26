# Ações que dependem da sua conta ou do navegador

Os campos abaixo ficam em **Configurações**. Não é necessário contratar banco ou provedor Telegram.

## Login com Google

Os formulários de login/cadastro e o fluxo Google estão implementados. Para habilitar o botão Google, é necessário criar as credenciais OAuth do seu aplicativo na sua conta Google e configurá-las no servidor, conforme [AUTENTICACAO.md](AUTENTICACAO.md). Esse segredo não deve ser enviado pela conversa nem colocado em arquivos públicos. O acesso por e-mail e senha já funciona sem essa configuração.

## Telegram

Abra [BotFather](https://t.me/BotFather) na sua conta Telegram, use `/newbot`, escolha nome/usuário e copie o token para o aplicativo. A API oficial exige esse cadastro; o projeto não recebeu acesso à sua conta Telegram para realizá-lo. Depois clique em **Vincular minha conta** e abra o link no Telegram.

Validação, vinculação com prazo, recebimento de links e envio estão implementados. Para distribuir em grupos/canais Telegram, adicione o bot ao destino e conceda permissão de envio. Informe o Chat ID ao editar o grupo no OfertaLab. O ID da conta pessoal vinculada não é automaticamente o ID de um grupo.

## Contas afiliadas

Se sua conta tiver acesso à Shopee Open API, informe App ID e segredo no painel. O conector valida antes de salvar. Sem aprovação, use a extensão e importação.

Para Amazon, informe sua tag válida de associado. No Mercado Livre, preserve seus links afiliados oficiais ao importar/editar. Cadastro, aceitação de termos e aprovação dos programas dependem da sua identidade.

## Extensão

Pacotes: `extension-builds/`, também disponíveis para baixar no painel. Instruções completas em [extension/README.md](extension/README.md).

- Chromium: carregar a pasta `chromium/` pela área de extensões.
- Firefox: carregar `firefox/manifest.json` em `about:debugging` para teste. Instalação permanente depende da assinatura pela Mozilla; o ZIP ainda não está assinado/publicado.
- Safari: fontes em `safari/`. Este computador não tem Xcode completo/empacotador Safari. É necessário instalá-lo para compilar e testar. Nenhuma conta paga ou publicação na App Store foi contratada.

## Lacunas que ainda exigem desenvolvimento

WhatsApp em grupos grandes não foi integrado: não foi selecionado um provedor que possa ser garantido gratuito, oficial e compatível com todas as funções da referência. Criação de grupos, atualização de membros e promoção cruzada da descrição precisam desse conector. O Link Inteligente atual usa convites e ocupação manuais.

Também falta trabalho técnico para captura automática de cupons, APIs nativas Amazon/Mercado Livre, IA, marca d’água, cobrança e repasses. Esses itens não são tarefas de configuração suas: são lacunas de implementação no README. Não foi afirmada paridade completa com o produto original.

## Referências consultadas

- [Telegram: criar bot](https://core.telegram.org/bots/tutorial) e [Bot API](https://core.telegram.org/bots/api).
- [Explorador oficial Shopee Brasil](https://open-api.affiliate.shopee.com.br/explorer/v2).
- [Amazon Creators API e pré-requisitos](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction).
- [Firefox: distribuição e assinatura](https://extensionworkshop.com/documentation/publish/).
- [Safari: empacotamento](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari).
