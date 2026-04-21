export function calculateLoanValues(
  capital: number,
  installmentCount: number,
  interestRatePercent: number,
) {
  const totalToCollect = roundCurrency(capital * (1 + interestRatePercent / 100));
  const installmentValue = roundCurrency(totalToCollect / installmentCount);

  return {
    capital,
    installmentCount,
    interestRatePercent,
    totalToCollect,
    installmentValue,
  };
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortDate(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export type LoanFrequency = "diaria" | "semanal" | "quincenal" | "mensual";

function getStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addInstallmentInterval(date: Date, frequency: LoanFrequency, count: number) {
  const nextDate = new Date(date);

  if (frequency === "diaria") {
    nextDate.setDate(nextDate.getDate() + count);
    return nextDate;
  }

  if (frequency === "semanal") {
    nextDate.setDate(nextDate.getDate() + count * 7);
    return nextDate;
  }

  if (frequency === "quincenal") {
    nextDate.setDate(nextDate.getDate() + count * 15);
    return nextDate;
  }

  nextDate.setMonth(nextDate.getMonth() + count);
  return nextDate;
}

export function getLoanOverdueInfo({
  createdAt,
  frecuenciaPago,
  cuotasPagadas,
  saldoRestante,
}: {
  createdAt?: string | null;
  frecuenciaPago: LoanFrequency;
  cuotasPagadas: number;
  saldoRestante: number;
}) {
  if (!createdAt || saldoRestante <= 0) {
    return {
      isOverdue: false,
      overdueDays: 0,
      dueDate: null as Date | null,
    };
  }

  const startDate = new Date(createdAt);

  if (Number.isNaN(startDate.getTime())) {
    return {
      isOverdue: false,
      overdueDays: 0,
      dueDate: null as Date | null,
    };
  }

  const dueDate = getStartOfDay(addInstallmentInterval(startDate, frecuenciaPago, cuotasPagadas));
  const today = getStartOfDay(new Date());
  const diffMs = today.getTime() - dueDate.getTime();
  const overdueDays = diffMs > 0 ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;

  return {
    isOverdue: overdueDays > 0,
    overdueDays,
    dueDate,
  };
}
