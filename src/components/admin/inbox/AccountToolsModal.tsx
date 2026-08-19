import React, { useState } from "react";
import {
  Key,
  ShieldCheck,
  FileText,
  Sparkles,
  Send,
  X,
  Copy,
  Check,
  CreditCard,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

interface AccountToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "credentials" | "otp" | "instructions" | "card";
  onSendCredentials: (payload: {
    platform: string;
    email: string;
    password?: string;
    notes?: string;
    pin?: string;
  }) => void;
  onSendVerificationCode: (payload: { code: string; expiresInMinutes?: number }) => void;
  onSendInstructions: (payload: { title: string; text: string }) => void;
  onSendCardCode?: (payload: {
    cardType: string;
    code: string;
    pin?: string;
    instructions?: string;
  }) => void;
}

const PRESET_INSTRUCTIONS = [
  {
    title: "طريقة تفعيل حساب نينتندو (Nintendo Switch)",
    text: "1. من الشاشة الرئيسية، اختر System Settings > Users > Add User > Create New User.\n2. اختر Link a Nintendo Account ثم سجّل الدخول بالبريد وكلمة المرور الموضحة أعلاه.\n3. قم بزيارة Nintendo eShop وتنزيل اللعبة من قائمة Redownload.\n4. استمتع باللعبة من خلال حسابك الأساسي!",
  },
  {
    title: "طريقة تفعيل حساب بلايستيشن (PS4 / PS5)",
    text: "1. أضف مستخدم جديد على جهازك (Add User) > Get Started.\n2. أدخل بيانات الحساب (البريد وكلمة المرور).\n3. فعّل الحساب كحساب رئيسي (Enable Console Sharing and Offline Play).\n4. ابدأ تحميل الألعاب من مكتبة الألعاب Game Library.",
  },
  {
    title: "طريقة شحن واسترداد كود البطاقة الرقمية",
    text: "1. توجّه إلى متجر المنصة الرسمي (eShop / PlayStation Store / Xbox Store).\n2. اختر استرداد الكود (Redeem Code).\n3. الصق الكود المرسل إليك واضغط تأكيد وسيتم إضافة الرصيد فوراً.",
  },
  {
    title: "تنبيهات الحفاظ على ضمان الحساب",
    text: "• يرجى عدم تغيير الدولة في الحساب.\n• يرجى عدم تسجيل الدخول من أكثر من جهاز في وقت واحد.\n• في حال واجهت أي مشكلة تواصل معنا وسنخدمك فوراً.",
  },
];

export function AccountToolsModal({
  isOpen,
  onClose,
  defaultTab = "credentials",
  onSendCredentials,
  onSendVerificationCode,
  onSendInstructions,
  onSendCardCode,
}: AccountToolsModalProps) {
  const [activeTab, setActiveTab] = useState<"credentials" | "card" | "otp" | "instructions">(
    defaultTab === "card" ? "card" : defaultTab,
  );

  // Credentials State
  const [platform, setPlatform] = useState("Nintendo Switch");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [notes, setNotes] = useState("");

  // Card / Activation Key State
  const [cardType, setCardType] = useState("Nintendo eShop $50");
  const [cardCode, setCardCode] = useState("");
  const [cardPin, setCardPin] = useState("");
  const [cardInstructions, setCardInstructions] = useState("");

  // OTP State
  const [otpCode, setOtpCode] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(15);

  // Instructions State
  const [instructionTitle, setInstructionTitle] = useState(PRESET_INSTRUCTIONS[0]?.title ?? "");
  const [instructionText, setInstructionText] = useState(PRESET_INSTRUCTIONS[0]?.text ?? "");

  if (!isOpen) return null;

  const generateStrongPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
    let generated = "";
    for (let i = 0; i < 12; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
    toast.success("تم توليد كلمة مرور قوية");
  };

  const handleSendCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }
    onSendCredentials({
      platform,
      email: email.trim(),
      password: password.trim(),
      pin: pin.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  const handleSendCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardCode.trim()) {
      toast.error("يرجى إدخال كود البطاقة / التفعيل");
      return;
    }
    if (onSendCardCode) {
      onSendCardCode({
        cardType,
        code: cardCode.trim(),
        pin: cardPin.trim() || undefined,
        instructions: cardInstructions.trim() || undefined,
      });
    } else {
      onSendVerificationCode({
        code: cardCode.trim(),
      });
    }
    onClose();
  };

  const handleSendOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      toast.error("يرجى إدخال كود التحقق");
      return;
    }
    onSendVerificationCode({
      code: otpCode.trim(),
      expiresInMinutes: expiryMinutes,
    });
    onClose();
  };

  const handleSendInstructionsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructionText.trim()) {
      toast.error("يرجى كتابة نص التعليمات");
      return;
    }
    onSendInstructions({
      title: instructionTitle.trim(),
      text: instructionText.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">أدوات تسليم الحسابات والأكواد</h3>
              <p className="text-[11px] text-muted-foreground">
                تسليم فوري ومباشر لبيانات الحسابات وأكواد التفعيل للعميل
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-muted/40 p-1.5 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("credentials")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "credentials"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span>بيانات حساب</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("card")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "card"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Ticket className="w-3.5 h-3.5 text-emerald-500" />
            <span>كود بطاقة / تفعيل</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("otp")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "otp"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
            <span>كود OTP</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("instructions")}
            className={`flex-1 py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === "instructions"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-500" />
            <span>تعليمات</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 max-h-[75vh] overflow-y-auto">
          {/* TAB 1: ACCOUNT CREDENTIALS */}
          {activeTab === "credentials" && (
            <form onSubmit={handleSendCredentialsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  نوع المنصة / الحساب
                </label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground"
                >
                  <option value="Nintendo Switch">Nintendo Switch</option>
                  <option value="PlayStation 5 (PS5)">PlayStation 5 (PS5)</option>
                  <option value="PlayStation 4 (PS4)">PlayStation 4 (PS4)</option>
                  <option value="Xbox Series / One">Xbox Series / One</option>
                  <option value="Steam">Steam</option>
                  <option value="اشتراك رقمي">اشتراك رقمي (Game Pass / PS Plus)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  البريد الإلكتروني / اسم المستخدم <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    كلمة المرور <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateStrongPassword}
                    className="text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1 font-medium"
                  >
                    <Sparkles className="w-3 h-3" />
                    توليد كلمة مرور عشوائية
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="كلمة المرور الواضحة"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground font-mono font-medium"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  رمز الأمان / PIN (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="مثال: 1234"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  ملاحظات إضافية (أكواد احتياطية / تنبيهات)
                </label>
                <textarea
                  rows={2}
                  placeholder="مثال: يرجى عدم تغيير الدولة في الحساب..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground resize-none"
                />
              </div>

              {/* Preview Card (Shows exact clear text as delivered to customer) */}
              <div className="p-3.5 bg-muted/30 border border-border rounded-xl space-y-2 text-xs">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  معاينة البطاقة في المحادثة (تظهر واضحة مع أزرار نسخ)
                </div>
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>🎮 بيانات حساب {platform}</span>
                  <span className="text-[10px] bg-amber-500/15 text-amber-600 px-2 py-0.5 rounded-full font-bold">
                    حساب جديد
                  </span>
                </div>
                <div
                  className="font-mono text-muted-foreground text-xs p-2 rounded-lg bg-black/5 flex items-center justify-between"
                  dir="ltr"
                >
                  <span>{email || "user@domain.com"}</span>
                  <Copy className="w-3.5 h-3.5 opacity-50" />
                </div>
                <div
                  className="font-mono text-foreground font-semibold text-xs p-2 rounded-lg bg-black/5 flex items-center justify-between"
                  dir="ltr"
                >
                  <span>{password || "Password123!"}</span>
                  <Copy className="w-3.5 h-3.5 opacity-50" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  إرسال بيانات الحساب
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: DIGITAL CARD / ACTIVATION CODE */}
          {activeTab === "card" && (
            <form onSubmit={handleSendCardSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  نوع البطاقة / المنتج
                </label>
                <input
                  type="text"
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value)}
                  placeholder="مثال: Nintendo eShop $50 / PlayStation Plus 12M"
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  كود البطاقة / التفعيل (Key / Code) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={cardCode}
                  onChange={(e) => setCardCode(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 text-foreground font-mono font-bold tracking-wider"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  الرقم السري PIN (إن وجد)
                </label>
                <input
                  type="text"
                  placeholder="PIN إذا كانت البطاقة تتطلب رمز إضافي"
                  value={cardPin}
                  onChange={(e) => setCardPin(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground font-mono"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  تعليمات الشحن والاستخدام
                </label>
                <textarea
                  rows={2}
                  placeholder="مثال: يرجى شحن الكود في الحساب الأمريكي فقط عبر المتجر..."
                  value={cardInstructions}
                  onChange={(e) => setCardInstructions(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground resize-none"
                />
              </div>

              {/* Card Preview */}
              <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2 text-xs">
                <div className="font-bold text-emerald-600 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Ticket className="w-4 h-4" />
                    بطاقة: {cardType || "كود رقمي"}
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 px-2 py-0.5 rounded-full font-bold">
                    جاهز للاسترداد
                  </span>
                </div>
                <div
                  className="p-2.5 rounded-xl bg-black/5 font-mono text-sm font-bold tracking-widest text-foreground flex items-center justify-between"
                  dir="ltr"
                >
                  <span>{cardCode || "B16X-9988-7766-ABCD"}</span>
                  <Copy className="w-4 h-4 opacity-50" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  إرسال كود البطاقة
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: OTP VERIFICATION CODE */}
          {activeTab === "otp" && (
            <form onSubmit={handleSendOtpSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  كود التحقق (OTP) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="123 456"
                  maxLength={12}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full px-4 py-3 text-center text-xl font-mono tracking-widest bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 text-foreground font-bold"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  مدة الصلاحية التقديرية
                </label>
                <select
                  value={expiryMinutes}
                  onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground"
                >
                  <option value={5}>5 دقائق</option>
                  <option value={10}>10 دقائق</option>
                  <option value={15}>15 دقيقة</option>
                  <option value={30}>30 دقيقة</option>
                  <option value={60}>ساعة واحدة</option>
                </select>
              </div>

              <div className="p-3.5 bg-blue-500/5 border border-blue-500/20 rounded-xl text-xs space-y-1">
                <div className="font-bold text-blue-600 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  بطاقة كود التحقق
                </div>
                <p className="text-muted-foreground text-[11px]">
                  سيتم إرسال الكود كبطاقة واضحة مع زر نسخ مباشر للعميل وتنبيه بمدة الصلاحية (
                  {expiryMinutes} دقيقة).
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  إرسال كود التحقق
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: INSTRUCTIONS */}
          {activeTab === "instructions" && (
            <form onSubmit={handleSendInstructionsSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  قوالب إرشادات جاهزة
                </label>
                <select
                  onChange={(e) => {
                    const selected = PRESET_INSTRUCTIONS.find((i) => i.title === e.target.value);
                    if (selected) {
                      setInstructionTitle(selected.title);
                      setInstructionText(selected.text);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground"
                >
                  {PRESET_INSTRUCTIONS.map((item, idx) => (
                    <option key={idx} value={item.title}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  عنوان التعليمات
                </label>
                <input
                  type="text"
                  value={instructionTitle}
                  onChange={(e) => setInstructionTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  تفاصيل الخطوات والتعليمات <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={6}
                  required
                  value={instructionText}
                  onChange={(e) => setInstructionText(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 text-foreground font-sans leading-relaxed"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  إرسال التعليمات
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
