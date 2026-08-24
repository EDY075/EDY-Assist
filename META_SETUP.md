# Configuração da Meta WhatsApp Cloud API

Esta integração é opcional. O EDY Assist funciona no modo local sem credenciais e não realiza chamadas à Meta quando `WHATSAPP_PROVIDER=mock`.

## Pré-requisitos

- aplicativo e conta empresarial configurados no portal oficial da Meta;
- número e identificador fornecidos pela própria conta;
- endpoint HTTPS acessível durante o teste;
- entendimento das regras vigentes de template, janela de atendimento e cobrança.

## Ambiente local

No `.env` ignorado, selecione `WHATSAPP_PROVIDER=meta` e preencha os campos `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_APP_SECRET` e `META_GRAPH_VERSION`.

Não copie valores reais para `.env.example`, documentação, logs, issues ou screenshots.

## Webhook

Configure no painel da Meta a rota `/api/whatsapp/webhook` sobre sua origem HTTPS atual. O método GET valida o challenge com o verify token; o POST exige a assinatura HMAC SHA-256 calculada com o app secret.

Uma assinatura ausente ou inválida é rejeitada antes do processamento. Mensagens válidas usam o mesmo motor do simulador local e são deduplicadas por identificador externo.

## Operação segura

- use credenciais de menor privilégio e faça rotação quando necessário;
- mantenha o endpoint temporário privado durante testes;
- não habilite uma hospedagem permanente sem autenticação, rate limiting e observabilidade;
- confirme na documentação oficial da Meta os requisitos atuais antes de produção.
