# Plano de testes — EDY Assist MVP

## Objetivo

Demonstrar que o modo local executa regras reais sobre um SQLite isolado e que a integração Meta está preparada sem exigir credenciais durante os testes.

## Gates automatizados

1. `npm test`: regras de linguagem natural e rotas HTTP.
2. `npm run typecheck`: tipagem do backend e contratos compartilhados.
3. `npm run build`: tipagem e bundle de produção do frontend.
4. Busca de encoding: zero `U+FFFD` e zero mojibake em arquivos-fonte e documentação.
5. Busca de segredos: nenhum token real ou `.env` versionável.

## Matriz mínima de integração

| Fluxo | Entrada | Evidência esperada |
|---|---|---|
| Criar lembrete | `Me lembre da aula de Power BI sábado às 9h.` | resposta de confirmação/sucesso e linha persistida em `Reminder` |
| Publicação | `Marque o post do EDY RECON para terça às 12h.` | categoria coerente, instante no timezone do app |
| Ambiguidade | frase sem data ou horário suficiente | `requiresConfirmation=true` e nenhum lembrete antes da resposta |
| Foco | `Iniciar foco de 60 minutos estudando matemática para o ENEM.` | `FocusSession` ativa e lembrete de 250 ml de água relacionado |
| Estudo | `Registre 20 questões e 15 acertos.` | `StudyLog` associado ao contexto e acurácia de 75% |
| Adiar | `Adie esse lembrete por 15 minutos.` | último lembrete da sessão atualizado em +15 min |
| Agenda | `O que tenho hoje?` | somente itens do dia em `America/Sao_Paulo` |
| Recorrência | compromisso semanal | regra persistida e próxima ocorrência calculável |
| Ciclo de estado | concluir, cancelar, reagendar | transições válidas e timestamps coerentes |
| Revisões | novo registro de estudo | cinco revisões: 1, 3, 7, 15 e 30 dias |
| Silêncio | evento dentro do intervalo | registro preservado e notificação adiada/suprimida conforme regra |
| Relatórios | dados diários e semanais | totais derivados do SQLite, sem fixtures na resposta da API |
| Histórico | conversa local | mensagens de entrada e saída persistidas na ordem correta |
| Webhook GET | challenge e verify token | challenge apenas com token válido |
| Webhook POST | payload de texto representativo | mesmo motor do simulador, sem chamada externa quando Meta está inativa |

## Isolamento dos testes

- use `NODE_ENV=test`;
- aponte `DATABASE_URL` para um SQLite temporário dentro do projeto;
- prepare o banco-modelo com `npm run db:init`; cada execução deve atualizar a cópia temporária antes da suíte;
- limpe apenas o banco temporário conhecido entre suítes;
- nunca reutilize o `dev.db` do usuário;
- não faça chamadas reais à Graph API; use mock de `fetch` e verifique URL, headers e corpo;
- fixe o relógio nos testes de datas e restaure-o ao terminar.

## Verificação visual manual

Testar no navegador sem erros de console:

| Perfil | Viewport mínimo | Critério |
|---|---:|---|
| Celular compacto | 320 × 720 | sem corte lateral; navegação e chat utilizáveis |
| Celular comum | 390 × 844 | campos, botões e gráficos legíveis |
| Tablet | 768 × 1024 | grids sem áreas quebradas |
| Notebook | 1366 × 768 | conteúdo principal visível sem sobreposição |
| Desktop | 1920 × 1080 | largura equilibrada e hierarquia preservada |

Percorrer Dashboard, Agenda, Estudos, Modo Foco, Relatórios, WhatsApp, Histórico e Configurações. Validar foco por teclado, nomes acessíveis, contraste, estados hover/focus, `prefers-reduced-motion` e ausência de overflow horizontal.

## Critérios para declarar o MVP pronto

- todos os comandos do enunciado têm teste automatizado ou evidência de integração;
- modo local inicia com `.env` sem credenciais Meta;
- gravações reaparecem após reiniciar API e painel;
- testes, typecheck e build terminam com código zero;
- desktop e celular são conferidos no navegador;
- documentação usa portas, scripts e endpoints reais;
- itens dependentes da Meta são declarados como pendentes de credenciais, sem simulação de sucesso externo.
