# Jitsi self-host — referência de infra (fatia 38)

O backend já minta JWT (`VideoService.mintJitsiToken`) e o frontend já envia
via `jwt` no `JitsiMeetExternalAPI`. Falta só o servidor. Referência mínima
com Docker (ajustar domínio, segredos e TURN para produção):

```yaml
services:
  prosody:
    image: jitsi/prosody:stable
    environment:
      XMPP_DOMAIN: meet.exemplo.com
      XMPP_AUTH_DOMAIN: auth.meet.exemplo.com
      XMPP_MUC_DOMAIN: muc.meet.exemplo.com
      XMPP_INTERNAL_MUC_DOMAIN: internal-muc.meet.exemplo.com
      XMPP_RECORDER_DOMAIN: recorder.meet.exemplo.com
      XMPP_HIDDEN_DOMAIN: hidden.meet.exemplo.com
      JVB_AUTH_USER: jvb
      JVB_AUTH_PASSWORD: <gerar>
      JICOFO_AUTH_USER: focus
      JICOFO_AUTH_PASSWORD: <gerar>
      JICOFO_AUTH_DOMAIN: auth.meet.exemplo.com
```

Prosody (`prosody.cfg.lua`) — pontos do secure domain:

```lua
plugin_paths = { "/usr/share/jitsi-meet/prosody-plugins/" }
asap_accepted_issuers = { "trainlab" }
asap_accepted_audiences = { "trainlab" }

VirtualHost "meet.exemplo.com"
    authentication = "token"
    app_id = "trainlab"              -- igual ao JITSI_APP_ID do backend
    app_secret = "<JITSI_JWT_SECRET>" -- igual ao JITSI_JWT_SECRET do backend
    allow_empty_token = false

Component "conference.meet.exemplo.com" "muc"
    modules_enabled = { "token_verification" }
```

Backend:

```env
JITSI_DOMAIN="meet.exemplo.com"
JITSI_APP_ID="trainlab"
JITSI_JWT_SECRET="<mesmo app_secret do Prosody>"
```

Notas:

- `sub` do token = domínio (`meet.exemplo.com`), `room` = nome exato da sala,
  `moderator: true` só para dono/admin (decidido no `AppointmentsService`).
- `meet.jit.si` nunca recebe token e continua abrindo em nova guia.
- Gravação, transcrição, lobby e TURN dedicado ficam para fatias futuras.
