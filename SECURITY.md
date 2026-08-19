# Production security runbook

## Required Cloudflare configuration

The Worker must have the native D1 binding named `bananto` and the R2 binding
named `BANANTO_BUCKET`, matching `wrangler.jsonc`. Apply migrations before every
deployment:

```sh
bun run cf:migrate
```

Create independent, random production secrets with `wrangler secret put`:

- `SESSION_SECRET`, `ACCOUNT_ENC_KEY`, `IP_SALT`, `RATE_LIMIT_SALT`
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
- `DIAGNOSTIC_SECRET`, `CRON_SECRET`
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- OAuth provider secrets that are actually enabled (`GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` for Google)
- `OWNER_EMAILS` and/or `OWNER_PHONES` (comma-separated verified identities)

Use at least 32 random bytes for application secrets. Never reuse the bot token
as the webhook, diagnostic, cron, session, or encryption secret.

The Cloudflare REST D1 credentials are a local-preview fallback only. Production
must use the native D1 binding and should not receive `CLOUDFLARE_API_TOKEN`.

## Telegram ownership proof

1. Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (16-256 characters;
   use 32+ random characters from `A-Z`, `a-z`, `0-9`, `_`, `-`),
   `TELEGRAM_BOT_USERNAME`, and the Mini App
   short name when one is configured in BotFather.
2. Deploy and apply D1 migrations.
3. The Worker reconciles the webhook automatically on authentication traffic
   and every scheduled run. An operator can also force it with the endpoint
   below. Send the diagnostic secret in a header, never in the URL:

```sh
curl -X POST https://banan.to/api/public/telegram/setup-webhook \
  -H "Authorization: Bearer $DIAGNOSTIC_SECRET"
```

4. Confirm health with the same header at
   `/api/public/telegram/health`, then complete one real Mini App contact-share
   flow. Do not enable `drop_pending_updates`; pending ownership proofs must be
   retained.

## Incident response

If a secret or private data file was ever committed, deleting it in a new
commit is not enough. Immediately rotate the affected credentials, revoke old
tokens, purge private file cache entries, review Cloudflare and GitHub audit
logs, and rewrite the repository history with a coordinated force-push. Keep a
backup and notify every collaborator before rewriting shared history.

Password resets invalidate existing password sessions. Uploaded wallet proofs
are owner/admin-only and are never edge-cached. Diagnostic endpoints require a
separate operator secret.

## Reporting

Do not open a public issue containing credentials, user records, receipts, or
reproduction data. Contact the repository owner privately and include only the
minimum information required to reproduce the issue.
