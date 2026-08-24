# Configuração do Twilio WhatsApp

Esta integração é opcional. Para desenvolvimento sem conta externa, mantenha `WHATSAPP_PROVIDER=mock`.

## Pré-requisitos

- conta Twilio e remetente/Sandbox do WhatsApp configurados pelo operador;
- endpoint HTTPS acessível durante o teste;
- destinatário autorizado segundo as regras atuais da conta;
- entendimento das limitações de trial, templates e cobrança.

## Ambiente local

No `.env` ignorado, selecione `WHATSAPP_PROVIDER=twilio` e preencha `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WHATSAPP_TO` e `TWILIO_WEBHOOK_URL`. `TWILIO_CONTENT_SID` é opcional quando a conta exige um template aprovado.

Endereços devem seguir o formato exigido pelo provedor. Não registre números, SIDs ou tokens neste repositório.

## Webhook

Cadastre a rota `/api/webhooks/twilio/whatsapp` com método POST. `TWILIO_WEBHOOK_URL` deve corresponder exatamente ao endereço cadastrado, porque a assinatura inclui a URL completa.

O endpoint espera formulário URL-encoded, valida a assinatura oficial antes de persistir e responde com TwiML vazio. O identificador da mensagem é único e impede que uma nova entrega execute o comando novamente.

## Diagnóstico

- `INVALID_TWILIO_SIGNATURE`: confira token, URL exata e reinicie a API;
- falha de envio: confirme provedor, remetente, destinatário e estado do Sandbox;
- template exigido: configure um modelo permitido pela conta, sem tentar contornar a restrição;
- webhook não alcançado: confirme que API e endpoint HTTPS atual continuam ativos.

Logs de produção não devem imprimir credenciais, payloads completos ou destinatários. Consulte sempre a documentação oficial do Twilio para regras atuais.
