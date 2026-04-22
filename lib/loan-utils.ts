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
export type PaymentEntry = {
  cuotaNumero: number;
  monto: number;
  aplicadoPrestamo?: number;
  moraPagada?: number;
  createdAt?: string | null;
};

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

export function getLoanPaymentSnapshot({
  createdAt,
  frecuenciaPago,
  numeroCuotas,
  valorCuota,
  totalCobrar,
  pagos,
  moraDiariaPorcentaje,
}: {
  createdAt?: string | null;
  frecuenciaPago: LoanFrequency;
  numeroCuotas: number;
  valorCuota: number;
  totalCobrar: number;
  pagos: PaymentEntry[];
  moraDiariaPorcentaje: number;
}) {
  const totalsByInstallment = new Map<number, number>();
  const appliedByInstallment = new Map<number, number>();
  const lateFeeByInstallment = new Map<number, number>();

  pagos.forEach((pago) => {
    const cuotaNumero = Math.max(1, Math.round(Number(pago.cuotaNumero || 1)));
    const currentTotal = totalsByInstallment.get(cuotaNumero) ?? 0;
    totalsByInstallment.set(cuotaNumero, roundCurrency(currentTotal + Number(pago.monto || 0)));

    const currentApplied = appliedByInstallment.get(cuotaNumero) ?? 0;
    const nextApplied = Number(
      pago.aplicadoPrestamo ?? Math.min(Number(pago.monto || 0), valorCuota),
    );
    appliedByInstallment.set(cuotaNumero, roundCurrency(currentApplied + nextApplied));

    const currentLateFee = lateFeeByInstallment.get(cuotaNumero) ?? 0;
    const nextLateFee = Number(
      pago.moraPagada ?? Math.max(Number(pago.monto || 0) - nextApplied, 0),
    );
    lateFeeByInstallment.set(cuotaNumero, roundCurrency(currentLateFee + nextLateFee));
  });

  let totalAplicadoPrestamo = 0;
  let totalCobrado = 0;
  let totalCobradoMora = 0;
  let cuotasPagadas = 0;

  for (let cuota = 1; cuota <= numeroCuotas; cuota += 1) {
    const totalCuota = totalsByInstallment.get(cuota) ?? 0;
    const aplicadoPrestamo = Math.min(appliedByInstallment.get(cuota) ?? totalCuota, valorCuota);
    const cobradoMora = lateFeeByInstallment.get(cuota) ?? Math.max(totalCuota - valorCuota, 0);

    totalCobrado = roundCurrency(totalCobrado + totalCuota);
    totalAplicadoPrestamo = roundCurrency(totalAplicadoPrestamo + aplicadoPrestamo);
    totalCobradoMora = roundCurrency(totalCobradoMora + cobradoMora);

    if (aplicadoPrestamo + 0.0001 >= valorCuota) {
      cuotasPagadas += 1;
      continue;
    }

    break;
  }

  const cuotaActual = Math.min(cuotasPagadas + 1, numeroCuotas);
  const aplicadoCuotaActual = Math.min(
    appliedByInstallment.get(cuotaActual) ?? totalsByInstallment.get(cuotaActual) ?? 0,
    valorCuota,
  );
  const saldoCuotaActual = cuotasPagadas >= numeroCuotas
    ? 0
    : roundCurrency(Math.max(valorCuota - aplicadoCuotaActual, 0));

  const overdueInfo = getLoanOverdueInfo({
    createdAt,
    frecuenciaPago,
    cuotasPagadas,
    saldoRestante: Math.max(totalCobrar - totalAplicadoPrestamo, 0),
  });
  const moraPendiente =
    saldoCuotaActual > 0 && overdueInfo.isOverdue
      ? roundCurrency((saldoCuotaActual * moraDiariaPorcentaje * overdueInfo.overdueDays) / 100)
      : 0;

  return {
    cuotasPagadas,
    cuotaActual,
    saldoCuotaActual,
    moraPendiente,
    diasMora: overdueInfo.overdueDays,
    dueDate: overdueInfo.dueDate,
    isOverdue: overdueInfo.isOverdue,
    totalAplicadoPrestamo: Math.min(roundCurrency(totalAplicadoPrestamo), totalCobrar),
    totalCobrado,
    totalCobradoMora,
  };
}
