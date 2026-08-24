# Política de segurança

## Versões cobertas

A versão `v0.1.0-beta` é um beta de portfólio. Correções de segurança são aplicadas no branch `main` conforme disponibilidade.

## Como reportar

Não abra uma issue pública para vulnerabilidades, credenciais expostas ou dados pessoais. Use o recurso **Report a vulnerability** da aba Security do repositório ou contate o mantenedor pelo perfil [EDY075](https://github.com/EDY075).

Inclua impacto, pré-condições, passos mínimos de reprodução e uma sugestão de mitigação. Não inclua tokens, bancos reais, conversas ou números de telefone no relatório.

## Modelo de segurança atual

- o modo local é o padrão e integrações externas ficam desativadas sem configuração;
- `.env`, SQLite, logs, QR codes, binários baixados e caches não são versionados;
- webhooks Meta e Twilio validam assinaturas;
- a API usa validação de entrada, headers de segurança e limites de corpo;
- identificadores externos ajudam a impedir processamento duplicado.

## Limites importantes

O aplicativo não possui autenticação de usuários. O túnel temporário existe somente para teste pessoal e não deve ser tratado como hospedagem. Antes de qualquer deploy estável, adicione autenticação, autorização, rate limiting, gestão de segredos, backup e política de retenção.
