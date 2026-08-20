/**
 * Pre-configured reference templates for Store Services import.
 * 1. Troubleshooting (حلول المشاكل التقنية)
 * 2. Registration Guides (تعليمات التسجيل وتفعيل الحسابات)
 * 3. FAQ (الأسئلة الشائعة)
 * 4. Purchase Policy (سياسة الشراء وحقوقك والضمان)
 * 5. Contact (تواصل معنا وقنوات الدعم)
 */

import type { ServiceSectionType } from "./types";

/** Shared header explaining the syntax rules understood by the parser */
const SYNTAX_HEADER = `# ======================================================================
# قواعد كتابة القالب (يقرأها المستورد تلقائياً):
#   • حقل بسيط:            key=value      أو      key: value
#   • نص طويل متعدد الأسطر: key<<EOF ثم الأسطر ثم سطر فيه EOF فقط
#   • التعليقات تبدأ بـ #  ولا يتم استيرادها
#   • القيم المنطقية تقبل: true/false أو نعم/لا أو 1/0
#   • القوائم تُفصل بفاصلة أو سطر جديد
#   • الترقيم يقبل الأرقام العربية والإنجليزية (1 أو ١)
#   • يمكنك حذف أي حقل اختياري ولن يؤثر على الاستيراد
# ======================================================================`;

export const TROUBLESHOOTING_TEMPLATE = `# حلول المشاكل التقنية — قالب استيراد البيانات
${SYNTAX_HEADER}
# يمكن استيراد مشكلة واحدة (حقول عليا) أو عدة مشاكل عبر problem.N.*
# ======================================================================

# ---------- المشكلة الأولى ----------
# المعرّف الفريد (اختياري - يُنشأ تلقائياً إن تُرك فارغاً)
id=kb_login_error_2124

# عنوان المشكلة [مطلوب]
title=مشكلة رمز الخطأ 2124-4508 أو تعذر الاتصال بخوادم نينتندو

# التصنيف (حسابات، شبكة، جهاز، متجر، تحميل...)
category=مشاكل الحسابات والاتصال

# وصف المشكلة بالتفصيل
description<<EOF
يظهر هذا الخطأ عند وجود تعارض في إعدادات الاتصال أو حاجة الحساب لإعادة مزامنة سريعة مع خوادم نينتندو بعد التفعيل.
EOF

# رموز الأخطاء المرتبطة (مفصولة بفاصلة)
error_codes=2124-4508, 2811-5003, 2137-8056

# الكلمات المفتاحية لمطابقة بحث العملاء (كلما زادت زادت دقة المساعد الآلي)
keywords=مايدخل, الباس غلط, خطأ اتصال, تعذر الاتصال, 2124, كود 2124

# سؤال توضيحي يطرحه المساعد قبل عرض الخطوات (اختياري)
ask=هل جهازك متصل بشبكة Wi-Fi ومحدث لآخر إصدار للنظام؟

# رابط صورة أو رسم توضيحي للحل (اختياري)
image_url=

# خطوات الحل المرتبة (step.1 ... step.N)
step.1=تأكد من تاريخ ووقت الجهاز واجعله على الوضع التلقائي (Synchronize Clock via Internet).
step.2=أعد تشغيل الجهاز بالضغط المطول على زر Power لمدة 3 ثوانٍ ثم Restart.
step.3=من إعدادات الشبكة غيّر DNS إلى 8.8.8.8 و 8.8.4.4 ثم أعد فحص الاتصال.
step.4=افتح متجر eShop بالحساب المخصص للتأكد من نجاح المزامنة.

# بديل: يمكن كتابة الخطوات دفعة واحدة هكذا
# steps<<EOF
# الخطوة الأولى
# الخطوة الثانية
# EOF

# ======================================================================
# ---------- مشاكل إضافية في نفس الملف ----------
# ======================================================================

problem.2.title=حل مشكلة الشاشة السوداء أو تجمد الجهاز فجأة
problem.2.category=مشاكل النظام والجهاز
problem.2.description=عند تجمد الجهاز أثناء اللعب أو عدم استجابته للشحن.
problem.2.error_codes=2162-0002, 2002-0001
problem.2.keywords=معلق, شاشة سوداء, ما يشتغل, طافي, freeze
problem.2.ask=هل يظهر ضوء الشحن عند توصيل الشاحن الأصلي؟
problem.2.image_url=
problem.2.step.1=اضغط باستمرار على زر Power لمدة 15 ثانية لإجبار الجهاز على الإطفاء.
problem.2.step.2=ضع الجهاز في الشاحن الأصلي مباشرة وانتظر 20 دقيقة.
problem.2.step.3=اضغط زر Power مرة واحدة لتشغيل الجهاز بصورة طبيعية.

problem.3.title=اللعبة لا تظهر في قائمة إعادة التحميل Redownload
problem.3.category=مشاكل المتجر والتحميل
problem.3.description=بعد تفعيل الحساب لا تظهر اللعبة ضمن سجل المشتريات.
problem.3.keywords=ما تظهر اللعبة, redownload, سجل المشتريات
problem.3.step.1=تأكد من تسجيل الدخول بالحساب المُسلَّم من المتجر وليس حسابك الشخصي.
problem.3.step.2=افتح eShop ثم الملف الشخصي ثم Redownload وانتظر تحديث القائمة.
problem.3.step.3=إن استمرت المشكلة راسل الدعم مع رقم الطلب وصورة للشاشة.
`;

export const REGISTRATION_GUIDES_TEMPLATE = `# تعليمات التسجيل وتفعيل الحسابات — قالب استيراد الأدلة
${SYNTAX_HEADER}
# دليل واحد عبر الحقول العليا، أو عدة أدلة عبر guide.N.*
# خطوات الدليل: step.N.title_ar / step.N.description_ar
# ======================================================================

# ---------- الدليل الأول ----------
title_ar=طريقة تفعيل الحساب الأساسي (Primary) وتحميل اللعبة
title_en=How to Activate Primary Account & Download Games

# الرابط المختصر (Slug) — يُولّد تلقائياً إن تُرك فارغاً
slug=primary-account-activation

# تصنيف الدليل (الحسابات، الاشتراكات، الأجهزة...)
category=الحسابات والألعاب الرقمية

# المدة المتوقعة ومستوى الصعوبة
estimated_time=3 دقائق
difficulty=سهل جداً

# صورة الغلاف ورابط الفيديو الإرشادي (اختياري)
cover_image=
video_url=

# نشر الدليل مباشرة للعملاء
published=true

# وصف ومقدمة الدليل
description_ar<<EOF
خطوات سهلة ومباشرة لإضافة الحساب الجديد على جهاز نينتندو سويتش وتفعيله كحساب أساسي للعب بملفك الشخصي دون قيود.
EOF
description_en<<EOF
Step-by-step instructions to add your new account to Nintendo Switch and activate it as Primary.
EOF

# ---------- خطوات الدليل ----------
step.1.title_ar=إضافة مستخدم جديد على السويتش
step.1.title_en=Add New User on Switch
step.1.description_ar=اذهب إلى System Settings > Users > Add User > Create New User ثم اختر أي أيقونة واسم.
step.1.note_ar=يمكنك اختيار أي اسم تريده لهذا الحساب على جهازك.
step.1.image=

step.2.title_ar=ربط حساب نينتندو (Link Nintendo Account)
step.2.title_en=Link Nintendo Account
step.2.description_ar=اختر Link a Nintendo Account ثم Sign In with E-mail وأدخل الإيميل وكلمة السر المستلمة من بنانا ستور.
step.2.warning_ar=أدخل الأحرف الكبيرة والصغيرة في كلمة السر بدقة كما وصلتك.

step.3.title_ar=التحقق من تفعيل الحساب الأساسي (Primary)
step.3.title_en=Verify Primary Console Status
step.3.description_ar=افتح eShop بالحساب الجديد، اضغط صورة البروفايل، وتأكد أن Primary Console = Active.

step.4.title_ar=بدء تحميل اللعبة واللعب بحسابك الشخصي
step.4.title_en=Download & Play on Your Main Profile
step.4.description_ar=من قائمة Redownload اضغط أيقونة السحابة بجانب اللعبة، وبعد التحميل العب من ملفك الشخصي.

# ======================================================================
# ---------- دليل إضافي في نفس الملف ----------
# ======================================================================

guide.2.title_ar=طريقة تفعيل اشتراك Nintendo Switch Online
guide.2.category=الاشتراكات
guide.2.estimated_time=دقيقتان
guide.2.difficulty=سهل
guide.2.description_ar=خطوات تفعيل كود الاشتراك والاستفادة من اللعب الأونلاين والألعاب الكلاسيكية.
guide.2.step.1.title_ar=فتح متجر eShop
guide.2.step.1.description_ar=ادخل إلى eShop بالحساب الذي تريد تفعيل الاشتراك عليه.
guide.2.step.2.title_ar=إدخال كود التفعيل
guide.2.step.2.description_ar=اختر Redeem Code وأدخل الكود المكوّن من 16 خانة ثم اضغط Confirm.
guide.2.step.3.title_ar=التأكد من التفعيل
guide.2.step.3.description_ar=من Nintendo Switch Online تأكد من ظهور تاريخ انتهاء الاشتراك.
`;

export const FAQ_TEMPLATE = `# الأسئلة الشائعة — قالب استيراد الأقسام والأسئلة
${SYNTAX_HEADER}
# الأقسام: category.N.id / category.N.name_ar
# الأسئلة: faq.N.question_ar / faq.N.answer_ar
# يمكن ربط السؤال بالقسم عبر category_id أو باسم القسم مباشرة (category=)
# ======================================================================

# ---------- الأقسام ----------
category.1.id=cat_accounts
category.1.name_ar=الحسابات والتفعيل
category.1.name_en=Accounts & Activation
category.1.published=true

category.2.id=cat_delivery
category.2.name_ar=الطلبات والتسليم
category.2.name_en=Orders & Delivery
category.2.published=true

category.3.id=cat_warranty
category.3.name_ar=الضمان والاسترجاع
category.3.name_en=Warranty & Refunds
category.3.published=true

# ---------- الأسئلة ----------
faq.1.category_id=cat_accounts
faq.1.question_ar=هل يمكنني اللعب بحسابي الشخصي بعد شراء اللعبة الرقمية؟
faq.1.question_en=Can I play with my own profile after buying a digital game?
faq.1.answer_ar<<EOF
نعم، بعد تفعيل الحساب المُسلَّم كحساب أساسي (Primary) على جهازك يمكنك تحميل اللعبة واللعب بملفك الشخصي وبدون إنترنت.
EOF
faq.1.keywords=حسابي الشخصي, primary, اللعب اوفلاين
faq.1.featured=true
faq.1.published=true

faq.2.category_id=cat_delivery
faq.2.question_ar=كم يستغرق تسليم الطلب بعد الدفع؟
faq.2.answer_ar=غالباً خلال 5 إلى 30 دقيقة داخل أوقات العمل، وفي أوقات الذروة قد يصل إلى ساعة كحد أقصى.
faq.2.keywords=مدة التسليم, متى يوصل الطلب
faq.2.featured=true

faq.3.category_id=cat_warranty
faq.3.question_ar=ما هي مدة الضمان على الحسابات الرقمية؟
faq.3.answer_ar=الضمان يغطي صلاحية الحساب وعمل اللعبة طوال فترة الضمان المذكورة في صفحة المنتج، مع استبدال فوري عند أي خلل.
faq.3.keywords=ضمان, استبدال, تعويض

# مثال: ربط السؤال بالقسم عبر الاسم بدل المعرّف (سيُنشأ القسم تلقائياً إن لم يوجد)
faq.4.category=الدفع والأسعار
faq.4.question_ar=ما هي طرق الدفع المتاحة؟
faq.4.answer_ar=زين كاش، آسيا حوالة، ماستر كارد، والدفع عند الاستلام داخل بغداد.
faq.4.keywords=دفع, زين كاش, ماستر كارد
`;

export const PURCHASE_POLICY_TEMPLATE = `# سياسة الشراء وحقوقك والضمان — قالب استيراد الوثيقة
${SYNTAX_HEADER}
# بنود الوثيقة عبر section.N.title_ar / section.N.body_ar
# ======================================================================

# عنوان الوثيقة
title_ar=سياسة الشراء وحقوق العميل والضمان الذهبي
title_en=Purchase Policy, Customer Rights & Warranty

# العنوان الفرعي
subtitle_ar=كل ما تحتاج معرفته قبل إتمام الطلب: الضمان، الاستبدال، وحقوقك الكاملة.
subtitle_en=Everything you need to know before completing your order.

# إصدار الوثيقة وتاريخ سريانها
version=v2.4
effective_date=2026-01-01

# ملاحظة هامة تظهر في رأس الصفحة
important_notices<<EOF
يرجى قراءة بنود الشراء والضمان بدقة قبل إتمام الطلب. إتمام عملية الشراء يُعد موافقة كاملة على كافة الضوابط والحقوق الموضحة أدناه.
EOF

# وسيلة التواصل للشكاوى والاستفسارات
contact_note=لأي استفسار متعلق بالضمان، فريق الدعم متواجد على مدار الساعة عبر الدردشة المباشرة أو واتساب.

# ---------- بنود وفقرات السياسة ----------
section.1.title_ar=1. الضمان الرسمي والمصدر المعتمد
section.1.title_en=1. Official Warranty & Authorized Sourcing
section.1.body_ar<<EOF
جميع المنتجات والألعاب الرقمية في بنانا ستور يتم شراؤها وتفعيلها عبر قنوات رسمية 100% ومن متجر Nintendo eShop المعتمد بدون أي برمجيات معدلة أو حسابات غير موثوقة.
EOF
section.1.highlight=true

section.2.title_ar=2. حقوق العميل في الاستبدال والتعويض
section.2.title_en=2. Replacement & Compensation Rights
section.2.body_ar<<EOF
يحق للعميل استبدال فوري للمنتج أو استرداد كامل المبلغ في حال وجود خطأ بالبيانات المسلمة أو تعذر تشغيل المنتج لأسباب فنية لم تُحل خلال 24 ساعة.
EOF
section.2.highlight=true

section.3.title_ar=3. شروط استخدام الحسابات الرقمية
section.3.title_en=3. Digital Account Usage Terms
section.3.body_ar<<EOF
يلتزم المشتري بعدم تغيير البريد الإلكتروني للحساب أو مشاركته مع أجهزة غير مصرح بها، لضمان استمرار سريان الضمان وحماية الحساب.
EOF
section.3.highlight=false

section.4.title_ar=4. خصوصية وأمان المعاملات المالية
section.4.title_en=4. Payment Security & Privacy
section.4.body_ar<<EOF
تتم كافة عمليات الدفع عبر بوابات مشفرة وآمنة، ولا يتم تخزين أي بيانات بنكية أو بطاقات دفع على خوادم المتجر.
EOF
section.4.highlight=false

section.5.title_ar=5. حالات لا يشملها الضمان
section.5.title_en=5. Warranty Exclusions
section.5.body_ar<<EOF
لا يشمل الضمان تغيير بيانات الحساب من قبل العميل، أو مشاركته مع طرف ثالث، أو الحظر الناتج عن مخالفة شروط نينتندو.
EOF
section.5.highlight=false
`;

export const CONTACT_TEMPLATE = `# تواصل معنا وقنوات الدعم — قالب استيراد البيانات
${SYNTAX_HEADER}
# القنوات: channel.N.type / channel.N.value  (يُبنى الرابط تلقائياً)
# الخدمات: service.N.title_ar / service.N.description_ar
# ======================================================================

# ---------- رأس صفحة التواصل ----------
hero_title_ar=تواصل مع فريق بنانا ستور
hero_title_en=Contact Banana Store Support
hero_subtitle_ar=فريق الدعم جاهز لمساعدتك في الطلبات، التفعيل، والمشاكل التقنية.
hero_subtitle_en=Our team is ready to help with orders, activation and technical issues.

support_intro_ar<<EOF
اختر وسيلة التواصل الأنسب لك، ومتوسط زمن الرد لا يتجاوز 5 دقائق خلال أوقات العمل.
EOF

# ---------- وسائل التواصل السريعة ----------
# إن تُركت القنوات التفصيلية فارغة، تُبنى القنوات تلقائياً من هذه الحقول
whatsapp=+9647700000000
telegram=@bananastore
phone=+9647700000000
email=support@banan.to
chat_link=/support

# ---------- أوقات العمل والحالة ----------
working_hours_ar=يومياً من 10 صباحاً حتى 12 منتصف الليل (بتوقيت بغداد)
working_hours_en=Daily 10 AM – 12 AM (Baghdad time)
status_message_ar=الدعم متاح الآن — متوسط الرد 5 دقائق
status_message_en=Support is online — average reply in 5 minutes
emergency_notice_ar=للحالات العاجلة المتعلقة بطلب قيد التنفيذ، استخدم واتساب لأسرع استجابة.

# ---------- قنوات التواصل التفصيلية ----------
channel.1.type=whatsapp
channel.1.label_ar=واتساب الدعم الفوري
channel.1.label_en=WhatsApp Support
channel.1.value=+9647700000000
channel.1.availability=24/7
channel.1.active=true

channel.2.type=telegram
channel.2.label_ar=تيليجرام
channel.2.label_en=Telegram
channel.2.value=@bananastore
channel.2.availability=10:00 - 00:00
channel.2.active=true

channel.3.type=phone
channel.3.label_ar=اتصال مباشر
channel.3.value=+9647700000000
channel.3.availability=10:00 - 22:00

channel.4.type=email
channel.4.label_ar=البريد الإلكتروني
channel.4.value=support@banan.to
channel.4.availability=رد خلال 12 ساعة

channel.5.type=chat
channel.5.label_ar=الدردشة داخل الموقع
channel.5.value=/support
channel.5.href=/support
channel.5.availability=فوري

# ---------- خدمات الدعم المعروضة في الصفحة ----------
service.1.title_ar=متابعة الطلبات والتسليم
service.1.description_ar=استعلم عن حالة طلبك أو أعد إرسال بيانات الحساب المشتراة.
service.1.icon=package
service.1.link=/orders
service.1.button_label_ar=متابعة طلبي
service.1.active=true

service.2.title_ar=حل المشاكل التقنية
service.2.description_ar=رموز الأخطاء، مشاكل التحميل، وتفعيل الحساب الأساسي.
service.2.icon=wrench
service.2.link=/support
service.2.button_label_ar=ابدأ التشخيص

service.3.title_ar=الضمان والاستبدال
service.3.description_ar=قدّم طلب استبدال أو استرداد ضمن سياسة الضمان الذهبي.
service.3.icon=shield
service.3.link=/policy
service.3.button_label_ar=اطلع على الضمان
`;

export const TRADE_RULES_TEMPLATE = `# سياسة المقايضة والاستبدال — قالب استيراد الأقسام والبنود
# كل استيراد جديد يُضاف فوق البنود الموجودة (لا يحذف القديم).
# الأقسام المتاحة (category):
#   box_presence = العلبة | box_condition = حالة العلبة | cartridge_condition = حالة الشريحة
#   extras = الملحقات | cleanliness = النظافة العامة | edition = نسخة اللعبة
#   region = المنطقة | demand = الطلب في السوق | payout_method = طريقة التسليم
# percent = نسبة التعديل على السعر (سالبة للخصم، موجبة للزيادة)

policy_title_ar=سياسة المقايضة والاستبدال
policy_body_ar<<EOF
تُحتسب قيمة المقايضة على أساس سعر السوق الحالي للعبة مع تطبيق نسب البنود أدناه.
يحق للمتجر رفض أي قطعة تالفة أو غير أصلية.
EOF

rule.1.category=box_presence
rule.1.key=with_box
rule.1.label_ar=مع العلبة الأصلية
rule.1.label_en=With original box
rule.1.percent=0
rule.1.sort_order=10
rule.1.active=true

rule.2.category=box_presence
rule.2.key=no_box
rule.2.label_ar=بدون علبة
rule.2.label_en=No box
rule.2.percent=-10
rule.2.sort_order=20
rule.2.active=true

rule.3.category=cartridge_condition
rule.3.key=like_new
rule.3.label_ar=الشريحة بحالة ممتازة
rule.3.label_en=Cartridge like new
rule.3.percent=0
rule.3.sort_order=10
rule.3.active=true

rule.4.category=cartridge_condition
rule.4.key=scratched
rule.4.label_ar=خدوش واضحة على الشريحة
rule.4.label_en=Visible scratches
rule.4.percent=-15
rule.4.sort_order=20
rule.4.active=true

rule.5.category=payout_method
rule.5.key=store_credit
rule.5.label_ar=رصيد داخل المتجر
rule.5.label_en=Store credit
rule.5.percent=10
rule.5.sort_order=10
rule.5.active=true
`;

export function getTemplateForSection(type: ServiceSectionType): string {
  switch (type) {
    case "troubleshooting":
      return TROUBLESHOOTING_TEMPLATE;
    case "registration_guides":
      return REGISTRATION_GUIDES_TEMPLATE;
    case "faq":
      return FAQ_TEMPLATE;
    case "purchase_policy":
      return PURCHASE_POLICY_TEMPLATE;
    case "contact":
      return CONTACT_TEMPLATE;
    case "trade_rules":
      return TRADE_RULES_TEMPLATE;
    default:
      return TROUBLESHOOTING_TEMPLATE;
  }
}
