import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Edit, Check, X, Tag } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { Coupon } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

export default function CouponsManager() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Coupon>>({
    code: "",
    discountType: "percentage",
    discountValue: 10,
    perUserLimit: 1,
    minOrderAmount: 0,
    isActive: true,
    onlyDigitalProducts: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => adminApi.getCoupons(),
  });

  const createMutation = useMutation({
    mutationFn: () => adminApi.createCoupon(form),
    onSuccess: () => {
      toast.success("تم إضافة الكوبون بنجاح");
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setIsAdding(false);
    },
    onError: () => toast.error("حدث خطأ أثناء الإضافة"),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Coupon>) => adminApi.updateCoupon(data),
    onSuccess: () => {
      toast.success("تم تحديث الكوبون بنجاح");
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setEditingId(null);
    },
    onError: () => toast.error("حدث خطأ أثناء التحديث"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCoupon(id),
    onSuccess: () => {
      toast.success("تم حذف الكوبون بنجاح");
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: () => toast.error("حدث خطأ أثناء الحذف"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ ...form, id: editingId });
    } else {
      createMutation.mutate();
    }
  };

  const openEdit = (coupon: Coupon) => {
    setForm(coupon);
    setEditingId(coupon.id);
    setIsAdding(true);
  };

  if (isLoading) return <div className="p-8 text-center">جاري التحميل...</div>;

  const coupons = data?.coupons || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Tag className="w-6 h-6 text-brand-blue" />
            إدارة الكوبونات
          </h2>
          <p className="text-sm text-muted-foreground mt-1">قم بإنشاء وتعديل أكواد الخصم</p>
        </div>
        <Dialog open={isAdding} onOpenChange={(open) => {
          setIsAdding(open);
          if (!open) {
            setEditingId(null);
            setForm({
              code: "", discountType: "percentage", discountValue: 10,
              perUserLimit: 1, minOrderAmount: 0, isActive: true, onlyDigitalProducts: false
            });
          }
        }}>
          <DialogTrigger asChild>
            <button className="flex items-center gap-2 bg-brand-blue hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-500/20">
              <Plus className="w-4 h-4" />
              إضافة كوبون جديد
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editingId ? "تعديل الكوبون" : "إضافة كوبون جديد"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">كود الخصم</label>
                  <input
                    required
                    type="text"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm uppercase"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">نوع الخصم</label>
                  <select
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.discountType}
                    onChange={(e) => setForm({ ...form, discountType: e.target.value as any })}
                  >
                    <option value="percentage">نسبة مئوية (%)</option>
                    <option value="fixed">مبلغ ثابت (د.ع)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">قيمة الخصم</label>
                  <input
                    required
                    type="number"
                    min="1"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.discountValue}
                    onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">أقصى مبلغ للخصم (اختياري)</label>
                  <input
                    type="number"
                    min="0"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.maxDiscountAmount || ""}
                    onChange={(e) => setForm({ ...form, maxDiscountAmount: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">الحد الأدنى للطلب (د.ع)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.minOrderAmount}
                    onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">الحد الأقصى للاستخدام لكل مستخدم</label>
                  <input
                    required
                    type="number"
                    min="1"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.perUserLimit}
                    onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-muted-foreground">الحد الأقصى الإجمالي (اختياري)</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                    value={form.usageLimit || ""}
                    onChange={(e) => setForm({ ...form, usageLimit: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-brand-blue"
                    checked={form.onlyDigitalProducts}
                    onChange={(e) => setForm({ ...form, onlyDigitalProducts: e.target.checked })}
                  />
                  <span className="text-sm font-bold text-foreground">خصم للمنتجات الرقمية فقط</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-brand-blue"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  <span className="text-sm font-bold text-foreground">تفعيل الكوبون</span>
                </label>
              </div>

              <DialogFooter className="pt-4">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-brand-blue hover:bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                >
                  حفظ الكوبون
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-bold text-muted-foreground">الكود</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">الخصم</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">الاستخدام</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">شروط</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">الحالة</th>
                <th className="px-4 py-3 font-bold text-muted-foreground">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {coupons.map((coupon: any) => (
                <tr key={coupon.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-bold uppercase">{coupon.code}</td>
                  <td className="px-4 py-3">
                    {coupon.discount_type === "percentage" || coupon.discountType === "percentage" 
                      ? `%${coupon.discount_value || coupon.discountValue}` 
                      : `${(coupon.discount_value || coupon.discountValue).toLocaleString("en-US")} د.ع`}
                  </td>
                  <td className="px-4 py-3">
                    لكل مستخدم: {coupon.per_user_limit || coupon.perUserLimit}
                    {coupon.usage_limit || coupon.usageLimit ? ` / كلي: ${coupon.usage_limit || coupon.usageLimit}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {(coupon.only_digital_products || coupon.onlyDigitalProducts) && <span className="block text-blue-500">للرقمية فقط</span>}
                    {(coupon.min_order_amount || coupon.minOrderAmount) > 0 && <span className="block">حد أدنى {(coupon.min_order_amount || coupon.minOrderAmount).toLocaleString()}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {(coupon.is_active || coupon.isActive) ? (
                      <span className="text-green-500 bg-green-500/10 px-2 py-1 rounded-lg text-xs font-bold">فعال</span>
                    ) : (
                      <span className="text-red-500 bg-red-500/10 px-2 py-1 rounded-lg text-xs font-bold">معطل</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit({
                        ...coupon,
                        discountType: coupon.discount_type || coupon.discountType,
                        discountValue: coupon.discount_value || coupon.discountValue,
                        perUserLimit: coupon.per_user_limit || coupon.perUserLimit,
                        minOrderAmount: coupon.min_order_amount || coupon.minOrderAmount,
                        isActive: coupon.is_active === undefined ? coupon.isActive : coupon.is_active,
                        onlyDigitalProducts: coupon.only_digital_products === undefined ? coupon.onlyDigitalProducts : coupon.only_digital_products,
                        maxDiscountAmount: coupon.max_discount_amount || coupon.maxDiscountAmount,
                        usageLimit: coupon.usage_limit || coupon.usageLimit,
                      })} className="text-blue-500 hover:text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 p-2 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => {
                        if (confirm("هل أنت متأكد من حذف هذا الكوبون؟")) {
                          deleteMutation.mutate(coupon.id);
                        }
                      }} className="text-red-500 hover:text-red-600 bg-red-500/10 hover:bg-red-500/20 p-2 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    لا يوجد كوبونات مضافة بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
