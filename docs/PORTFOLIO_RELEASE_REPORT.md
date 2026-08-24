# Relatório de publicação de portfólio

## Release

- produto: EDY Assist;
- versão: `v0.1.0-beta`;
- branch principal: `main`;
- visibilidade: pública;
- autor: Edmilson Gomes;
- publicação: GitHub, sem GitHub Pages ou deploy pago.

## Conteúdo preparado

- README profissional e documentação de arquitetura, setup, segurança e contribuição;
- workflow de CI para instalação reprodutível, Prisma, tipos, testes e build;
- seed demo isolado com dados fictícios;
- screenshots desktop e mobile sem dados pessoais;
- `.env.example` sem credenciais;
- inventário e varreduras antes do Git e sobre o conteúdo staged.

## Gates da release

A release só deve ser criada após aprovação de `npm ci`, Prisma Client, typecheck, testes, build, seed demo, auditoria de dependências e varredura de segredos. O resultado definitivo e o link da execução ficam registrados na release do GitHub.

## Validação local

- instalação reproduzível com `npm ci`;
- Prisma Client 7.9.1 gerado;
- typecheck aprovado;
- 28 de 28 testes aprovados;
- build de produção aprovado com 3.043 módulos transformados;
- seed demo isolado executado com sucesso;
- `npm audit`: zero vulnerabilidades conhecidas;
- varredura pré-add: 88 candidatos, sem achados;
- varredura staged: 89 arquivos, sem achados de alto risco ou caminhos sensíveis.

## Itens deliberadamente não publicados

Ambiente local, bancos pessoais ou de teste, conversas, destinatários, logs, QR codes, URLs temporárias, binários baixados, caches, bundles e código gerado do Prisma.

## Limitações declaradas

Sem autenticação multiusuário, sincronização offline, Web Push em background, hospedagem permanente, domínio ou integração externa configurada. O repositório demonstra a aplicação e o processo de engenharia; não representa um serviço público em produção.
