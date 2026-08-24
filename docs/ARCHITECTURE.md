# Arquitetura

## Componentes

```text
React/Vite PWA
      │ /api na mesma origem em produção
      ▼
Express API
      ├── agenda e lembretes
      ├── foco e hidratação
      ├── estudos e revisões
      ├── relatórios
      └── assistente/conversa
             ▲
             ├── simulador local
             ├── webhook Meta
             └── webhook Twilio
      │
      ▼
Prisma Client + adapter better-sqlite3
      │
      ▼
SQLite local
```

## Decisões principais

- **motor único:** todos os canais usam os mesmos serviços de domínio;
- **SQLite local:** reduz dependências do MVP e mantém o fluxo reproduzível;
- **migrations SQL incrementais:** `db:init` registra checksum e não modifica migrations aplicadas;
- **PWA na mesma origem:** em produção, Express entrega o bundle e a API;
- **offline conservador:** somente o shell é armazenado; `/api` nunca entra no cache;
- **idempotência:** mensagens externas usam identificador único persistido;
- **timezone explícito:** regras de agenda usam `America/Sao_Paulo` por padrão.

## Fronteiras de confiança

O navegador conversa com a API. Os provedores externos chegam por webhooks assinados. Credenciais são carregadas apenas do ambiente do processo e não são enviadas ao frontend. O SQLite contém dados privados e deve permanecer fora do controle de versão.

## Evolução recomendada

Um deploy multiusuário exigirá autenticação, autorização por recurso, armazenamento gerenciado, filas, observabilidade, rate limiting, backup e migração do modelo local para isolamento por usuário.
