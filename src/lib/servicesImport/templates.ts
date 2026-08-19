/**
 * Pre-configured reference templates for Store Services import.
 * 1. Troubleshooting (حلول المشاكل التقنية)
 * 2. Registration Guides (تعليمات التسجيل وتفعيل الحسابات)
 * 3. FAQ (الأسئلة الشائعة)
 * 4. Purchase Policy (سياسة الشراء وحقوقك والضمان)
 */

import type { ServiceSectionType } from "./types";

export const TROUBLESHOOTING_TEMPLATE = `# حلول المشاكل التقنية — قالب استيراد البيانات
# ====================================================
# الصيغة: key=value
# للنصوص الطويلة: key<<EOF
# محتوى النص
# EOF
# للخطوات: step.1= / step.2= أو عبر problem.1.step.1=
# ====================================================

# المعرّف الفريد للمشكلة (اختياري)
id=kb_login_error_2124

# عنوان المشكلة [مطلوب]
title=مشكلة رمز الخطأ 2124-4508 أو تعذر الاتصال بخوادم نينتندو

# التصنيف (حسابات، شبكة، جهاز، متجر...)
category=مشاكل الحسابات والاتصال

# وصف المشكلة بالتفصيل
description<<EOF
يظهر هذا الخطأ عند وجود تعارض في إعدادات الاتصال أو حاجة الحساب لإعادة مزامنة سريعة مع خوادم نينتندو بعد التفعيل.
EOF

# رموز الأخطاء المرتبطة (مفصولة بفاصلة)
error_codes=2124-4508, 2811-5003, 2137-8056

# الكلمات المفتاحية لمطابقة بحث العملاء
keywords=مايدخل, الباس غلط, خطأ اتصال, تعذر الاتصال, 2124, كود 2124

# سؤال توضيحي يطرحه المساعد قبل عرض الخطوات (اختياري)
ask=هل جهازك متصل بشبكة Wi-Fi ومحدث لآخر إصدار للنظام؟

# رابط صورة أو رسم توضيحي للحل (اختياري)
image_url=

# خطوات الحل المرتبة:
step.1=تأكد من تاريخ ووقت الجهاز واجعله على الوضع التلقائي (Synchronize Clock via Internet).
step.2=قم بإعادة تشغيل جهاز السويتش بالكامل بالضغط المطول على زر التشغيل Power لمدة 3 ثوانٍ ثم Restart.
step.3=ادخل إلى إعدادات الشبكة وانتقل إلى DNS وضع الأساسي 8.8.8.8 والثانوي 8.8.4.4 ثم أعد فحص الاتصال.
step.4=افتح متجر eShop باستخدام الحساب المخصص للتحقق من نجاح المزامنة وتحميل اللعبة.

# ====================================================
# يمكنك إضافة مشكلة ثانية وثالثة بنفس الملف كالتالي:
# ====================================================

problem.2.title=حل مشكلة الشاشة السوداء أو تجمد الجهاز فجأة
problem.2.category=مشاكل النظام والجهاز
problem.2.description=عند تجمد الجهاز أثناء اللعب أو عدم استجابته للشحن.
problem.2.error_codes=2162-0002, 2002-0001
problem.2.keywords=معلق, شاشة سوداء, ما يشتغل, طافي, freeze
problem.2.step.1=اضغط باستمرار على زر التشغيل Power لمدة 15 ثانية متواصلة لإجبار الجهاز على إيقاف التشغيل.
problem.2.step.2=ضع الجهاز في الشاحن الأصلي مباشرة وانتظر 20 دقيقة.
problem.2.step.3=اضغط زر التشغيل مرة واحدة لتشغيل الجهاز بصورة طبيعية.
`;

export const REGISTRATION_GUIDES_TEMPLATE = `# تعليمات التسجيل وتفعيل الحسابات — قالب استيراد الأدلة
# ====================================================
# الصيغة: key=value
# للنصوص الطويلة: key<<EOF ... EOF
# لتحديد الخطوات: step.1.title= / step.1.description=
# ====================================================

# عنوان الدليل الرئيسي [مطلوب]
title_ar=طريقة تفعيل الحساب الأساسي (Primary) وتحميل اللعبة
title_en=How to Activate Primary Account & Download Games

# الرابط المختصر (Slug)
slug=primary-account-activation

# تصنيف الدليل (الحسابات، الاشتراكات، الأجهزة...)
category=الحسابات والألعاب الرقمية

# المدة المتوقعة للتطبيق ومستوى الصعوبة
estimated_time=3 دقائق
difficulty=سهل جداً

# صورة الغلاف ورابط الفيديو الإرشادي (اختياري)
cover_image=
video_url=

# وصف ومقدمة الدليل
description_ar<<EOF
خطوات سهلة ومباشرة لإضافة الحساب الجديد على جهاز نينتندو سويتش الخاص بك وتفعيله كحساب أساسي للعب بملفك الشخصي دون قيود.
EOF
description_en<<EOF
Step-by-step instructions to add your new account to Nintendo Switch and activate it as Primary.
EOF

# ====================================================
# خطوات الدليل المرتبة:
# ====================================================

step.1.title_ar=إضافة مستخدم جديد على السويتش
step.1.title_en=Add New User on Switch
step.1.description_ar=اذهب إلى إعدادات الجهاز System Settings > Users > Add User > Create New User ثم اختر أي أيقونة واسم.
step.1.note_ar=يمكنك اختيار أي اسم تريده لهذا الحساب على جهازك.

step.2.title_ar=ربط حساب نينتندو (Link Nintendo Account)
step.2.title_en=Link Nintendo Account
step.2.description_ar=اختر Link a Nintendo Account ثم Sign In with E-mail or Sign-In ID وأدخل الإيميل وكلمة السر المستلمة من بنانا ستور.
step.2.warning_ar=تأكد من إدخال الأحرف الكبيرة والصغيرة في كلمة السر بدقة كما وصلتك.

step.3.title_ar=التحقق من تفعيل الحساب الأساسي (Primary)
step.3.title_en=Verify Primary Console Status
step.3.description_ar=افتح Nintendo eShop بالحساب الجديد، اضغط على صورة البروفايل في الزاوية العلوية، وانزل إلى خيار Primary Console وتأكد من أنه Pass / Active.

step.4.title_ar=بدء تحميل اللعبة واللعب بحسابك الشخصي
step.4.title_en=Download & Play on Your Main Profile
step.4.description_ar=انتقل إلى قسم Redownload في القائمة الجانبية للمتجر واضغط على أيقونة السحابة بجانب اللعبة، بعد اكتمال التحميل يمكنك اللعب من ملفك الشخصي الأساسي.
`;

export const FAQ_TEMPLATE = `# الأسئلة الشائعة — قالب استيراد الأقسام والأسئلة
# ====================================================
# الصيغة: key=value
# للأقسام: category.1.id= / category.1.name_ar=
# للأسئلة: faq.1.category_id= / faq.1.question_ar= / faq.1.answer_ar=
# ====================================================

# ----------------------------------------------------
# 1. أقسام الأسئلة (Categories)
# ----------------------------------------------------
category.1.id=cat_accounts
category.1.name_ar=الحسابات والألعاب الرقمية
category.1.name_en=Accounts & Digital Games

category.2.id=cat_delivery
category.2.name_ar=طرق الدفع والتسليم
category.2.name_en=Payment & Delivery

category.3.id=cat_warranty
category.3.name_ar=الضمان والدعم الفني
category.3.name_en=Warranty & Support

# ----------------------------------------------------
# 2. الأسئلة والإجابات (Questions & Answers)
# ----------------------------------------------------

# السؤال الأول
faq.1.category_id=cat_accounts
faq.1.question_ar=ما الفرق بين الحساب الأساسي (Primary) والحساب الثانوي (Secondary)؟
faq.1.question_en=What is the difference between Primary and Secondary accounts?
faq.1.answer_ar<<EOF
الحساب الأساسي (Primary) يتيح لك تشغيل اللعبة من حسابك الشخصي وملفات حفظك الخاصة، ولا يشترط اتصالاً مستمراً بالإنترنت. بينما الحساب الثانوي (Secondary) تلعب من نفس الحساب المشترى ويتطلب اتصال إنترنت للتحقق.
EOF
faq.1.keywords=فرق, برايمري, سكندري, أساسي, ثانوي, save
faq.1.featured=true

# السؤال الثاني
faq.2.category_id=cat_delivery
faq.2.question_ar=كم يستغرق تسليم الحساب أو كود اللعبة بعد إتمام الطلب؟
faq.2.question_en=How long does order delivery take?
faq.2.answer_ar=التسليم فوري وتلقائي خلال دقيقة واحدة إلى 5 دقائق، حيث تظهر بيانات الحساب مباشرة في صفحة طلباتك وفي محادثة الدعم.
faq.2.keywords=وقت, مدة, تسليم, فوري, استلام
faq.2.featured=true

# السؤال الثالث
faq.3.category_id=cat_warranty
faq.3.question_ar=هل الألعاب والحسابات مضمونة ضد القفل؟
faq.3.question_en=Are games and accounts guaranteed?
faq.3.answer_ar=نعم، جميع ألعاب وحسابات بنانا ستور رسمية 100% ومشتراة من متجر Nintendo eShop الرسمي، ومشمولة بضمان ذهبي شامل ومتابعة فنية مستمرة.
faq.3.keywords=ضمان, قفل, رسمي, بند, حماية
faq.3.featured=true

# السؤال الرابع
faq.4.category_id=cat_accounts
faq.4.question_ar=هل يمكنني حذف الحساب من السويتش بعد تحميل اللعبة؟
faq.4.question_en=Can I delete the account after downloading?
faq.4.answer_ar=لا، يجب إبقاء الحساب موجوداً على الجهاز لتعمل اللعبة برخصتها الرسمية. حذفه يؤدي لتوقف اللعبة عن العمل حتى إعادة إضافته.
faq.4.keywords=حذف, مسح, delete, إزالة
faq.4.featured=false
`;

export const PURCHASE_POLICY_TEMPLATE = `# سياسة الشراء وحقوقك والضمان — قالب استيراد البنود
# ====================================================
# الصيغة: key=value
# للنصوص الطويلة: key<<EOF ... EOF
# للبنود: section.1.title_ar= / section.1.body_ar=
# ====================================================

# عنوان وثيقة السياسة [مطلوب]
title_ar=سياسة الشراء والضمان وحقوق العملاء
title_en=Purchase, Warranty & Customer Rights Policy

# الوصف الفرعي
subtitle_ar=شروط الاستخدام، سياسات الاستبدال، وحماية حقوق المشتري في بنانا ستور
subtitle_en=Terms of service, warranty coverage, and customer buyer protection

# رقم الإصدار وتاريخ السريان
version=v2.4
effective_date=2026-01-01

# ملاحظة هامة تظهر في رأس الصفحة
important_notices<<EOF
يرجى قراءة بنود الشراء والضمان بدقة قبل إتمام الطلب. إتمام عملية الشراء يُعد موافقة كاملة على كافة الضوابط والحقوق الموضحة أدناه لضمان تجربة آمنة وموثوقة.
EOF

# وسيلة التواصل للشكاوى والاستفسارات
contact_note=في حال واجهت أي استفسار أو مشكلة متعلقة بالضمان، فريق الدعم الفني متواجد على مدار الساعة عبر الدعم المباشر أو واتساب لمساعدتك فوراً.

# ====================================================
# بنود وفقرات السياسة:
# ====================================================

section.1.title_ar=1. الضمان الرسمي والمصدر المعتمد
section.1.title_en=1. Official Warranty & Authorized Sourcing
section.1.body_ar<<EOF
جميع المنتجات والألعاب الرقمية المتوفرة في بنانا ستور يتم شراؤها وتفعيلها عبر قنوات رسمية 100% ومن متجر Nintendo eShop المعتمد بدون أي برمجيات معدلة أو حسابات غير موثوقة.
EOF
section.1.highlight=true

section.2.title_ar=2. حقوق العميل في الاستبدال والتعويض
section.2.title_en=2. Replacement & Compensation Rights
section.2.body_ar<<EOF
يحق للعميل استبدال فوري للمنتج أو استرداد كامل المبلغ في حال وجود أي خطأ بالبيانات المسلمة أو تعذر تشغيل المنتج لأسباب فنية لم يتم حلها من قبل فريق الدعم الفني خلال 24 ساعة.
EOF
section.2.highlight=true

section.3.title_ar=3. شروط استخدام الحسابات الرقمية
section.3.title_en=3. Digital Account Usage Terms
section.3.body_ar<<EOF
يلتزم المشتري بعدم تغيير البريد الإلكتروني للحساب أو محاولة مشاركته مع أجهزة أخرى غير المصرح بها، لضمان استمرار سريان الضمان الشامل وحماية الحساب من أي تعارض أمني.
EOF
section.3.highlight=false

section.4.title_ar=4. خصوصية وأمان المعاملات المالية
section.4.title_en=4. Payment Security & Privacy
section.4.body_ar<<EOF
تتم كافة عمليات الدفع عبر بوابات مشفرة وآمنة تماماً، ولا يتم تخزين أي بيانات بنكية أو بطاقات دفع حساسة على خوادم المتجر نهائياً.
EOF
section.4.highlight=false
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
  }
}
