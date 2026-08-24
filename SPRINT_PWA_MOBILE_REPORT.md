# Relatório da sprint PWA móvel

Data: 24/08/2026

Produto: EDY Assist

## Resultado

A PWA é instalável por HTTPS, usa API e frontend na mesma origem e mantém um shell offline conservador. O service worker exclui `/api` do cache, aplica rede primeiro para navegação e oferece atualização controlada.

## Fluxo móvel

`start-mobile.bat` valida o ambiente, gera o Prisma Client, aplica migrations, cria a build, inicia a aplicação em loopback e abre um Quick Tunnel temporário. URL, logs e QR code permanecem apenas em `.mobile-runtime/` e não são versionados.

O túnel não é hospedagem permanente. Ele depende do computador e do processo ativos, não oferece autenticação própria e deve ser usado somente para teste pessoal.

## Limites

- sem edição ou sincronização offline de dados;
- sem Web Push com o aplicativo fechado;
- sem teste de microfone físico nesta sprint;
- sem Android físico na validação automatizada;
- sem deploy, domínio, conta paga ou serviço sempre ativo.

## Validação histórica

Na conclusão da sprint, testes automatizados, typecheck, build, migrations, seed, manifest, service worker, rotas da API e viewports móveis foram validados. A publicação de portfólio repete os gates em CI e usa somente uma base demo fictícia para screenshots.
