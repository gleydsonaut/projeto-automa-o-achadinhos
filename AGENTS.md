# Orientações para o Codex

Para alterações de interface, aplique a skill `design-codex` e leia `DESIGN.md`. A cópia do projeto está em `../design/skills/design-codex/SKILL.md`; a instalação global está em `~/.codex/skills/design-codex`.

Preserve a preferência do usuário por laranja escuro, preto e branco e os fluxos de autenticação já implementados. Evite novas dependências para alterações puramente visuais. Não acrescente métricas fictícias nem represente conectores sem credenciais como operacionais.

Use `npm test` para regressões pertinentes. Para testes de interface, use banco temporário com `OFERTA_DATA_DIR`, sessão de navegador isolada e capturas em `../design/review/`. Nunca grave credenciais ou estado de autenticação real nos artefatos.
