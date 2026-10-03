import { Prisma } from "@prisma/client";

export const BUSINESS_TIMEZONE = "Asia/Jakarta";

export function calendarDateKey(
  date: Date,
  timeZone = BUSINESS_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function startOfDay(date: Date) {
  return new Date(`${calendarDateKey(date)}T00:00:00.000Z`);
}

export function startOfBusinessInstant(date: Date) {
  return new Date(`${calendarDateKey(date)}T00:00:00+07:00`);
}

export function endOfBusinessInstant(date: Date) {
  return new Date(`${calendarDateKey(date)}T23:59:59.999+07:00`);
}

export function addDays(date: Date, days: number) {
  const result = startOfDay(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isPastDue(dueDate?: Date | null, today = new Date()) {
  return Boolean(dueDate && startOfDay(dueDate) < startOfDay(today));
}

export function isPaymentInFlight(payment?: {
  status: string;
  amount?: Prisma.Decimal | number | string | null;
  expiredAt?: Date | null;
} | null) {
  if (payment?.status !== "PENDING") {
    return false;
  }

  if (!payment.expiredAt) {
    return true;
  }

  return payment.expiredAt.getTime() > Date.now();
}

export function getOverdueDays(dueDate: Date, graceDays: number, today: Date) {
  const deadline = addDays(startOfDay(dueDate), graceDays);
  const todayDate = startOfDay(today);

  if (todayDate <= deadline) {
    return 0;
  }

  return Math.round(
    (todayDate.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function calculateLateFee(
  billAmount: Prisma.Decimal,
  setting: {
    lateFeeType: "FIXED" | "PERCENTAGE";
    lateFeeAmount: Prisma.Decimal | number | string;
  },
  overdueDays: number,
) {
  const dailyFee =
    setting.lateFeeType === "PERCENTAGE"
      ? new Prisma.Decimal(billAmount)
          .mul(setting.lateFeeAmount)
          .div(100)
          .toDecimalPlaces(2)
      : new Prisma.Decimal(setting.lateFeeAmount);

  return dailyFee.mul(overdueDays);
}

export function resolveLateFeeAmount(input: {
  dueDate?: Date | null;
  amount: Prisma.Decimal;
  currentLateFee?: Prisma.Decimal | number | string | null;
  payment?: {
    status: string;
    amount?: Prisma.Decimal | number | string | null;
    expiredAt?: Date | null;
  } | null;
  setting?: {
    lateFeeEnabled: boolean;
    lateFeeType: "FIXED" | "PERCENTAGE";
    lateFeeAmount: Prisma.Decimal | number | string;
    lateFeeGraceDays: number;
  } | null;
  today?: Date;
}) {
  const today = startOfDay(input.today ?? new Date());
  const currentLateFee = new Prisma.Decimal(input.currentLateFee ?? 0);

  if (!input.dueDate || !input.setting?.lateFeeEnabled) {
    return currentLateFee;
  }

  const overdueDays = getOverdueDays(
    input.dueDate,
    input.setting.lateFeeGraceDays,
    today,
  );

  if (overdueDays <= 0) {
    return currentLateFee;
  }

  const nextLateFee = calculateLateFee(
    input.amount,
    input.setting,
    overdueDays,
  );
  const nextPayable = new Prisma.Decimal(input.amount).add(nextLateFee);

  if (
    isPaymentInFlight(input.payment) &&
    input.payment?.amount != null &&
    new Prisma.Decimal(input.payment.amount).eq(nextPayable)
  ) {
    return currentLateFee;
  }

  return nextLateFee;
}
