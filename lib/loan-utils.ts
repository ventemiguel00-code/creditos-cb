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
