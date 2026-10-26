# OfertaLab

Aplicação local de curadoria e distribuição de ofertas, com identidade própria, baseada no [levantamento funcional](../investigacao/achadinho-pro.md). Não requer serviço de banco contratado. A autenticação Google usa a biblioteca oficial `google-auth-library`.

## Executar

Requer Node.js 24.15+:

```bash
cd oferta-clone
npm ci
PORT=3138 npm start
```

Abra `http://127.0.0.1:3138`. O padrão sem `PORT` é 3000. `OFERTA_DATA_DIR` permite definir outro diretório para os dados. A aplicação escuta apenas na interface local. Para a agenda, o computador e o servidor precisam estar ligados; não foi contratado servidor na nuvem.

Verifique com `npm test`. Gere os pacotes da extensão com `npm run extension:build`. Os testes usam banco e servidor isolados e não enviam mensagens a pessoas. No ambiente restrito, o teste HTTP precisa de permissão para abrir uma porta local.

## Funcionalidades implementadas

- Formulários distintos de login e cadastro, scrypt assíncrono, confirmação de senha, sessões HttpOnly e dados separados por usuário. Fluxo Google OIDC com PKCE e verificação de identidade, ativado com credenciais OAuth próprias; veja [AUTENTICACAO.md](AUTENTICACAO.md).
- SQLite em WAL, migração de tabelas, fila persistente e backups consistentes na inicialização e a cada 24 horas; retenção dos sete mais recentes.
- Agenda por dia, faixa de horário, datas e intervalos, no fuso de Brasília. A criação deixa automações pausadas. A tela **Operação** permite ativar, executar um ciclo, pausar, cancelar a fila e consultar histórico.
- Execução em simulação ou envio pelo Telegram após configuração. Delays, deduplicação de links por grupo e janela em horas. Erros transitórios explícitos recebem novas tentativas com espera; entregas de resultado incerto ficam para conferência, sem reenvio automático.
- Telegram Bot API oficial: validação do token, vinculação temporária de conta, recepção de links Shopee e hashtags. Consultas periódicas dispensam domínio/webhook público. A transmissão paga permanece desativada.
- Grupos de vídeos com até dez hashtags, associação a vários grupos, espera de 60 minutos e seleção por ciclos.
- Importação de produtos em lote por JSON e extensão WebExtensions. Chaves de importação expiram em 30 dias, são armazenadas como hash no servidor e podem ser revogadas.
- Pacotes de extensão Chromium e Firefox e fontes para Safari. Captura dados estruturados e seletores conhecidos após clique. Mudanças no HTML dos marketplaces podem exigir manutenção. Veja [instalação e limites](extension/README.md).
- Conector Shopee Open API: valida credenciais, busca/importa até 50 produtos por consulta, preserva links afiliados, gera links curtos e consulta conversões paginadas. Atualiza buscas ativas diariamente em lotes de dez termos por passagem. Requer conta com acesso Open API aprovado.
- Tag Amazon configurável para links diretos dos produtos importados. A validade e as comissões dependem da sua conta de associado.
- Listas com produtos dos três marketplaces. Vínculos expiram em 48 horas; salvar renova os selecionados. Produtos importados deixam de participar dos fluxos em 30 dias ou na validade menor fornecida pela API.
- Cupons locais por marketplace, categoria, produtos específicos, compra mínima, desconto máximo e validade, com seleção do melhor desconto. A validade inclui o dia inteiro no fuso de Brasília; o cálculo não confirma aceitação no checkout.
- Link Inteligente `/g/identificador`: primeiro convite abaixo de 90% da capacidade informada e contagem de cliques. Membros/capacidade são manuais.
- Cópia de ofertas, métricas reais de cliques e entregas locais, histórico e exportação JSON da conta.

## Conexões e limites

Veja [PENDENCIAS-DO-USUARIO.md](PENDENCIAS-DO-USUARIO.md). Tokens Telegram e segredos Shopee entram no painel Configurações e ficam cifrados com AES-256-GCM. Não são retornados pela API e não devem ser enviados na conversa ou inseridos no código.

Envio/criação/administração de grupos WhatsApp, sincronização automática de cupons, API nativa Amazon, geração nativa de links Mercado Livre, vendas Mercado Livre/Amazon, outras redes, IA, marca d’água, cobrança, indicação com pagamentos e suporte por tickets continuam sem implementação completa. Esses itens podem exigir trabalho técnico adicional; apenas preencher credenciais não os habilita. Nenhum serviço pago foi contratado.

Conectores foram testados com respostas controladas; a validação nas contas reais depende de credenciais autorizadas. Pacotes da extensão foram gerados, mas não foi alegado teste real nos três motores. A interface recebeu revisão visual e testes automatizados em Brave/Chromium, em desktop e celular, com dados isolados. Veja [a revisão de design](../design/review/README.md) e [o sistema visual](DESIGN.md).

## Backup e recuperação

Dados: `data/oferta.sqlite`. Não copie apenas esse arquivo enquanto o servidor estiver em uso; use os snapshots consistentes em `data/backups/`. Guarde também `data/encryption.key`, necessária para decifrar integrações, em local privado junto ao backup. Esses arquivos ficam fora do Git. Backups no mesmo computador não protegem contra perda do dispositivo.

Para recuperar: pare o servidor, preserve a pasta atual, restaure um snapshot como `oferta.sqlite` em uma nova pasta, copie a chave correspondente e inicie com `OFERTA_DATA_DIR` apontando para ela. Não reutilize WAL/SHM da instalação anterior. Entregas interrompidas ficam `uncertain` e não são reenviadas automaticamente. A exportação JSON não contém sessões/segredos e não substitui o backup completo.

## Estrutura

- `server.js`: API HTTP, autenticação, dados por conta e prévias.
- `storage.js`, `operations.js`, `schedule.js`: migração, criptografia, backup, fila e agenda.
- `integrations.js`, `shopee.js`: clientes oficiais Telegram/Shopee e importação.
- `keyword-rules.js`, `preview-rules.js`, `video-rules.js` e `test/`: regras verificadas.
- `extension/`, `scripts/build-extension.js`: WebExtensions e empacotamento.
- `public/`: interface responsiva em HTML/CSS/JavaScript.
- `data/`: SQLite local, ignorado pelo Git.
