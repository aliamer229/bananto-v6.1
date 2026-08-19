// Single source of truth for availability types lives in `@/lib/types`.
import type {
  AdminAvailabilityConfig,
  AdminAvailabilityMode,
  AdminAvailabilityStatus,
} from "@/lib/types";

export type { AdminAvailabilityConfig, AdminAvailabilityMode, AdminAvailabilityStatus };

/** Legacy alias kept for callers that named the computed result `Result`. */
export type AdminAvailabilityResult = AdminAvailabilityStatus;

/** Weekday index (0 = Sunday) to Arabic label. */
export const DAYS_MAP: Record<number, string> = {
  0: "الأحد",
  1: "الإثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
  6: "السبت",
};

export const DEFAULT_AVAILABILITY_CONFIG: AdminAvailabilityConfig = {
  mode: "schedule",
  startHour: 10,
  startMinute: 0,
  endHour: 24,
  endMinute: 0,
  workDays: [0, 1, 2, 3, 4, 5, 6],
  timezone: "Asia/Baghdad",
  offlineMessage: "",
};

export function formatTimeAr(hour: number, minute: number = 0): string {
  const period = hour >= 12 && hour < 24 ? "مساءً" : "صباحاً";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mStr = minute > 0 ? `:${minute.toString().padStart(2, "0")}` : "";
  return `${h12}${mStr} ${period}`;
}

export function checkAdminAvailability(config?: Partial<AdminAvailabilityConfig>): {
  isAvailable: boolean;
  status: "available" | "unavailable" | "schedule";
  workingHoursText: string;
  offlineMessage: string;
  currentBaghdadTime: string;
} {
  const mode = config?.mode ?? DEFAULT_AVAILABILITY_CONFIG.mode;
  const startHour = config?.startHour ?? DEFAULT_AVAILABILITY_CONFIG.startHour;
  const startMinute = config?.startMinute ?? 0;
  const endHour = config?.endHour ?? DEFAULT_AVAILABILITY_CONFIG.endHour;
  const endMinute = config?.endMinute ?? 0;
  const workDays = config?.workDays ??
    DEFAULT_AVAILABILITY_CONFIG.workDays ?? [0, 1, 2, 3, 4, 5, 6];

  const workingHoursText = `من ${formatTimeAr(startHour, startMinute)} إلى ${formatTimeAr(endHour, endMinute)} (بتوقيت بغداد)`;
  const defaultOffline = `فريق الدعم غير متاح حالياً. ساعات العمل: ${workingHoursText}. يمكنك استخدام المساعد الآلي الآن، أو العودة خلال ساعات العمل.`;
  const offlineMessage =
    config?.offlineMessage && config.offlineMessage.trim().length > 0
      ? config.offlineMessage.trim()
      : defaultOffline;

  // Compute current Baghdad time string
  let currentBaghdadTime = "";
  let baghdadHour = 12;
  let baghdadMinute = 0;
  let baghdadDay = 0;

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Baghdad",
      hour12: false,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
    });
    const parts = formatter.formatToParts(now);
    let weekdayStr = "";
    for (const p of parts) {
      if (p.type === "hour") baghdadHour = parseInt(p.value, 10);
      if (p.type === "minute") baghdadMinute = parseInt(p.value, 10);
      if (p.type === "weekday") weekdayStr = p.value;
    }
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    baghdadDay = dayMap[weekdayStr] ?? now.getDay();
    currentBaghdadTime = formatTimeAr(baghdadHour, baghdadMinute);
  } catch {
    currentBaghdadTime = "توقيت بغداد";
  }

  if (mode === "available") {
    return {
      isAvailable: true,
      status: "available",
      workingHoursText,
      offlineMessage,
      currentBaghdadTime,
    };
  }

  if (mode === "unavailable") {
    return {
      isAvailable: false,
      status: "unavailable",
      workingHoursText,
      offlineMessage,
      currentBaghdadTime,
    };
  }

  // mode === "schedule"
  if (!workDays.includes(baghdadDay)) {
    return {
      isAvailable: false,
      status: "schedule",
      workingHoursText,
      offlineMessage,
      currentBaghdadTime,
    };
  }

  const currentMinutes = baghdadHour * 60 + baghdadMinute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  let inRange = false;
  if (startMinutes < endMinutes) {
    inRange = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Spans past midnight (e.g. 10:00 to 02:00)
    inRange = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return {
    isAvailable: inRange,
    status: "schedule",
    workingHoursText,
    offlineMessage,
    currentBaghdadTime,
  };
}
