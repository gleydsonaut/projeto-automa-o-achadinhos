# OfertaLab — sistema visual

Direção: painel operacional com estrutura preta, superfícies brancas e laranja queimado para orientar a ação. Editorial e preciso, com espaço para o conteúdo; sem decoração que simule dados.

## Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| Canvas | `#f7f7f8` | Fundo das áreas de trabalho |
| Surface | `#ffffff` | Formulários, painéis e tabelas |
| Ink | `#18181b` | Texto principal e navegação |
| Muted | `#64646f` | Texto secundário legível |
| Border | `#e6e6e9` | Separadores e contornos |
| Accent | `#bf4616` | Botões e seleção principal |
| Accent hover | `#a83810` | Hover e pressed |
| Accent soft | `#fff2eb` | Destaques suaves |
| On accent | `#ffffff` | Texto de ação |
| Sidebar | `#151516` | Estrutura escura |

Laranja/preto/branco são as cores predominantes pedidas. Verde e vermelho aparecem somente em status semânticos, sempre acompanhados por texto ou ícone. Verificar contraste real dos pares usados.

## Tipo, espaço e componentes

Manrope local quando disponível, com fallback Avenir/system-ui. Corpo 14–16 px, texto auxiliar 12–14 px, títulos 28–34 px, números tabulares e headings com tracking discreto. Espaçamento base 4 px, conteúdo com largura máxima 1440 px, raios 6 px em controles e 10–14 px em superfícies. Sombras somente para overlays.

Sidebar com grupos de navegação, item ativo laranja sutil, cabeçalho compacto e foco na tarefa atual. Overview usa saudação, métricas reais, atalhos e atividade. O login apresenta uma composição editorial própria; login e cadastro mantêm seus campos distintos. Tabelas têm cabeçalho neutro e ações legíveis. Configurações são formulários funcionais, não cartões decorativos.

Mobile: menu em drawer com botão de abertura/fechamento, Escape, foco e backdrop; colunas viram uma sequência lógica. Formulários usam pelo menos 16 px em entradas móveis. Tabelas podem rolar dentro da própria área. Diálogos não ultrapassam o viewport.

## Interação

Foco com outline laranja visível; ações com hover e pressed discretos; loading e erros acessíveis. Sem transições globais, animações infinitas ou scroll hijacking. Honrar redução de movimento. Não representar integrações desconectadas como conectadas.

## Referências

Aplicar a skill `design-codex`. Origens preservadas em `Documents/Skill design`: Taste Skill (redesign/minimalismo), Vercel (interface/acessibilidade), Awesome DESIGN.md (tokens/documentação) e Playwright CLI (verificação). Este documento define a identidade do OfertaLab, sem copiar marca, métricas ou assets de outra empresa.
