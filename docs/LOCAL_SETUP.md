# Configuração local

## Requisitos

- Node.js 20.19 ou superior;
- npm compatível com o lockfile;
- Windows, macOS ou Linux para o fluxo web local.

## Instalação

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run db:init
npm run db:seed
npm run dev
```

O frontend fica em `http://127.0.0.1:5173` e a API em `http://127.0.0.1:3333`. Altere portas e origem somente no `.env` local.

## Ambiente

`.env.example` contém valores locais seguros e campos externos vazios. Mantenha credenciais somente no `.env` ignorado ou em um cofre de segredos. O provedor `mock` é suficiente para desenvolver e testar sem rede externa.

## Banco

`npm run db:init` aplica migrations incrementais ao `DATABASE_URL` configurado. `npm run db:seed` cria apenas a configuração inicial. Para portfólio e screenshots, use `npm run demo:seed`, que opera exclusivamente em `.demo/`.

## Verificação

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

O build web fica em `apps/web/dist` e não deve ser versionado.
