# Integração WhatsApp

## Modos disponíveis

| Provedor | Uso | Chamada externa |
|---|---|---|
| `mock` | desenvolvimento e simulador local | não |
| `meta` | WhatsApp Cloud API oficial | sim |
| `twilio` | Twilio WhatsApp/Sandbox | sim |

Todos os modos usam o mesmo processamento de conversa e o mesmo SQLite. O modo `mock` é o padrão seguro.

## Princípios de configuração

1. copie `.env.example` para `.env`;
2. escolha apenas um provedor;
3. preencha credenciais e endereços somente no arquivo local ou cofre de segredos;
4. configure no provedor a URL HTTPS exata do webhook atual;
5. reinicie a API após alterar o ambiente.

Nunca registre tokens, identificadores de conta, destinatários, payloads reais ou URLs temporárias em commits, issues ou screenshots.

## Segurança

- Meta: challenge de verificação e assinatura HMAC SHA-256;
- Twilio: assinatura oficial calculada sobre a URL e os campos recebidos;
- ambos: identificador externo único para evitar execução duplicada;
- falhas de assinatura são rejeitadas antes do processamento.

Consulte `META_SETUP.md` e `TWILIO_SETUP.md` para os passos específicos. Regras, preços e restrições dos provedores podem mudar; confirme sempre na documentação oficial antes de uso real.
