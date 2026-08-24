# Como contribuir

## Preparação

1. use Node.js 20.19 ou superior;
2. copie `.env.example` para `.env` e mantenha apenas valores locais;
3. execute `npm ci`, `npm run prisma:generate`, `npm run db:init` e `npm run db:seed`;
4. não use bancos, conversas ou credenciais pessoais em testes e screenshots.

## Antes de enviar uma alteração

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

Prefira commits pequenos e descritivos. Alterações de schema devem incluir migration incremental; não reescreva migrations já aplicadas. Documente mudanças relevantes em `CHANGELOG.md`.

## Segurança e privacidade

Nunca versione `.env`, bancos SQLite, tokens, chaves, destinatários, logs, QR codes ou URLs temporárias. Use placeholders vazios e dados inequivocamente fictícios. Vulnerabilidades devem seguir `SECURITY.md`.

## Licenciamento

Este projeto não possui licença de código aberto. Uma contribuição só deve ser enviada quando o autor concordar com sua incorporação ao repositório sem alterar essa condição.
