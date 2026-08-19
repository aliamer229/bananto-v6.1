# ربط المستخدمين المستوردين بـ Cloudflare D1 و R2

مسار واحد فقط يكتب إلى قاعدة البيانات: `scripts/link-legacy-cloudflare.mjs`
(سكربت محلي يعمل عبر `wrangler`). سكربت `import-legacy-staging.mjs` أصبح للتدقيق فقط.

## القواعد المطبّقة

- المستخدمون القدامى يبقون في `legacy_users` بحالة `unclaimed` — لا يُنشأ أي صف في جدول `users` الحي.
- الربط بالحساب الحقيقي يتم فقط عبر تدفّق المطالبة (Claim) بعد التحقق من الهوية.
- لا يُعاد منح الموز: سجل `legacy_banana_transactions` تاريخي فقط، والرصيد الحالي هو المرجع.
- المحادثات تُستورد `closed / RESOLVED` حتى لا يمتلئ صندوق الأدمن.
- R2: تُسجَّل المراجع فقط (bucket + key + سياسة الوصول) بدون رفع أي ملف، والخاص يبقى خاصاً.

## التشغيل

```bash
# 1) تجربة بدون كتابة (تدقيق الأرقام فقط)
npm run legacy:link:dry -- ./bananto_v4_legacy_import_ready_with_account_cards.zip

# 2) تجربة على قاعدة wrangler المحلية
npm run legacy:link:local -- ./bananto_v4_legacy_import_ready_with_account_cards.zip

# 3) التنفيذ الفعلي على Cloudflare D1
export CLOUDFLARE_API_TOKEN=...      # أو: npx wrangler login
export CLOUDFLARE_ACCOUNT_ID=...
npm run legacy:link:remote -- ./bananto_v4_legacy_import_ready_with_account_cards.zip

# 4) التحقق لاحقاً من الأرقام داخل D1
npm run legacy:verify:remote
```

## النتيجة المتوقعة (من الأرشيف الحالي)

| الجدول                     | عدد الصفوف                |
| -------------------------- | ------------------------- |
| legacy_users               | 272                       |
| legacy_banana_transactions | 363                       |
| legacy_orders              | 262                       |
| legacy_order_items         | 428                       |
| legacy_threads             | 380                       |
| legacy_messages            | 9164                      |
| legacy_reviews             | 397                       |
| legacy_review_images       | 290                       |
| legacy_media               | 1582 (296 عام / 1286 خاص) |

إجمالي رصيد الموز: **18,979,275 🍌**

يكتب السكربت تقريراً في `.legacy-link/link-report.json` ويخرج بكود 1 عند أي فرق بين الأرشيف وD1.
