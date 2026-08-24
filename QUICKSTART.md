# Início rápido

## Desenvolvimento local

```powershell
Copy-Item .env.example .env
npm ci
npm run prisma:generate
npm run db:init
npm run db:seed
npm run dev
```

Abra `http://127.0.0.1:5173`. A API responde em `http://127.0.0.1:3333/api/health`.

No Windows, `start-dev.bat` automatiza o preparo e inicia API e painel. O script preserva o banco configurado; ele não apaga dados existentes.

## Demonstração com dados fictícios

```powershell
npm run demo:seed
$env:DATABASE_URL='file:./.demo/edy-assist-demo.db'
npm run build
npm run start:server
```

O seed aceita somente um banco dentro de `.demo/`. Remova a variável da sessão ao terminar se você alternar de volta ao banco local.

## Modo móvel temporário

Execute `start-mobile.bat` para preparar a build, iniciar a aplicação local e gerar um acesso HTTPS temporário para o próprio aparelho. A URL e o QR code ficam apenas em `.mobile-runtime/`, diretório ignorado pelo Git.

O fluxo não é hospedagem: computador, processo e internet precisam permanecer ativos. Encerre-o depois do teste e não compartilhe o endereço. A API não possui autenticação de usuários.

## Verificação antes de contribuir

```powershell
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

Para detalhes, consulte `docs/LOCAL_SETUP.md`.
