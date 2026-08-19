# Banana Store

متجر ألعاب Nintendo Switch متكامل يعمل بالكامل على Cloudflare (Worker + D1 + R2).

**الموقع**: https://banan.to

## الميزات

- كتالوج ألعاب Nintendo Switch مع استخراج بيانات ذكي.
- سلة مشتريات وطلبات للألعاب الرقمية (حسابات) والأجهزة/الملحقات.
- نظام محادثات مرتبط بالطلبات والدعم الذكي.
- لوحة إدارة لإدارة المنتجات والطلبات والمحادثات.
- سوق Banana (نقاط وعروض) متكامل مع D1.

## التقنية

- Frontend: React 19 + TanStack Start + Tailwind CSS
- Backend: Cloudflare Worker (SSR + server functions)
- Database: Cloudflare D1
- Storage: Cloudflare R2
- Auth: Cookie-based auth implemented in the Worker
- AI: Google Gemini API (direct)

## التطوير

```sh
bun install
bun run dev
```

## النشر

```sh
bun run check
bun run cf:migrate
bun run cf:deploy
```

يطبّق `cf:deploy` ترحيلات D1 والاختبارات والبناء قبل نشر الـ Worker. لا تحفظ
ملفات `.env` أو قواعد SQLite أو مجلد `.data` في Git؛ استخدم أسرار Cloudflare
والربط الأصلي المعرّف في `wrangler.jsonc`.

راجع [SECURITY.md](./SECURITY.md) لقائمة أسرار الإنتاج، تفعيل Telegram webhook،
وخطوات الاستجابة عند الاشتباه بتسريب.
