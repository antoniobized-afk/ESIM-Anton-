# Config Gotchas

> [Назад к оглавлению](./README.md)

- `.env.example` теперь есть, но его нужно считать живым контрактом и обновлять вместе с кодом.
- Нельзя слепо переносить env keys из старых markdown-файлов: часть названий исторически не соответствовала текущему коду.
- `CLOUDPAYMENTS_ENFORCE_HMAC=false` допустим только как осознанный локальный
  override для unsigned smoke. Production и безопасный `.env.example` default
  обязаны использовать `true`: при `false` callback без `Content-HMAC`
  проходит в business handler.
