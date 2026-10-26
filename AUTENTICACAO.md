# Autenticação

## Formulários

**Entrar** pede somente e-mail e senha. **Criar conta** pede nome, e-mail, senha e confirmação. Os campos são renderizados separadamente, sem depender de esconder elementos do cadastro com CSS. As senhas novas têm 12 a 128 caracteres. Contas antigas continuam aceitando suas senhas originais de dez caracteres ou mais.

Senhas são derivadas com scrypt, salt aleatório e rotina assíncrona; não são armazenadas em texto. Sessões usam identificadores aleatórios opacos, com apenas o hash salvo no banco, expiração em sete dias e cookie HttpOnly/SameSite=Lax. O cookie recebe Secure quando `OFERTA_ORIGIN` usa HTTPS. A sessão atual é rotacionada no login. As rotas de acesso têm limite de tentativas, e erros de login não distinguem conta inexistente de senha incorreta.

## Google

Escolha: OpenID Connect direto com Google, usando a biblioteca oficial `google-auth-library`. O Replit Auth permite acesso por conta Replit; não é necessário impor essa conta adicional para uma aplicação local independente. Isso é uma escolha de adequação ao projeto, não uma afirmação de que o Replit é inseguro.

O fluxo implementa Authorization Code com PKCE S256, state de uso único vinculado ao navegador, nonce, prazo de dez minutos e verificação criptográfica do ID token com as chaves do Google. Confere audiência, emissor, validade e e-mail verificado. Tokens do Google não ficam no navegador nem são persistidos no banco; a aplicação usa sua própria sessão após confirmar a identidade. O segredo OAuth permanece exclusivamente no servidor.

Criar uma conta com Google e entrar têm intenções explícitas. Um login com Google sem conta cadastrada pede para criar a conta primeiro. Um e-mail Google igual ao de uma conta local não concede acesso automático: a pessoa precisa entrar com a senha e vincular o Google em Configurações. A vinculação exige uma sessão válida e o mesmo e-mail verificado. Contas criadas somente pelo Google não ganham uma senha local artificial.

### Configuração única na sua conta Google

1. No [Google Cloud Console](https://console.cloud.google.com/), selecione ou crie um projeto e configure o Google Auth Platform/tela de consentimento.
2. Crie um cliente OAuth do tipo **Aplicativo da Web**. Para este servidor, cadastre exatamente `http://127.0.0.1:3138/auth/google/callback` como URI de redirecionamento autorizada. Se o aplicativo estiver em modo de teste, inclua as contas de teste na configuração do Google.
3. Copie `.env.example` para `.env` e preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` diretamente nesse arquivo local ou use o gerenciador de segredos do ambiente. O `.env` é ignorado pelo Git. Restrinja sua leitura ao usuário do sistema (`chmod 600 .env`). Não envie o segredo na conversa, não o cole em comandos que fiquem no histórico e não o adicione a `public/`.
4. Inicie com `npm start`, que carrega o `.env`, e acesse a origem configurada em `OFERTA_ORIGIN`. O botão Google aparece somente quando os dois parâmetros estiverem configurados.

O client ID identifica o aplicativo; o client secret precisa permanecer confidencial. Nenhum dos dois foi embutido no JavaScript público. O endpoint público informa apenas se o Google está habilitado. Não foram criadas credenciais fictícias nem usados os dados do aplicativo original.

Para produção, configure `OFERTA_ORIGIN=https://seu-dominio`, registre a nova URI no Google e termine TLS em um proxy confiável. O servidor continua escutando localmente. Não foi feita publicação nesta alteração.

## Limites e verificação

O login por senha funciona localmente; cadastro local não faz verificação de e-mail nem recuperação de senha por mensagem, pois não há provedor de e-mail configurado. A identidade Google, quando habilitada, exige e-mail verificado. MFA e recuperação da conta Google são administradas pelo Google conforme as opções da conta.

Testes usam tokens RS256 assinados com uma chave de teste gerada em memória e a verificação real da biblioteca, substituindo apenas a troca de código e a obtenção das chaves de teste. Cobrem assinatura inválida, audiência/emissor/nonce/validade, state expirado/reutilizado, associação explícita e rotação de sessão. O login com uma conta Google real ainda depende das credenciais OAuth acima. A validação visual automatizada do navegador não estava disponível nesta sessão.

Referências: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [OAuth em aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server), [biblioteca oficial](https://github.com/googleapis/google-cloud-node/tree/main/core/packages/google-auth-library-nodejs), [Replit Auth](https://docs.replit.com/references/auth-and-identity/authentication).
