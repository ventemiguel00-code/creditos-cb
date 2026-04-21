"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useDeferredValue,
  useEffect,
  useState,
  useTransition,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  calculateLoanValues,
  formatCurrency,
  formatDate,
  roundCurrency,
} from "@/lib/loan-utils";

type Cliente = {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  correo: string;
  fotoUrl: string;
  createdAt: string;
};

type Prestamo = {
  id: string;
  clienteId: string;
  montoCapital: number;
  numeroCuotas: number;
  frecuenciaPago: PaymentFrequency;
  porcentajeInteres: number;
  totalCobrar: number;
  valorCuota: number;
  saldoRestante: number;
  cuotasPagadas: number;
  estado: string;
  createdAt: string;
};

type Pago = {
  id: string;
  prestamoId: string;
  clienteId: string;
  monto: number;
  cuotaNumero: number;
  createdAt: string;
};

type ReceiptData = {
  cliente: Cliente;
  prestamo: Prestamo;
  pago: Pago;
};

type LoanEditForm = {
  prestamoId: string;
  clienteId: string;
  montoCapital: string;
  numeroCuotas: string;
  frecuenciaPago: PaymentFrequency;
  estado: string;
};

type PaymentFrequency = "diaria" | "semanal" | "quincenal" | "mensual";

type LoanMetadata = Record<
  string,
  {
    frecuenciaPago: PaymentFrequency;
  }
>;

type ProfitPeriod = "diario" | "semanal" | "quincenal" | "mensual";

const INITIAL_CAPITAL_KEY = "creditos-cb-initial-capital";
const LAST_CLEANUP_RUN_KEY = "creditos-cb-last-cleanup-run";
const LOAN_METADATA_KEY = "creditos-cb-loan-metadata";
const PROFIT_DISTRIBUTION_KEY = "creditos-cb-profit-distribution";
const APP_CONFIG_TABLE = "configuracion_app";
const APP_CONFIG_ROW_ID = "principal";
const SUPABASE_LOGIN_EMAIL = process.env.NEXT_PUBLIC_SUPABASE_LOGIN_EMAIL ?? "";
const SUPABASE_LOGIN_PASSWORD =
  process.env.NEXT_PUBLIC_SUPABASE_LOGIN_PASSWORD ?? "12345678";
const BRAND_NAME = "Creditos CB";
const BUSINESS_PHONE = "3122398133";
const PAYMENT_FREQUENCIES: PaymentFrequency[] = [
  "diaria",
  "semanal",
  "quincenal",
  "mensual",
];
const CLOSED_PERCENTAGE_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function mapCliente(row: Record<string, unknown>): Cliente {
  return {
    id: String(row.id ?? ""),
    nombre: String(row.nombre ?? ""),
    direccion: String(row.direccion ?? ""),
    telefono: String(row.telefono ?? ""),
    correo: String(row.correo ?? row.email ?? ""),
    fotoUrl: String(row.foto_url ?? row.foto ?? ""),
    createdAt: String(
      row.fecha_registro ??
        row.created_at ??
        row.fecha_creacion ??
        row.fecha ??
        row.createdAt ??
        new Date().toISOString(),
    ),
  };
}

function normalizePaymentFrequency(value: unknown): PaymentFrequency {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "diaria" || normalized === "diario") {
    return "diaria";
  }

  if (normalized === "semanal" || normalized === "semana") {
    return "semanal";
  }

  if (normalized === "quincenal" || normalized === "15nal" || normalized === "quince") {
    return "quincenal";
  }

  if (normalized === "mensual" || normalized === "mes") {
    return "mensual";
  }

  return "diaria";
}

function normalizeClosedPercentage(value: unknown) {
  const parsed = Number(value ?? 0);

  if (CLOSED_PERCENTAGE_OPTIONS.includes(parsed)) {
    return parsed;
  }

  if (parsed <= 10) {
    return 10;
  }

  if (parsed >= 100) {
    return 100;
  }

  const nearest = CLOSED_PERCENTAGE_OPTIONS.reduce((current, option) =>
    Math.abs(option - parsed) < Math.abs(current - parsed) ? option : current,
  );

  return nearest;
}

function normalizeIntegerPercentage(value: unknown) {
  const parsed = Math.round(Number(value ?? 0));

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.min(Math.max(parsed, 0), 100);
}

function readLoanMetadata(): LoanMetadata {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LOAN_METADATA_KEY);

    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as LoanMetadata;
  } catch {
    return {};
  }
}

function saveLoanMetadata(metadata: LoanMetadata) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOAN_METADATA_KEY, JSON.stringify(metadata));
}

function readProfitDistribution() {
  if (typeof window === "undefined") {
    return {
      empresaPorcentaje: "50",
      personalPorcentaje: "50",
    };
  }

  try {
    const raw = window.localStorage.getItem(PROFIT_DISTRIBUTION_KEY);

    if (!raw) {
      return {
        empresaPorcentaje: "50",
        personalPorcentaje: "50",
      };
    }

    const parsed = JSON.parse(raw) as {
      empresaPorcentaje?: string;
      personalPorcentaje?: string;
    };

    const empresa = normalizeClosedPercentage(parsed.empresaPorcentaje ?? "50");

    return {
      empresaPorcentaje: String(empresa),
      personalPorcentaje: String(100 - empresa),
    };
  } catch {
    return {
      empresaPorcentaje: "50",
      personalPorcentaje: "50",
    };
  }
}

function mapPrestamo(row: Record<string, unknown>): Prestamo {
  const totalCobrar = Number(row.total_a_pagar ?? row.total_cobrar ?? row.total ?? 0);
  const montoCapital = Number(row.monto_prestado ?? row.monto_capital ?? row.capital ?? 0);
  const porcentajeInteres = Number(
    row.porcentaje_interes ??
      row.interes_porcentaje ??
      (montoCapital > 0 ? ((totalCobrar - montoCapital) / montoCapital) * 100 : 20),
  );

  return {
    id: String(row.id ?? ""),
    clienteId: String(row.cliente_id ?? ""),
    montoCapital,
    numeroCuotas: Number(row.numero_cuotas ?? row.cuotas ?? 0),
    frecuenciaPago: normalizePaymentFrequency(
      row.frecuencia_pago ?? row.frecuencia ?? row.modalidad_pago ?? row.tipo_cobro,
    ),
    porcentajeInteres: roundCurrency(porcentajeInteres),
    totalCobrar,
    valorCuota: Number(row.valor_cuota ?? row.cuota_valor ?? 0),
    saldoRestante: totalCobrar,
    cuotasPagadas: 0,
    estado: String(row.estado ?? (totalCobrar <= 0 ? "pagado" : "activo")),
    createdAt: String(
      row.fecha_inicio ??
        row.created_at ??
        row.fecha_creacion ??
        row.fecha ??
        row.createdAt ??
        new Date().toISOString(),
    ),
  };
}

function mapPago(row: Record<string, unknown>): Pago {
  return {
    id: String(row.id ?? ""),
    prestamoId: String(row.prestamo_id ?? ""),
    clienteId: String(row.cliente_id ?? ""),
    monto: Number(row.monto_pagado ?? row.monto ?? row.valor_pago ?? 0),
    cuotaNumero: Number(row.cuota_numero ?? row.cuota_numero ?? row.numero_cuota ?? 0),
    createdAt: String(
      row.fecha_pago ??
      row.created_at ??
        row.fecha_creacion ??
        row.fecha ??
        row.createdAt ??
        new Date().toISOString(),
    ),
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
    };

    const parts = [
      typeof candidate.message === "string" ? candidate.message : "",
      typeof candidate.details === "string" ? candidate.details : "",
      typeof candidate.hint === "string" ? candidate.hint : "",
      typeof candidate.error_description === "string" ? candidate.error_description : "",
      typeof candidate.code === "string" ? `Codigo: ${candidate.code}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(" | ");
    }
  }

  return "Ocurrio un error inesperado.";
}

function isSchemaColumnError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("column") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find") ||
    normalized.includes("does not exist") ||
    normalized.includes("no existe")
  );
}

function getLoanStatusLabel(prestamo: Prestamo) {
  return prestamo.saldoRestante <= 0 ? "Pago de prestamo completado" : "Al dia";
}

function getPaymentFrequencyLabel(frecuenciaPago: PaymentFrequency) {
  switch (frecuenciaPago) {
    case "diaria":
      return "Diaria";
    case "semanal":
      return "Semanal";
    case "quincenal":
      return "Quincenal";
    case "mensual":
      return "Mensual";
    default:
      return "Diaria";
  }
}

function isPaymentInsidePeriod(dateValue: string, period: ProfitPeriod) {
  const today = new Date();
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (period === "diario") {
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  const diffMs = today.getTime() - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;

  if (period === "semanal") {
    return diffMs <= dayMs * 7;
  }

  if (period === "quincenal") {
    return diffMs <= dayMs * 15;
  }

  return diffMs <= dayMs * 30;
}

function getPeriodLabel(period: ProfitPeriod) {
  switch (period) {
    case "diario":
      return "hoy";
    case "semanal":
      return "ultimos 7 dias";
    case "quincenal":
      return "ultimos 15 dias";
    case "mensual":
      return "ultimos 30 dias";
    default:
      return "periodo";
  }
}

function formatReceiptField(value: string | number | null | undefined) {
  const normalized = typeof value === "string" ? value.trim() : value;

  if (normalized === "" || normalized === null || normalized === undefined) {
    return "--";
  }

  return String(normalized);
}

function buildReceiptWindowHtml({
  receiptData,
  totalPagado,
  saldoEnCuotas,
  creditosEnDia,
  atrasos,
  logoUrl,
}: {
  receiptData: ReceiptData;
  totalPagado: number;
  saldoEnCuotas: number;
  creditosEnDia: string;
  atrasos: string;
  logoUrl: string;
}) {
  const clientPhotoBlock = receiptData.cliente.fotoUrl
    ? `
      <div class="client-photo-row">
        <img src="${receiptData.cliente.fotoUrl}" alt="${receiptData.cliente.nombre}" class="client-photo" />
        <p>Foto del cliente incluida como soporte de este recibo.</p>
      </div>
    `
    : "";

  return `<!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Recibo ${receiptData.cliente.nombre}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 24px;
          font-family: Arial, Helvetica, sans-serif;
          background: #f5f7fb;
          color: #15213a;
        }
        .sheet {
          max-width: 860px;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #d9e1ec;
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 20px 40px rgba(21, 33, 58, 0.12);
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-bottom: 16px;
        }
        .actions button {
          border: 0;
          border-radius: 14px;
          padding: 12px 18px;
          font-weight: 700;
          cursor: pointer;
        }
        .print-btn { background: #15803d; color: white; }
        .close-btn { background: #e5e7eb; color: #111827; }
        .receipt {
          overflow: hidden;
          border: 1px solid #cbd5e1;
          border-radius: 20px;
        }
        .logo-box {
          border-bottom: 1px solid #cbd5e1;
          background: white;
          padding: 12px;
          text-align: center;
        }
        .logo-wrap {
          overflow: hidden;
          border: 1px solid #bef264;
          border-radius: 12px;
          background: white;
          padding: 4px;
        }
        .logo {
          display: block;
          width: 100%;
          height: 170px;
          object-fit: contain;
          transform: scale(1.8);
        }
        .subtitle {
          margin: 8px 0 0;
          color: #64748b;
          font-size: 12px;
          letter-spacing: 0.24em;
          text-transform: uppercase;
        }
        .row, .grid-2 {
          display: grid;
          border-bottom: 1px solid #cbd5e1;
        }
        .row { grid-template-columns: 1fr; }
        .grid-2 { grid-template-columns: 1fr 1fr; }
        .cell {
          padding: 10px 12px;
          font-size: 14px;
          color: #334155;
        }
        .grid-2 .cell:first-child {
          border-right: 1px solid #cbd5e1;
        }
        .section-title {
          padding: 10px 12px;
          border-bottom: 1px solid #cbd5e1;
          background: #f8fafc;
          text-align: center;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #0f172a;
        }
        .section-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .section-grid > div:first-child {
          border-right: 1px solid #cbd5e1;
        }
        .line {
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 14px;
          color: #334155;
        }
        .line:last-child { border-bottom: 0; }
        .label {
          font-weight: 800;
          color: #0f172a;
        }
        .whatsapp {
          text-align: center;
          font-size: 28px;
          font-weight: 900;
          color: #15803d;
          padding: 14px 12px;
        }
        .client-photo-row {
          margin-top: 16px;
          border: 1px dashed #cbd5e1;
          border-radius: 16px;
          background: #f8fafc;
          padding: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-size: 14px;
          color: #475569;
        }
        .client-photo {
          width: 60px;
          height: 60px;
          border-radius: 999px;
          object-fit: cover;
          border: 4px solid #dcfce7;
        }
        .footer {
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px dashed #cbd5e1;
          text-align: center;
          font-size: 12px;
          color: #64748b;
        }
        @media print {
          body { background: white; padding: 0; }
          .sheet { box-shadow: none; border: 0; border-radius: 0; max-width: none; padding: 0; }
          .actions { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="actions">
          <button class="print-btn" onclick="window.print()">Imprimir</button>
          <button class="close-btn" onclick="window.close()">Cerrar</button>
        </div>
        <div class="receipt">
          <div class="logo-box">
            <div class="logo-wrap">
              <img src="${logoUrl}" alt="${BRAND_NAME}" class="logo" />
            </div>
            <p class="subtitle">Recibo de pago</p>
          </div>
          <div class="row">
            <div class="cell"><span class="label">Fecha:</span> ${formatDate(receiptData.pago.createdAt)}</div>
          </div>
          <div class="row">
            <div class="cell"><span class="label">Valor cuota:</span> ${formatCurrency(receiptData.prestamo.valorCuota)}</div>
          </div>
          <div class="section-grid">
            <div>
              <div class="section-title">Datos cliente</div>
              <div class="line"><span class="label">Nombre:</span> ${formatReceiptField(receiptData.cliente.nombre)}</div>
              <div class="line"><span class="label">Direccion:</span> ${formatReceiptField(receiptData.cliente.direccion)}</div>
            </div>
            <div>
              <div class="section-title">Extracto de manejo</div>
              <div class="line"><span class="label">N de cuotas:</span> ${receiptData.prestamo.numeroCuotas}</div>
              <div class="line"><span class="label">Saldo en cuotas:</span> ${saldoEnCuotas}</div>
              <div class="line"><span class="label">Creditos en dias:</span> ${creditosEnDia}</div>
            </div>
          </div>
          <div class="section-grid">
            <div>
              <div class="section-title">Prestamo</div>
              <div class="line"><span class="label">Ultimo pago:</span> ${formatCurrency(receiptData.pago.monto)}</div>
              <div class="line"><span class="label">Total pagado:</span> ${formatCurrency(totalPagado)}</div>
              <div class="line"><span class="label">Fecha de pago:</span> ${formatDate(receiptData.pago.createdAt)}</div>
              <div class="line"><span class="label">Saldo actual:</span> ${formatCurrency(Math.max(receiptData.prestamo.saldoRestante, 0))}</div>
            </div>
            <div>
              <div class="section-title">Control</div>
              <div class="line"><span class="label">Atrasos:</span> ${atrasos}</div>
              <div class="line"><span class="label">Dominical:</span> --</div>
              <div class="line"><span class="label">Telefono:</span> ${formatReceiptField(receiptData.cliente.telefono)}</div>
              <div class="whatsapp">WhatsApp ${BUSINESS_PHONE}</div>
            </div>
          </div>
        </div>
        ${clientPhotoBlock}
        <p class="footer">Gracias por su pago. Conserve este recibo como soporte.</p>
      </div>
    </body>
  </html>`;
}

async function selectTableData(table: "clientes" | "prestamos" | "pagos") {
  const timestampColumns =
    table === "clientes"
      ? ["fecha_registro", "created_at", "fecha_creacion", "fecha"]
      : table === "prestamos"
        ? ["fecha_inicio", "created_at", "fecha_creacion", "fecha"]
        : ["fecha_pago", "created_at", "fecha_creacion", "fecha"];

  for (const column of timestampColumns) {
    const response = await supabase.from(table).select("*").order(column, { ascending: false });

    if (!response.error) {
      return response;
    }

    if (!isSchemaColumnError(response.error.message)) {
      return response;
    }
  }

  return supabase.from(table).select("*");
}

async function loadInitialCapitalValue() {
  const localFallback =
    typeof window === "undefined"
      ? 0
      : Math.max(Number(window.localStorage.getItem(INITIAL_CAPITAL_KEY) ?? "0"), 0);

  const response = await supabase
    .from(APP_CONFIG_TABLE)
    .select("monto_inicial")
    .eq("id", APP_CONFIG_ROW_ID)
    .maybeSingle();

  if (response.error) {
    if (isSchemaColumnError(response.error.message)) {
      return {
        value: localFallback,
        source: "local" as const,
      };
    }

    throw response.error;
  }

  const value = Math.max(Number(response.data?.monto_inicial ?? localFallback), 0);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(INITIAL_CAPITAL_KEY, String(value));
  }

  return {
    value,
    source: "supabase" as const,
  };
}

export default function Home() {
  const [authStatus, setAuthStatus] = useState<"loading" | "signed_out" | "signed_in">("loading");
  const [authMessage, setAuthMessage] = useState("");
  const [screenMessage, setScreenMessage] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [photoPreview, setPhotoPreview] = useState("");
  const [activeTab, setActiveTab] = useState<
    "resumen" | "ganancias" | "clientes" | "prestamos" | "pagos" | "configuracion"
  >("resumen");
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [initialCapitalInput, setInitialCapitalInput] = useState(() => {
    if (typeof window === "undefined") {
      return "0";
    }

    return window.localStorage.getItem(INITIAL_CAPITAL_KEY) ?? "0";
  });
  const [capitalStorageMode, setCapitalStorageMode] = useState<"supabase" | "local">("local");
  const [loanEditForm, setLoanEditForm] = useState<LoanEditForm | null>(null);
  const [loginForm, setLoginForm] = useState({
    usuario: "",
    clave: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [clientSearch, setClientSearch] = useState("");
  const [clientForm, setClientForm] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    correo: "",
  });
  const [loanForm, setLoanForm] = useState({
    clienteId: "",
    montoCapital: "",
    numeroCuotas: "",
    frecuenciaPago: "diaria" as PaymentFrequency,
    porcentajeInteres: "20",
  });
  const [loanMetadata, setLoanMetadata] = useState<LoanMetadata>({});
  const [profitPeriod, setProfitPeriod] = useState<ProfitPeriod>("semanal");
  const [profitDistribution, setProfitDistribution] = useState(() => readProfitDistribution());
  const [paymentForm, setPaymentForm] = useState({
    prestamoId: "",
  });
  const [isPending, startTransition] = useTransition();
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isCleaningHistory, setIsCleaningHistory] = useState(false);
  const deferredClientSearch = useDeferredValue(clientSearch);

  useEffect(() => {
    setLoanMetadata(readLoanMetadata());
    setProfitDistribution(readProfitDistribution());
  }, []);

  useEffect(() => {
    let isMounted = true;
    const maybeRunRetentionCleanup = async () => {
      const lastCleanupRun = window.localStorage.getItem(LAST_CLEANUP_RUN_KEY);

      if (lastCleanupRun) {
        const diffMs = Date.now() - new Date(lastCleanupRun).getTime();
        const oneDayMs = 1000 * 60 * 60 * 24;

        if (diffMs < oneDayMs) {
          return;
        }
      }

      try {
        const response = await fetch("/api/maintenance/cleanup", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          return;
        }

        window.localStorage.setItem(LAST_CLEANUP_RUN_KEY, new Date().toISOString());
      } catch {
        // Silent auto-cleanup failure during bootstrap.
      }
    };

    const bootstrap = async () => {
      const [sessionResponse, supabaseSessionResponse] = await Promise.all([
        fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        }),
        supabase.auth.getSession(),
      ]);
      const sessionPayload = (await sessionResponse.json().catch(() => ({
        authenticated: false,
      }))) as { authenticated?: boolean };
      const accessGranted = sessionPayload.authenticated === true;
      const { data } = supabaseSessionResponse;

      if (!isMounted) {
        return;
      }

      if (accessGranted && data.session) {
        setAuthStatus("signed_in");
        await loadData();
        void maybeRunRetentionCleanup();
        return;
      }

      if (accessGranted && !data.session) {
        try {
          await initializeSupabaseAccess();
          if (!isMounted) {
            return;
          }

          setAuthStatus("signed_in");
          await loadData();
          void maybeRunRetentionCleanup();
          return;
        } catch (error) {
          if (!isMounted) {
            return;
          }

          setAuthMessage(getErrorMessage(error));
        }
      }

      setAuthStatus("signed_out");
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "SIGNED_OUT") {
        setAuthStatus("signed_out");
      }

      if (session) {
        setAuthStatus("signed_in");
      }
    });

    bootstrap();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "signed_in") {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        loadData().catch((error) => {
          setScreenMessage(getErrorMessage(error));
        });
      }, 250);
    };

    const realtimeChannel = supabase
      .channel("creditos-cb-live-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clientes" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prestamos" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pagos" },
        scheduleRefresh,
      )
      .subscribe();

    const fallbackInterval = setInterval(() => {
      void loadData().catch(() => {
        // Silent fallback sync; realtime remains primary.
      });
    }, 30000);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      clearInterval(fallbackInterval);
      void supabase.removeChannel(realtimeChannel);
    };
  }, [authStatus]);

  async function initializeSupabaseAccess() {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      return data.session;
    }

    if (SUPABASE_LOGIN_EMAIL) {
      const { data: loginData, error } = await supabase.auth.signInWithPassword({
        email: SUPABASE_LOGIN_EMAIL,
        password: SUPABASE_LOGIN_PASSWORD,
      });

      if (error) {
        throw error;
      }

      return loginData.session;
    }

    // If no Supabase auth email is configured, we continue with the public
    // client and rely on the local app access gate. This avoids requiring
    // anonymous auth in projects where it is disabled.
    return null;
  }

  async function loadData() {
    setScreenMessage("");
    const storedLoanMetadata = readLoanMetadata();

    const [clientesResponse, prestamosResponse, pagosResponse, initialCapitalResponse] = await Promise.all([
      selectTableData("clientes"),
      selectTableData("prestamos"),
      selectTableData("pagos"),
      loadInitialCapitalValue(),
    ]);

    if (clientesResponse.error) {
      throw clientesResponse.error;
    }

    if (prestamosResponse.error) {
      throw prestamosResponse.error;
    }

    if (pagosResponse.error) {
      throw pagosResponse.error;
    }

    const pagosMapped = (pagosResponse.data ?? []).map((row) => mapPago(row));
    const prestamosMapped = (prestamosResponse.data ?? []).map((row) => {
      const prestamoBase = mapPrestamo(row);
      const prestamo = {
        ...prestamoBase,
        frecuenciaPago:
          storedLoanMetadata[String(row.id ?? "")]?.frecuenciaPago ?? prestamoBase.frecuenciaPago,
      };
      const pagosPrestamo = pagosMapped.filter((pago) => pago.prestamoId === prestamo.id);
      const totalPagado = roundCurrency(
        pagosPrestamo.reduce((sum, pago) => sum + pago.monto, 0),
      );
      const saldoRestante = roundCurrency(Math.max(prestamo.totalCobrar - totalPagado, 0));

      return {
        ...prestamo,
        cuotasPagadas: pagosPrestamo.length,
        saldoRestante,
        estado: saldoRestante <= 0 ? "pagado" : prestamo.estado,
      };
    });

    setClientes((clientesResponse.data ?? []).map((row) => mapCliente(row)));
    setPrestamos(prestamosMapped);
    setPagos(pagosMapped);
    setLoanMetadata(storedLoanMetadata);
    setInitialCapitalInput(String(initialCapitalResponse.value));
    setCapitalStorageMode(initialCapitalResponse.source);
  }

  async function refreshData() {
    startTransition(() => {
      loadData().catch((error) => {
        setScreenMessage(getErrorMessage(error));
      });
    });
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: loginForm.usuario,
          password: loginForm.clave,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "No fue posible iniciar sesion.");
      }

      await initializeSupabaseAccess();
      setAuthStatus("signed_in");
      await loadData();
      void runRetentionCleanupIfNeeded();
    } catch (error) {
      setAuthMessage(getErrorMessage(error));
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    await supabase.auth.signOut();
    setClientes([]);
    setPrestamos([]);
    setPagos([]);
    setAuthStatus("signed_out");
    setScreenMessage("");
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScreenMessage("");

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(passwordForm),
      });

      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "No fue posible cambiar la clave.");
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setScreenMessage("Clave actualizada correctamente.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  async function handleDownloadExcel() {
    setScreenMessage("");
    setIsDownloadingExcel(true);

    try {
      const response = await fetch("/api/export/excel", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "No fue posible generar el Excel.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "creditos-cb-reporte.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setScreenMessage("Archivo Excel descargado correctamente.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    } finally {
      setIsDownloadingExcel(false);
    }
  }

  async function executeRetentionCleanup(showMessageOnNoop = false) {
    const response = await fetch("/api/maintenance/cleanup", {
      method: "POST",
      credentials: "include",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          ok?: boolean;
          message?: string;
          pagosEliminados?: number;
          prestamosEliminados?: number;
          clientesEliminados?: number;
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? "No fue posible limpiar el historial.");
    }

    const summary = `Limpieza completada. Pagos: ${payload?.pagosEliminados ?? 0}, Prestamos: ${payload?.prestamosEliminados ?? 0}, Clientes: ${payload?.clientesEliminados ?? 0}.`;
    const hadChanges =
      (payload?.pagosEliminados ?? 0) > 0 ||
      (payload?.prestamosEliminados ?? 0) > 0 ||
      (payload?.clientesEliminados ?? 0) > 0;

    window.localStorage.setItem(LAST_CLEANUP_RUN_KEY, new Date().toISOString());
    await loadData();

    if (hadChanges || showMessageOnNoop) {
      setScreenMessage(hadChanges ? summary : "No habia registros de mas de 1 año para borrar.");
    }
  }

  async function handleCleanupHistory() {
    const confirmed = window.confirm(
      "Se borraran pagos, prestamos y clientes con mas de 1 año para ahorrar almacenamiento. Deseas continuar?",
    );

    if (!confirmed) {
      return;
    }

    setScreenMessage("");
    setIsCleaningHistory(true);

    try {
      await executeRetentionCleanup(true);
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    } finally {
      setIsCleaningHistory(false);
    }
  }

  async function runRetentionCleanupIfNeeded() {
    const lastCleanupRun = window.localStorage.getItem(LAST_CLEANUP_RUN_KEY);

    if (lastCleanupRun) {
      const diffMs = Date.now() - new Date(lastCleanupRun).getTime();
      const oneDayMs = 1000 * 60 * 60 * 24;

      if (diffMs < oneDayMs) {
        return;
      }
    }

    try {
      await executeRetentionCleanup(false);
    } catch {
      // Silent auto-cleanup failure; manual action remains available in configuration.
    }
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(String(reader.result ?? ""));
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScreenMessage("");

    try {
      const basePayload = {
        nombre: clientForm.nombre.trim(),
        direccion: clientForm.direccion.trim(),
        telefono: clientForm.telefono.trim(),
      };
      const correo = clientForm.correo.trim();
      const foto = photoPreview.trim();
      const payloads: Record<string, unknown>[] = [
        { ...basePayload, correo, foto_url: foto },
        { ...basePayload, email: correo, foto_url: foto },
        { ...basePayload, correo, foto },
        { ...basePayload, email: correo, foto },
        { ...basePayload, correo },
        { ...basePayload, email: correo },
        basePayload,
      ].map((payload) =>
        Object.fromEntries(
          Object.entries(payload).filter(([, value]) => value !== ""),
        ),
      );

      let lastError: Error | null = null;

      for (const payload of payloads) {
        const { error } = await supabase.from("clientes").insert(payload);

        if (!error) {
          lastError = null;
          break;
        }

        lastError = error;

        if (!isSchemaColumnError(error.message)) {
          throw error;
        }
      }

      if (lastError) {
        throw lastError;
      }

      setClientForm({
        nombre: "",
        direccion: "",
        telefono: "",
        correo: "",
      });
      setPhotoPreview("");
      await loadData();
      setActiveTab("clientes");
      setScreenMessage("Cliente registrado correctamente.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  async function handleCreateLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScreenMessage("");

    try {
      const capital = Number(loanForm.montoCapital);
      const numeroCuotas = Number(loanForm.numeroCuotas);
      const porcentajeInteres = normalizeIntegerPercentage(loanForm.porcentajeInteres);
      const frecuenciaPago = normalizePaymentFrequency(loanForm.frecuenciaPago);

      if (!loanForm.clienteId || capital <= 0 || numeroCuotas <= 0 || porcentajeInteres < 0) {
        throw new Error(
          "Debes seleccionar un cliente y completar capital, cuotas y porcentaje valido.",
        );
      }

      const calculation = calculateLoanValues(capital, numeroCuotas, porcentajeInteres);
      const payload = {
        cliente_id: loanForm.clienteId,
        monto_prestado: calculation.capital,
        numero_cuotas: calculation.installmentCount,
        estado: "activo",
      };

      const payloads = [
        { ...payload, frecuencia_pago: frecuenciaPago },
        { ...payload, frecuencia: frecuenciaPago },
        { ...payload, modalidad_pago: frecuenciaPago },
        payload,
      ];

      let createdLoanId = "";
      let lastError: Error | null = null;

      for (const currentPayload of payloads) {
        const response = await supabase.from("prestamos").insert(currentPayload).select("*").single();

        if (!response.error) {
          createdLoanId = String(response.data?.id ?? "");
          lastError = null;
          break;
        }

        lastError = response.error;

        if (!isSchemaColumnError(response.error.message)) {
          throw response.error;
        }
      }

      if (lastError) {
        throw lastError;
      }

      if (createdLoanId) {
        const nextMetadata = {
          ...readLoanMetadata(),
          [createdLoanId]: {
            frecuenciaPago,
          },
        };
        saveLoanMetadata(nextMetadata);
        setLoanMetadata(nextMetadata);
      }

      setLoanForm({
        clienteId: "",
        montoCapital: "",
        numeroCuotas: "",
        frecuenciaPago: "diaria",
        porcentajeInteres: "20",
      });
      await loadData();
      setScreenMessage("Prestamo creado con el porcentaje calculado automaticamente.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  async function handleSaveInitialCapital() {
    const normalizedValue = String(Math.max(Number(initialCapitalInput || 0), 0));
    setInitialCapitalInput(normalizedValue);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(INITIAL_CAPITAL_KEY, normalizedValue);
    }

    try {
      const { error } = await supabase.from(APP_CONFIG_TABLE).upsert(
        {
          id: APP_CONFIG_ROW_ID,
          monto_inicial: Number(normalizedValue),
        },
        {
          onConflict: "id",
        },
      );

      if (error) {
        if (isSchemaColumnError(error.message)) {
          setCapitalStorageMode("local");
          setScreenMessage(
            "Monto inicial guardado solo en este dispositivo. Ejecuta el SQL de configuracion_app para compartirlo entre celular y PC.",
          );
          return;
        }

        throw error;
      }

      setCapitalStorageMode("supabase");
      setScreenMessage("Monto inicial actualizado y sincronizado en Supabase.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  function handleSaveProfitDistribution() {
    const empresa = normalizeClosedPercentage(profitDistribution.empresaPorcentaje || 50);
    const personal = 100 - empresa;

    const nextDistribution = {
      empresaPorcentaje: String(empresa),
      personalPorcentaje: String(personal),
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem(PROFIT_DISTRIBUTION_KEY, JSON.stringify(nextDistribution));
    }

    setProfitDistribution(nextDistribution);
    setScreenMessage("Reparto de ganancias actualizado correctamente.");
  }

  function openReceiptPrintWindow(receiptData: ReceiptData) {
    const totalPagado = roundCurrency(
      pagos
        .filter(
          (pago) =>
            pago.prestamoId === receiptData.prestamo.id &&
            pago.cuotaNumero <= receiptData.pago.cuotaNumero,
        )
        .reduce((sum, pago) => sum + pago.monto, 0),
    );
    const saldoEnCuotas = Math.max(
      receiptData.prestamo.numeroCuotas - receiptData.pago.cuotaNumero,
      0,
    );
    const creditosEnDia =
      receiptData.prestamo.saldoRestante <= 0 ? "Prestamo completado" : "Al dia";
    const atrasos = creditosEnDia === "Al dia" ? "0" : "--";
    const receiptWindow = window.open("", "_blank");

    if (!receiptWindow) {
      setScreenMessage("El navegador bloqueo la pestaña del recibo. Permite ventanas emergentes.");
      return;
    }

    receiptWindow.document.open();
    receiptWindow.document.write(
      buildReceiptWindowHtml({
        receiptData,
        totalPagado,
        saldoEnCuotas,
        creditosEnDia,
        atrasos,
        logoUrl: `${window.location.origin}/creditos-cb-logo.png`,
      }),
    );
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.onload = () => {
      receiptWindow.print();
    };
  }

  function handlePrintReceipt() {
    window.print();
  }

  function handleCompanyPercentageChange(value: string) {
    const empresa = normalizeClosedPercentage(value);

    setProfitDistribution({
      empresaPorcentaje: String(empresa),
      personalPorcentaje: String(100 - empresa),
    });
  }

  function handlePersonalPercentageChange(value: string) {
    const personal = normalizeClosedPercentage(value);

    setProfitDistribution({
      empresaPorcentaje: String(100 - personal),
      personalPorcentaje: String(personal),
    });
  }

  async function handleRegisterPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScreenMessage("");

    try {
      const prestamo = prestamos.find((item) => item.id === paymentForm.prestamoId);

      if (!prestamo) {
        throw new Error("Selecciona un prestamo para registrar el pago.");
      }

      if (prestamo.saldoRestante <= 0) {
        throw new Error("Este prestamo ya fue cancelado por completo.");
      }

      const cliente = clientes.find((item) => item.id === prestamo.clienteId);

      if (!cliente) {
        throw new Error("No se encontro el cliente asociado al prestamo.");
      }

      const cuotaNumero = prestamo.cuotasPagadas + 1;
      const montoPago = Math.min(prestamo.valorCuota, prestamo.saldoRestante);
      const nuevoSaldo = roundCurrency(prestamo.saldoRestante - montoPago);
      const nuevoEstado = nuevoSaldo <= 0 ? "pagado" : "activo";

      const { data: pagoData, error: pagoError } = await supabase
        .from("pagos")
        .insert({
          prestamo_id: prestamo.id,
          monto_pagado: montoPago,
          cuota_numero: cuotaNumero,
        })
        .select("*")
        .single();

      if (pagoError) {
        throw pagoError;
      }

      const { error: updateError } = await supabase
        .from("prestamos")
        .update({
          estado: nuevoEstado,
        })
        .eq("id", prestamo.id);

      if (updateError) {
        throw updateError;
      }

      const pago = mapPago(pagoData);
      const prestamoActualizado: Prestamo = {
        ...prestamo,
        saldoRestante: nuevoSaldo,
        cuotasPagadas: cuotaNumero,
        estado: nuevoEstado,
      };

      const receiptPayload = {
        cliente,
        prestamo: prestamoActualizado,
        pago,
      };

      setPaymentForm({ prestamoId: "" });
      await loadData();
      openReceiptPrintWindow(receiptPayload);
      setScreenMessage("Pago registrado y recibo listo para imprimir.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  function handleOpenReceiptFromPayment(pago: Pago) {
    const prestamo = prestamos.find((item) => item.id === pago.prestamoId);

    if (!prestamo) {
      setScreenMessage("No se encontro el prestamo relacionado con ese pago.");
      return;
    }

    const cliente = clientes.find((item) => item.id === prestamo.clienteId);

    if (!cliente) {
      setScreenMessage("No se encontro el cliente relacionado con ese pago.");
      return;
    }

    const pagosPrestamo = pagos
      .filter((item) => item.prestamoId === prestamo.id)
      .sort((left, right) => {
        if (left.cuotaNumero !== right.cuotaNumero) {
          return left.cuotaNumero - right.cuotaNumero;
        }

        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      });

    const totalPagadoHastaRecibo = roundCurrency(
      pagosPrestamo
        .filter((item) => item.cuotaNumero <= pago.cuotaNumero)
        .reduce((sum, item) => sum + item.monto, 0),
    );
    const saldoRestante = roundCurrency(Math.max(prestamo.totalCobrar - totalPagadoHastaRecibo, 0));

    const receiptPayload = {
      cliente,
      pago,
      prestamo: {
        ...prestamo,
        cuotasPagadas: Math.max(pago.cuotaNumero, 0),
        saldoRestante,
        estado: saldoRestante <= 0 ? "pagado" : prestamo.estado,
      },
    };

    openReceiptPrintWindow(receiptPayload);
    setScreenMessage("Recibo recuperado desde el historial.");
  }

  async function handleDeleteClient(cliente: Cliente) {
    const confirmed = window.confirm(
      `Vas a borrar a ${cliente.nombre}. Esta accion no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    setScreenMessage("");

    try {
      const prestamosCliente = prestamos.filter((prestamo) => prestamo.clienteId === cliente.id);

      for (const prestamo of prestamosCliente) {
        const pagosPrestamo = pagos.filter((pago) => pago.prestamoId === prestamo.id);

        if (pagosPrestamo.length > 0) {
          const pagosIds = pagosPrestamo.map((pago) => pago.id);
          const { error: pagosDeleteError } = await supabase
            .from("pagos")
            .delete()
            .in("id", pagosIds);

          if (pagosDeleteError) {
            throw pagosDeleteError;
          }
        }

        const { error: prestamoDeleteError } = await supabase
          .from("prestamos")
          .delete()
          .eq("id", prestamo.id);

        if (prestamoDeleteError) {
          throw prestamoDeleteError;
        }

        const nextMetadata = { ...readLoanMetadata() };
        delete nextMetadata[prestamo.id];
        saveLoanMetadata(nextMetadata);
        setLoanMetadata(nextMetadata);
      }

      const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);

      if (error) {
        throw error;
      }

      await loadData();
      setScreenMessage(`Cliente ${cliente.nombre} eliminado correctamente.`);
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  function openLoanEditor(prestamo: Prestamo) {
    setLoanEditForm({
      prestamoId: prestamo.id,
      clienteId: prestamo.clienteId,
      montoCapital: String(prestamo.montoCapital),
      numeroCuotas: String(prestamo.numeroCuotas),
      frecuenciaPago: prestamo.frecuenciaPago,
      estado: prestamo.estado,
    });
  }

  async function handleUpdateLoan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!loanEditForm) {
      return;
    }

    setScreenMessage("");

    try {
      const montoPrestado = Number(loanEditForm.montoCapital);
      const numeroCuotas = Number(loanEditForm.numeroCuotas);
      const frecuenciaPago = normalizePaymentFrequency(loanEditForm.frecuenciaPago);

      if (!loanEditForm.clienteId || montoPrestado <= 0 || numeroCuotas <= 0) {
        throw new Error("Debes completar cliente, monto y cuotas validas.");
      }

      const payload = {
        cliente_id: loanEditForm.clienteId,
        monto_prestado: montoPrestado,
        numero_cuotas: numeroCuotas,
        estado: loanEditForm.estado || "activo",
      };

      const payloads = [
        { ...payload, frecuencia_pago: frecuenciaPago },
        { ...payload, frecuencia: frecuenciaPago },
        { ...payload, modalidad_pago: frecuenciaPago },
        payload,
      ];

      let lastError: Error | null = null;

      for (const currentPayload of payloads) {
        const response = await supabase
          .from("prestamos")
          .update(currentPayload)
          .eq("id", loanEditForm.prestamoId);

        if (!response.error) {
          lastError = null;
          break;
        }

        lastError = response.error;

        if (!isSchemaColumnError(response.error.message)) {
          throw response.error;
        }
      }

      if (lastError) {
        throw lastError;
      }

      const nextMetadata = {
        ...readLoanMetadata(),
        [loanEditForm.prestamoId]: {
          frecuenciaPago,
        },
      };
      saveLoanMetadata(nextMetadata);
      setLoanMetadata(nextMetadata);

      if (loanEditForm) {
        setLoanEditForm(null);
      }

      await loadData();
      setScreenMessage("Prestamo actualizado correctamente.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  async function handleDeleteLoan(prestamo: Prestamo) {
    const confirmed = window.confirm(
      "Vas a borrar este prestamo y sus pagos relacionados. Esta accion no se puede deshacer.",
    );

    if (!confirmed) {
      return;
    }

    setScreenMessage("");

    try {
      const pagosPrestamo = pagos.filter((pago) => pago.prestamoId === prestamo.id);

      if (pagosPrestamo.length > 0) {
        const pagosIds = pagosPrestamo.map((pago) => pago.id);
        const { error: pagosDeleteError } = await supabase.from("pagos").delete().in("id", pagosIds);

        if (pagosDeleteError) {
          throw pagosDeleteError;
        }
      }

      const { error } = await supabase.from("prestamos").delete().eq("id", prestamo.id);

      if (error) {
        throw error;
      }

      const nextMetadata = { ...readLoanMetadata() };
      delete nextMetadata[prestamo.id];
      saveLoanMetadata(nextMetadata);
      setLoanMetadata(nextMetadata);

      await loadData();
      setScreenMessage("Prestamo eliminado correctamente.");
    } catch (error) {
      setScreenMessage(getErrorMessage(error));
    }
  }

  const capitalPrestado = prestamos.reduce((sum, prestamo) => sum + prestamo.montoCapital, 0);
  const gananciaNeta = prestamos.reduce(
    (sum, prestamo) => sum + (prestamo.totalCobrar - prestamo.montoCapital),
    0,
  );
  const totalRecaudado = pagos.reduce((sum, pago) => sum + pago.monto, 0);
  const empresaPorcentaje = normalizeClosedPercentage(profitDistribution.empresaPorcentaje || 50);
  const personalPorcentaje = 100 - empresaPorcentaje;
  const pagosConGanancia = pagos.map((pago) => {
    const prestamo = prestamos.find((item) => item.id === pago.prestamoId);
    const gananciaPago = prestamo
      ? roundCurrency(
          pago.monto *
            Math.max(prestamo.totalCobrar - prestamo.montoCapital, 0) /
            Math.max(prestamo.totalCobrar, 1),
        )
      : 0;

    return {
      ...pago,
      gananciaPago,
    };
  });
  const gananciaCobradaTotal = roundCurrency(
    pagosConGanancia.reduce((sum, pago) => sum + pago.gananciaPago, 0),
  );
  const gananciaPeriodo = roundCurrency(
    pagosConGanancia
      .filter((pago) => isPaymentInsidePeriod(pago.createdAt, profitPeriod))
      .reduce((sum, pago) => sum + pago.gananciaPago, 0),
  );
  const gananciaPeriodoEmpresa = roundCurrency((gananciaPeriodo * empresaPorcentaje) / 100);
  const gananciaPeriodoPersonal = roundCurrency((gananciaPeriodo * personalPorcentaje) / 100);
  const gananciaTotalEmpresa = roundCurrency((gananciaCobradaTotal * empresaPorcentaje) / 100);
  const gananciaTotalPersonal = roundCurrency((gananciaCobradaTotal * personalPorcentaje) / 100);
  const initialCapital = Math.max(Number(initialCapitalInput || 0), 0);
  const capitalDisponible = Math.max(initialCapital - capitalPrestado + totalRecaudado, 0);
  const normalizedClientSearch = deferredClientSearch.trim().toLowerCase();
  const visibleClientes = clientes.filter((cliente) => {
    if (!normalizedClientSearch) {
      return true;
    }

    return [cliente.nombre, cliente.telefono, cliente.correo, cliente.direccion]
      .join(" ")
      .toLowerCase()
      .includes(normalizedClientSearch);
  });
  const tabItems = [
    { id: "resumen", label: "Resumen" },
    { id: "clientes", label: "Clientes" },
    { id: "prestamos", label: "Prestamos" },
    { id: "pagos", label: "Pagos" },
    { id: "ganancias", label: "Ganancias" },
    { id: "configuracion", label: "Configuracion" },
  ] as const;

  if (authStatus === "loading") {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto flex max-w-md flex-col gap-4 rounded-[28px] border border-white/50 bg-white/80 p-8 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto overflow-hidden rounded-[22px] border border-white/60 bg-white p-2 shadow-lg">
            <Image src="/creditos-cb-logo.png" alt={BRAND_NAME} width={96} height={96} priority />
          </div>
          <h1 className="text-2xl font-black text-slate-900">{BRAND_NAME}</h1>
          <p className="text-sm text-slate-600">
            Preparando la sesion persistente y sincronizando datos...
          </p>
        </div>
      </main>
    );
  }

  if (authStatus === "signed_out") {
    return (
      <main className="min-h-screen px-4 py-8">
        <section className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="brand-hero hidden rounded-[36px] border border-white/60 p-10 text-white shadow-2xl lg:block">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="inline-flex rounded-full bg-white/14 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em]">
                Desktop Premium
              </p>
              <p className="rounded-full border border-white/20 bg-black/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
                Cobro agil y control total
              </p>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-lime-100/90">
              Creditos CB
            </p>
            <h1 className="section-title mt-3 text-5xl font-black leading-[0.92]">
              Tu vitrina digital para prestar con mas presencia y cobrar con orden.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/88">
              Muestra una imagen mas fuerte de tu negocio mientras administras clientes,
              prestamos, pagos, recibos y saldo restante desde un panel claro y rapido.
            </p>
            <div className="mt-6 overflow-hidden rounded-[30px] border border-white/30 bg-white/10 p-3 backdrop-blur">
              <div className="rounded-[24px] border border-white/15 bg-white/95 p-3 shadow-[0_24px_70px_rgba(7,61,93,0.2)]">
                <Image
                  src="/creditos-cb-hero-whatsapp.jpeg"
                  alt="Creditos rapidos, seguros y sin complicaciones"
                  width={1152}
                  height={768}
                  priority
                  className="h-auto max-h-[460px] w-full rounded-[20px] object-contain"
                />
              </div>
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-3">
              {[
                {
                  title: "Imagen mas comercial",
                  body: "La portada de escritorio impulsa mejor tu marca y refuerza confianza visual desde el primer vistazo.",
                },
                {
                  title: "Control diario",
                  body: "Consulta clientes, prestamos y pagos desde un mismo panel sin perder rapidez al trabajar en PC.",
                },
                {
                  title: "Listo para cobrar",
                  body: "Recibos claros, saldo pendiente visible y sesion persistente para trabajar sin friccion.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[26px] border border-white/16 bg-white/10 p-5 backdrop-blur-sm"
                >
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-lime-100">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/85">{item.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Sesion segura", value: "Abierta hasta cerrar manualmente" },
                { label: "Recibos", value: "Formato ticket con saldo restante" },
                { label: "Gestion", value: "Diseno amplio para trabajar en PC" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-3xl border border-white/12 bg-white/8 p-5 text-sm leading-6"
                >
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-lime-100/90">
                    {item.label}
                  </p>
                  <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 flex items-end justify-between gap-6 rounded-[28px] border border-white/12 bg-black/10 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/70">
                  Lo que resuelve la app
                </p>
                <p className="mt-2 max-w-xl text-base leading-7 text-white/88">
                  Menos desorden al cobrar, mejor seguimiento por cliente y una presentacion
                  mas fuerte cuando trabajas desde computador.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/60">
                  Marca visible
                </p>
                <p className="mt-2 text-3xl font-black text-white">CB</p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleLogin}
            className="glass-panel mx-auto flex w-full max-w-md flex-col gap-5 rounded-[32px] p-6 sm:p-8"
          >
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="overflow-hidden rounded-[18px] border border-lime-200 bg-white p-1 shadow-sm">
                  <Image src="/creditos-cb-logo.png" alt={BRAND_NAME} width={74} height={74} priority />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.28em] text-green-700">
                    {BRAND_NAME}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                    Panel de acceso
                  </p>
                </div>
              </div>
              <h2 className="section-title text-3xl font-black text-slate-900">
                Ingreso seguro
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                La sesion quedara abierta de forma permanente en este dispositivo hasta que
                presiones <strong>Cerrar Sesion</strong>.
              </p>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate-700">Usuario</span>
              <input
                value={loginForm.usuario}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, usuario: event.target.value }))
                }
                className="h-14 rounded-2xl border border-slate-200 bg-white px-4 outline-none ring-0 transition focus:border-green-500"
                placeholder="Tu usuario"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate-700">Clave</span>
              <input
                type="password"
                value={loginForm.clave}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, clave: event.target.value }))
                }
                className="h-14 rounded-2xl border border-slate-200 bg-white px-4 outline-none ring-0 transition focus:border-green-500"
                placeholder="Tu clave"
              />
            </label>

            {authMessage ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {authMessage}
              </div>
            ) : null}

            <button
              type="submit"
              className="brand-button h-14 rounded-2xl text-base font-bold transition"
            >
              Entrar a la aplicacion
            </button>

            <div className="rounded-2xl bg-yellow-50 px-4 py-3 text-xs leading-5 text-yellow-900">
              El acceso ahora se valida desde el servidor y mantiene una cookie segura para
              que la sesion permanezca abierta hasta cerrar manualmente.
            </div>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        {loanEditForm ? (
          <section className="glass-panel rounded-[30px] border-2 border-sky-200 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-700">
                  Prestamos
                </p>
                <h2 className="section-title text-2xl font-black text-slate-900">
                  Editar prestamo
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setLoanEditForm(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition"
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={handleUpdateLoan} className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">Cliente</span>
                <select
                  value={loanEditForm.clienteId}
                  onChange={(event) =>
                    setLoanEditForm((current) =>
                      current ? { ...current, clienteId: event.target.value } : current,
                    )
                  }
                  className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                >
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">Estado</span>
                <select
                  value={loanEditForm.estado}
                  onChange={(event) =>
                    setLoanEditForm((current) =>
                      current ? { ...current, estado: event.target.value } : current,
                    )
                  }
                  className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                >
                  <option value="activo">Activo</option>
                  <option value="pagado">Pagado</option>
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">Monto prestado</span>
                <input
                  type="number"
                  min="1"
                  value={loanEditForm.montoCapital}
                  onChange={(event) =>
                    setLoanEditForm((current) =>
                      current ? { ...current, montoCapital: event.target.value } : current,
                    )
                  }
                  className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">Numero de cuotas</span>
                <input
                  type="number"
                  min="1"
                  value={loanEditForm.numeroCuotas}
                  onChange={(event) =>
                    setLoanEditForm((current) =>
                      current ? { ...current, numeroCuotas: event.target.value } : current,
                    )
                  }
                  className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-slate-700">Frecuencia de pago</span>
                <select
                  value={loanEditForm.frecuenciaPago}
                  onChange={(event) =>
                    setLoanEditForm((current) =>
                      current
                        ? {
                            ...current,
                            frecuenciaPago: normalizePaymentFrequency(event.target.value),
                          }
                        : current,
                    )
                  }
                  className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                >
                  {PAYMENT_FREQUENCIES.map((frecuencia) => (
                    <option key={frecuencia} value={frecuencia}>
                      {getPaymentFrequencyLabel(frecuencia)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2 flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="brand-button rounded-2xl px-5 py-3 text-sm font-bold transition"
                >
                  Guardar cambios
                </button>
                <button
                  type="button"
                  onClick={() => setLoanEditForm(null)}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {receiptData ? (
          <section className="glass-panel rounded-[30px] border-2 border-green-200 p-4 sm:p-5 print:border-none print:bg-white print:shadow-none">
            <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                  Recibo
                </p>
                <h2 className="section-title text-2xl font-black text-slate-900">
                  Ticket listo para imprimir
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="brand-button rounded-2xl px-4 py-3 text-sm font-bold transition"
                >
                  Imprimir recibo
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptData(null)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="receipt-sheet mx-auto max-w-2xl rounded-[30px] border border-dashed border-slate-300 bg-white p-5 shadow-sm print:max-w-full print:border-none print:shadow-none">
              {(() => {
                const totalPagado = roundCurrency(
                  pagos
                    .filter(
                      (pago) =>
                        pago.prestamoId === receiptData.prestamo.id &&
                        pago.cuotaNumero <= receiptData.pago.cuotaNumero,
                    )
                    .reduce((sum, pago) => sum + pago.monto, 0),
                );
                const saldoEnCuotas = Math.max(
                  receiptData.prestamo.numeroCuotas - receiptData.pago.cuotaNumero,
                  0,
                );
                const creditosEnDia =
                  receiptData.prestamo.saldoRestante <= 0 ? "Prestamo completado" : "Al dia";
                const atrasos = creditosEnDia === "Al dia" ? "0" : "--";

                return (
                  <>
                    <div className="grid gap-0 overflow-hidden rounded-[24px] border border-slate-300">
                      <div className="border-b border-slate-300 bg-white p-3 text-center">
                        <div className="overflow-hidden rounded-[14px] border border-lime-200 bg-white px-1 py-1 shadow-sm print:shadow-none">
                          <Image
                            src="/creditos-cb-logo.png"
                            alt={BRAND_NAME}
                            width={720}
                            height={240}
                            priority
                            className="mx-auto h-[170px] w-full scale-[1.8] object-contain"
                          />
                        </div>
                        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-slate-500">
                          Recibo de pago
                        </p>
                      </div>

                      <div className="border-b border-slate-300 px-3 py-2 text-sm">
                        <span className="font-black text-slate-900">Fecha:</span>{" "}
                        {formatDate(receiptData.pago.createdAt)}
                      </div>

                      <div className="border-b border-slate-300 px-3 py-2 text-sm">
                        <span className="font-black text-slate-900">Valor cuota:</span>{" "}
                        {formatCurrency(receiptData.prestamo.valorCuota)}
                      </div>

                      <div className="grid sm:grid-cols-2">
                        <div className="border-b border-slate-300 sm:border-b-0 sm:border-r">
                          <div className="border-b border-slate-300 bg-slate-50 px-3 py-2 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-900">
                            Datos cliente
                          </div>
                          <div className="grid gap-0 text-sm text-slate-700">
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Nombre:</span>{" "}
                              {formatReceiptField(receiptData.cliente.nombre)}
                            </div>
                            <div className="px-3 py-2">
                              <span className="font-black text-slate-900">Direccion:</span>{" "}
                              {formatReceiptField(receiptData.cliente.direccion)}
                            </div>
                          </div>
                        </div>

                        <div className="border-b border-slate-300 sm:border-b-0">
                          <div className="border-b border-slate-300 bg-slate-50 px-3 py-2 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-900">
                            Extracto de manejo
                          </div>
                          <div className="grid gap-0 text-sm text-slate-700">
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">N de cuotas:</span>{" "}
                              {receiptData.prestamo.numeroCuotas}
                            </div>
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Saldo en cuotas:</span>{" "}
                              {saldoEnCuotas}
                            </div>
                            <div className="px-3 py-2">
                              <span className="font-black text-slate-900">Creditos en dias:</span>{" "}
                              {creditosEnDia}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2">
                        <div className="border-b border-slate-300 sm:border-b-0 sm:border-r">
                          <div className="border-b border-slate-300 bg-slate-50 px-3 py-2 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-900">
                            Prestamo
                          </div>
                          <div className="grid gap-0 text-sm text-slate-700">
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Ultimo pago:</span>{" "}
                              {formatCurrency(receiptData.pago.monto)}
                            </div>
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Total pagado:</span>{" "}
                              {formatCurrency(totalPagado)}
                            </div>
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Fecha de pago:</span>{" "}
                              {formatDate(receiptData.pago.createdAt)}
                            </div>
                            <div className="px-3 py-2">
                              <span className="font-black text-slate-900">Saldo actual:</span>{" "}
                              {formatCurrency(Math.max(receiptData.prestamo.saldoRestante, 0))}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="border-b border-slate-300 bg-slate-50 px-3 py-2 text-center text-sm font-black uppercase tracking-[0.14em] text-slate-900">
                            Control
                          </div>
                          <div className="grid gap-0 text-sm text-slate-700">
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Atrasos:</span> {atrasos}
                            </div>
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Dominical:</span> --
                            </div>
                            <div className="border-b border-slate-200 px-3 py-2">
                              <span className="font-black text-slate-900">Telefono:</span>{" "}
                              {formatReceiptField(receiptData.cliente.telefono)}
                            </div>
                            <div className="px-3 py-3 text-center text-lg font-black text-green-800">
                              WhatsApp {BUSINESS_PHONE}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {receiptData.cliente.fotoUrl ? (
                      <div className="mt-4 flex items-center justify-center gap-3 rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <Image
                          src={receiptData.cliente.fotoUrl}
                          alt={receiptData.cliente.nombre}
                          width={60}
                          height={60}
                          unoptimized
                          className="h-[60px] w-[60px] rounded-full border-4 border-green-100 object-cover"
                        />
                        <p>Foto del cliente incluida como soporte de este recibo.</p>
                      </div>
                    ) : null}

                    <p className="mt-4 border-t border-dashed border-slate-300 pt-4 text-center text-xs text-slate-500">
                      Gracias por su pago. Conserve este recibo como soporte.
                    </p>
                  </>
                );
              })()}
            </div>
          </section>
        ) : null}

        <div className={receiptData ? "print:hidden" : ""}>
        <header className="glass-panel rounded-[28px] p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="overflow-hidden rounded-[18px] border border-lime-200 bg-white p-1 shadow-sm">
                  <Image src="/creditos-cb-logo.png" alt={BRAND_NAME} width={76} height={76} priority />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-green-700">
                    {BRAND_NAME}
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-sky-700">
                    Gestion de prestamos
                  </p>
                </div>
              </div>
              <h1 className="section-title mt-2 text-3xl font-black text-slate-900 sm:text-4xl">
                Control total de cobros, clientes y recibos
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                El sistema calcula automaticamente el porcentaje que definas, divide las
                cuotas, mantiene el saldo restante y deja la sesion abierta hasta cerrar
                manualmente.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={refreshData}
                className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-green-300 hover:text-green-700"
              >
                {isPending ? "Actualizando..." : "Actualizar datos"}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="brand-button-dark h-12 rounded-2xl px-5 text-sm font-bold transition"
              >
                Cerrar Sesion
              </button>
            </div>
          </div>
        </header>

        <section className="glass-panel rounded-[26px] p-3 sm:p-4">
          <div className="hide-scrollbar flex gap-2 overflow-x-auto">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-w-fit rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  activeTab === tab.id
                    ? "brand-button text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "resumen" ? <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Monto Inicial",
              value: formatCurrency(initialCapital),
              accent: "from-slate-900 via-slate-800 to-slate-700",
            },
            {
              label: "Capital Prestado",
              value: formatCurrency(capitalPrestado),
              accent: "from-green-700 via-green-600 to-lime-500",
            },
            {
              label: "Ganancia Neta",
              value: formatCurrency(gananciaNeta),
              accent: "from-yellow-300 via-yellow-400 to-amber-500",
            },
            {
              label: "Total Recaudado",
              value: formatCurrency(totalRecaudado),
              accent: "from-sky-700 via-blue-600 to-cyan-500",
            },
            {
              label: "Disponible para prestar",
              value: formatCurrency(capitalDisponible),
              accent: "from-fuchsia-700 via-violet-600 to-purple-500",
            },
          ].map((card) => (
            <article
              key={card.label}
              className={`rounded-[28px] bg-gradient-to-br ${card.accent} p-5 text-white shadow-xl`}
            >
              <p className="text-sm uppercase tracking-[0.24em] text-white/80">{card.label}</p>
              <p className="mt-4 text-3xl font-black sm:text-4xl">{card.value}</p>
            </article>
          ))}
        </section> : null}

        {screenMessage ? (
          <div className="glass-panel rounded-[24px] border-l-4 border-l-teal-600 px-4 py-3 text-sm text-slate-700">
            {screenMessage}
          </div>
        ) : null}

        {activeTab === "resumen" ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                  Panorama
                </p>
                <h2 className="section-title text-2xl font-black text-slate-900">
                  Resumen del negocio
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Clientes</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{clientes.length}</p>
                </div>
                <div className="rounded-[24px] bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Prestamos</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{prestamos.length}</p>
                </div>
                <div className="rounded-[24px] bg-white/80 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Pagos</p>
                  <p className="mt-2 text-3xl font-black text-slate-900">{pagos.length}</p>
                </div>
              </div>
            </article>

            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Clientes
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Ultimos registrados
                  </h2>
                </div>
              </div>
              <div className="grid gap-3">
                {clientes.slice(0, 4).map((cliente) => (
                  <article
                    key={cliente.id}
                    className="rounded-[24px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,252,247,0.88))] p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 overflow-hidden rounded-2xl bg-slate-100">
                        {cliente.fotoUrl ? (
                          <Image
                            src={cliente.fotoUrl}
                            alt={cliente.nombre}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs font-bold text-slate-500">
                            Sin foto
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black text-slate-900">
                          {cliente.nombre}
                        </h3>
                        <p className="truncate text-sm text-slate-600">{cliente.telefono}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </div>

          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Pagos
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Ultimos movimientos
                  </h2>
                </div>
              </div>
              <div className="grid gap-3">
                {pagos.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-slate-500">
                    Todavia no se han registrado pagos.
                  </div>
                ) : null}

                {pagos.slice(0, 5).map((pago) => {
                  const cliente =
                    clientes.find((item) => item.id === pago.clienteId)?.nombre ?? "Cliente";

                  return (
                    <article
                      key={pago.id}
                      className="rounded-[24px] border border-white/60 bg-white/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-black text-slate-900">{cliente}</h3>
                          <p className="mt-1 text-sm text-slate-500">{formatDate(pago.createdAt)}</p>
                        </div>
                        <p className="text-lg font-black text-green-700">
                          {formatCurrency(pago.monto)}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenReceiptFromPayment(pago)}
                          className="rounded-2xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-800 transition hover:bg-green-100"
                        >
                          Ver recibo
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          </div>
        </section>
        ) : null}

        {activeTab === "ganancias" ? (
        <section className="grid gap-4">
          <article className="glass-panel rounded-[30px] p-4 sm:p-5">
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                Ganancias
              </p>
              <h2 className="section-title text-2xl font-black text-slate-900">
                Control por periodo y reparto
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Aqui puedes ver la ganancia cobrada por dia, semana, quincena o mes, repartirla
                entre empresa y personal con los porcentajes que definas, y consultar lo ganado
                desde que empezaste.
              </p>
            </div>

            <div className="grid gap-3 xl:grid-cols-[0.92fr_1.08fr]">
              <div className="grid gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Periodo a revisar</span>
                  <select
                    value={profitPeriod}
                    onChange={(event) => setProfitPeriod(event.target.value as ProfitPeriod)}
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                  >
                    <option value="diario">Diario</option>
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">% empresa</span>
                    <select
                      value={String(normalizeClosedPercentage(profitDistribution.empresaPorcentaje))}
                      onChange={(event) => handleCompanyPercentageChange(event.target.value)}
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    >
                      {CLOSED_PERCENTAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}%
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">% personal</span>
                    <select
                      value={String(normalizeClosedPercentage(profitDistribution.personalPorcentaje))}
                      onChange={(event) => handlePersonalPercentageChange(event.target.value)}
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    >
                      {CLOSED_PERCENTAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSaveProfitDistribution}
                  className="brand-button h-13 rounded-2xl px-5 text-sm font-bold transition"
                >
                  Guardar reparto
                </button>

                <div className="rounded-[24px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  La ganancia del periodo se calcula con base en los pagos registrados en ese rango.
                  El reparto se guarda en este navegador para no modificar tu base actual.
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(14,116,144,0.12),rgba(59,130,246,0.12))] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ganancia cobrada del {getPeriodLabel(profitPeriod)}
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {formatCurrency(gananciaPeriodo)}
                  </p>
                </div>
                <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(132,204,22,0.12))] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Ganancia cobrada desde el inicio
                  </p>
                  <p className="mt-2 text-3xl font-black text-slate-900">
                    {formatCurrency(gananciaCobradaTotal)}
                  </p>
                </div>
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-emerald-700">
                    Empresa en el periodo
                  </p>
                  <p className="mt-2 text-2xl font-black text-emerald-900">
                    {formatCurrency(gananciaPeriodoEmpresa)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700">{empresaPorcentaje}% del periodo</p>
                </div>
                <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-sky-700">
                    Personal en el periodo
                  </p>
                  <p className="mt-2 text-2xl font-black text-sky-900">
                    {formatCurrency(gananciaPeriodoPersonal)}
                  </p>
                  <p className="mt-1 text-xs text-sky-700">{personalPorcentaje}% del periodo</p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Empresa desde el inicio
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">
                    {formatCurrency(gananciaTotalEmpresa)}
                  </p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4 text-sm text-slate-600">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                    Personal desde el inicio
                  </p>
                  <p className="mt-2 text-2xl font-black text-slate-900">
                    {formatCurrency(gananciaTotalPersonal)}
                  </p>
                </div>
              </div>
            </div>
          </article>
        </section>
        ) : null}

        {activeTab === "configuracion" ? (
        <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Fondo base
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Monto inicial para prestamos
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Monto inicial</span>
                  <input
                    type="number"
                    min="0"
                    value={initialCapitalInput}
                    onChange={(event) => setInitialCapitalInput(event.target.value)}
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    placeholder="1000000"
                  />
                </label>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleSaveInitialCapital}
                    className="brand-button h-13 rounded-2xl px-5 text-sm font-bold transition"
                  >
                    Guardar monto
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[24px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Este valor se guarda en este dispositivo y el disponible se calcula como:
                monto inicial - capital prestado + total recaudado.
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Guardado en: {capitalStorageMode === "supabase" ? "Supabase" : "Solo este dispositivo"}
              </p>
            </article>

            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Seguridad
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Cambiar clave de acceso
                  </h2>
                </div>
              </div>

              <form onSubmit={handleChangePassword} className="grid gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Clave actual</span>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    placeholder="Clave actual"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">Nueva clave</span>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          newPassword: event.target.value,
                        }))
                      }
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                      placeholder="Nueva clave"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Confirmar nueva clave
                    </span>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(event) =>
                        setPasswordForm((current) => ({
                          ...current,
                          confirmPassword: event.target.value,
                        }))
                      }
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                      placeholder="Repite la nueva clave"
                    />
                  </label>
                </div>

                <div className="rounded-[24px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Para que el cambio quede realmente compartido en la version online, configura
                  <code> SUPABASE_SERVICE_ROLE_KEY </code> en Vercel y ejecuta el SQL de
                  <code> credenciales_app </code>.
                </div>

                <button
                  type="submit"
                  className="brand-button-dark h-13 rounded-2xl px-5 text-sm font-bold transition"
                >
                  Actualizar clave
                </button>
              </form>
            </article>

            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Respaldo
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Excel y retencion de datos
                  </h2>
                </div>
              </div>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="brand-button h-13 rounded-2xl px-5 text-sm font-bold transition"
                >
                  {isDownloadingExcel ? "Generando Excel..." : "Descargar Excel completo"}
                </button>

                <button
                  type="button"
                  onClick={handleCleanupHistory}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
                >
                  {isCleaningHistory
                    ? "Limpiando historico..."
                    : "Borrar historial de mas de 1 año"}
                </button>
              </div>

              <div className="mt-4 rounded-[24px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                La app intentara limpiar automaticamente una vez al dia los registros de mas de
                1 año. Tambien puedes lanzar la limpieza manualmente cuando quieras.
              </div>
            </article>
          </div>
        </section>
        ) : null}

        {activeTab === "clientes" ? (
          <section className="grid gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Clientes
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Registro con foto
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {clientes.length} registrados
                </span>
              </div>

              <form onSubmit={handleCreateClient} className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">Nombre</span>
                    <input
                      value={clientForm.nombre}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, nombre: event.target.value }))
                      }
                      required
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                      placeholder="Nombre completo"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">Telefono</span>
                    <input
                      value={clientForm.telefono}
                      onChange={(event) =>
                        setClientForm((current) => ({ ...current, telefono: event.target.value }))
                      }
                      required
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                      placeholder="3001234567"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Direccion</span>
                  <input
                    value={clientForm.direccion}
                    onChange={(event) =>
                      setClientForm((current) => ({ ...current, direccion: event.target.value }))
                    }
                    required
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    placeholder="Barrio, calle o referencia"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Correo</span>
                  <input
                    type="email"
                    value={clientForm.correo}
                    onChange={(event) =>
                      setClientForm((current) => ({ ...current, correo: event.target.value }))
                    }
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    placeholder="cliente@correo.com"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Foto del cliente
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoChange}
                      className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600"
                    />
                  </label>

                  <div className="flex items-center justify-center">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-slate-100">
                      {photoPreview ? (
                        <Image
                          src={photoPreview}
                          alt="Vista previa del cliente"
                          width={96}
                          height={96}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="px-2 text-center text-xs font-semibold text-slate-500">
                          Sin foto
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="brand-button mt-1 h-13 rounded-2xl px-5 text-sm font-bold transition"
                >
                  Guardar cliente
                </button>
              </form>
            </article>

            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Clientes
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Listado completo
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Aqui puedes ver todos los clientes registrados y la fecha exacta de creacion.
                  </p>
                </div>
                <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  {clientes.length} clientes
                </div>
              </div>

              <div className="mb-4">
                <input
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  placeholder="Buscar cliente, telefono, correo o direccion"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-green-500"
                />
              </div>

              <div className="grid gap-3 lg:hidden">
                {visibleClientes.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-slate-500">
                    No se encontraron clientes con ese criterio.
                  </div>
                ) : null}

                {visibleClientes.map((cliente) => (
                  <article
                    key={cliente.id}
                    className="rounded-[24px] border border-white/60 bg-white/80 p-4 shadow-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-16 overflow-hidden rounded-2xl bg-slate-100">
                        {cliente.fotoUrl ? (
                          <Image
                            src={cliente.fotoUrl}
                            alt={cliente.nombre}
                            width={64}
                            height={64}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs font-bold text-slate-500">
                            Sin foto
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-black text-slate-900">
                          {cliente.nombre}
                        </h3>
                        <p className="truncate text-sm text-slate-600">{cliente.telefono}</p>
                        <p className="truncate text-xs text-slate-500">{cliente.correo || "--"}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 rounded-[22px] bg-slate-50 p-3 text-sm text-slate-600">
                      <p>
                        <strong className="text-slate-900">Direccion:</strong> {cliente.direccion}
                      </p>
                      <p>
                        <strong className="text-slate-900">Creado:</strong> {formatDate(cliente.createdAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteClient(cliente)}
                      className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                    >
                      Borrar cliente
                    </button>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-[24px] border border-slate-200 lg:block">
                <table className="min-w-full bg-white/80">
                  <thead className="bg-gradient-to-r from-green-700 via-green-600 to-sky-700 text-left text-xs uppercase tracking-[0.18em] text-white">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Telefono</th>
                      <th className="px-4 py-3">Correo</th>
                      <th className="px-4 py-3">Direccion</th>
                      <th className="px-4 py-3">Fecha de creacion</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClientes.map((cliente) => (
                      <tr key={cliente.id} className="border-t border-slate-100 text-sm">
                        <td className="px-4 py-3 font-semibold text-slate-800">{cliente.nombre}</td>
                        <td className="px-4 py-3">{cliente.telefono}</td>
                        <td className="px-4 py-3">{cliente.correo || "--"}</td>
                        <td className="px-4 py-3">{cliente.direccion}</td>
                        <td className="px-4 py-3">{formatDate(cliente.createdAt)}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleDeleteClient(cliente)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "prestamos" ? (
        <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                  Prestamos
                </p>
                <h2 className="section-title text-2xl font-black text-slate-900">
                  Alta automatica del prestamo
                </h2>
              </div>

              <form onSubmit={handleCreateLoan} className="grid gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Cliente</span>
                  <select
                    value={loanForm.clienteId}
                    onChange={(event) =>
                      setLoanForm((current) => ({ ...current, clienteId: event.target.value }))
                    }
                    required
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                  >
                    <option value="">Selecciona un cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id} value={cliente.id}>
                        {cliente.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">Monto Capital</span>
                    <input
                      type="number"
                      min="1"
                      value={loanForm.montoCapital}
                      onChange={(event) =>
                        setLoanForm((current) => ({
                          ...current,
                          montoCapital: event.target.value,
                        }))
                      }
                      required
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                      placeholder="500000"
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-slate-700">Numero de Cuotas</span>
                    <input
                      type="number"
                      min="1"
                      value={loanForm.numeroCuotas}
                      onChange={(event) =>
                        setLoanForm((current) => ({
                          ...current,
                          numeroCuotas: event.target.value,
                        }))
                      }
                      required
                      className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                      placeholder="10"
                    />
                  </label>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">Frecuencia de pago</span>
                  <select
                    value={loanForm.frecuenciaPago}
                    onChange={(event) =>
                      setLoanForm((current) => ({
                        ...current,
                        frecuenciaPago: normalizePaymentFrequency(event.target.value),
                      }))
                    }
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                  >
                    {PAYMENT_FREQUENCIES.map((frecuencia) => (
                      <option key={frecuencia} value={frecuencia}>
                        {getPaymentFrequencyLabel(frecuencia)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Porcentaje de interes
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={loanForm.porcentajeInteres}
                    onChange={(event) =>
                      setLoanForm((current) => ({
                        ...current,
                        porcentajeInteres: String(
                          normalizeIntegerPercentage(event.target.value),
                        ),
                      }))
                    }
                    required
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                    placeholder="20"
                  />
                </label>

                {Number(loanForm.montoCapital) > 0 &&
                Number(loanForm.numeroCuotas) > 0 &&
                Number(loanForm.porcentajeInteres) >= 0 ? (
                  <div className="rounded-[24px] bg-gradient-to-br from-green-700 via-green-600 to-sky-700 p-4 text-white">
                    {(() => {
                      const preview = calculateLoanValues(
                        Number(loanForm.montoCapital),
                        Number(loanForm.numeroCuotas),
                        normalizeIntegerPercentage(loanForm.porcentajeInteres),
                      );

                      return (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-200">
                              Interes
                            </p>
                            <p className="mt-2 break-words text-3xl font-black leading-none">
                              {preview.interestRatePercent}%
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-200">
                              Total a cobrar
                            </p>
                            <p className="mt-2 break-words text-3xl font-black leading-tight">
                              {formatCurrency(preview.totalToCollect)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-200">
                              Valor cuota
                            </p>
                            <p className="mt-2 break-words text-3xl font-black leading-tight">
                              {formatCurrency(preview.installmentValue)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-200">
                              Frecuencia
                            </p>
                            <p className="mt-2 break-words text-3xl font-black leading-none">
                              {getPaymentFrequencyLabel(loanForm.frecuenciaPago)}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="brand-button-secondary h-13 rounded-2xl px-5 text-sm font-bold transition"
                >
                  Crear prestamo
                </button>
              </form>
            </article>
          </div>

          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Prestamos
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Vista de cobranza
                  </h2>
                </div>
              </div>

              <div className="grid gap-3 lg:hidden">
                {prestamos.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-slate-500">
                    Aun no hay prestamos registrados.
                  </div>
                ) : null}

                {prestamos.map((prestamo) => {
                  const cliente =
                    clientes.find((item) => item.id === prestamo.clienteId)?.nombre ?? "Cliente";

                  return (
                    <article
                      key={prestamo.id}
                      className="rounded-[24px] border border-white/60 bg-white/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-slate-900">{cliente}</h3>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {getLoanStatusLabel(prestamo)}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {prestamo.cuotasPagadas}/{prestamo.numeroCuotas}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Capital</p>
                          <p className="mt-2 font-bold">{formatCurrency(prestamo.montoCapital)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Interes</p>
                          <p className="mt-2 font-bold">{prestamo.porcentajeInteres}%</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Cuota</p>
                          <p className="mt-2 font-bold">{formatCurrency(prestamo.valorCuota)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total</p>
                          <p className="mt-2 font-bold">{formatCurrency(prestamo.totalCobrar)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Frecuencia</p>
                          <p className="mt-2 font-bold">{getPaymentFrequencyLabel(prestamo.frecuenciaPago)}</p>
                        </div>
                        <div className="rounded-2xl bg-yellow-50 p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-yellow-700">Saldo</p>
                          <p className="mt-2 font-bold text-yellow-900">
                            {formatCurrency(prestamo.saldoRestante)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => openLoanEditor(prestamo)}
                          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700 transition hover:bg-sky-100"
                        >
                          Editar prestamo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLoan(prestamo)}
                          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-100"
                        >
                          Borrar prestamo
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-hidden rounded-[24px] border border-slate-200 lg:block">
                <table className="min-w-full bg-white/80">
                  <thead className="bg-gradient-to-r from-green-700 via-green-600 to-sky-700 text-left text-xs uppercase tracking-[0.18em] text-white">
                    <tr>
                      <th className="px-4 py-3">Cliente</th>
                      <th className="px-4 py-3">Capital</th>
                      <th className="px-4 py-3">Interes</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Cuota</th>
                      <th className="px-4 py-3">Frecuencia</th>
                      <th className="px-4 py-3">Cuotas</th>
                      <th className="px-4 py-3">Saldo</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prestamos.map((prestamo) => {
                      const cliente =
                        clientes.find((item) => item.id === prestamo.clienteId)?.nombre ??
                        "Cliente";

                      return (
                        <tr key={prestamo.id} className="border-t border-slate-100 text-sm">
                          <td className="px-4 py-3 font-semibold text-slate-800">{cliente}</td>
                          <td className="px-4 py-3">{formatCurrency(prestamo.montoCapital)}</td>
                          <td className="px-4 py-3">{prestamo.porcentajeInteres}%</td>
                          <td className="px-4 py-3">{formatCurrency(prestamo.totalCobrar)}</td>
                          <td className="px-4 py-3">{formatCurrency(prestamo.valorCuota)}</td>
                          <td className="px-4 py-3">{getPaymentFrequencyLabel(prestamo.frecuenciaPago)}</td>
                          <td className="px-4 py-3">
                            {prestamo.cuotasPagadas}/{prestamo.numeroCuotas}
                          </td>
                          <td className="px-4 py-3 font-semibold text-yellow-800">
                            {formatCurrency(prestamo.saldoRestante)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                              {getLoanStatusLabel(prestamo)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openLoanEditor(prestamo)}
                                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLoan(prestamo)}
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                              >
                                Borrar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
        ) : null}

        {activeTab === "pagos" ? (
        <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                  Pagos
                </p>
                <h2 className="section-title text-2xl font-black text-slate-900">
                  Registrar cuota y emitir recibo
                </h2>
              </div>

              <form onSubmit={handleRegisterPayment} className="grid gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Prestamo a cobrar
                  </span>
                  <select
                    value={paymentForm.prestamoId}
                    onChange={(event) => setPaymentForm({ prestamoId: event.target.value })}
                    required
                    className="h-13 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-green-500"
                  >
                    <option value="">Selecciona un prestamo activo</option>
                    {prestamos
                      .filter((prestamo) => prestamo.saldoRestante > 0)
                      .map((prestamo) => {
                        const cliente =
                          clientes.find((item) => item.id === prestamo.clienteId)?.nombre ??
                          "Cliente";

                        return (
                          <option key={prestamo.id} value={prestamo.id}>
                            {cliente} - {getPaymentFrequencyLabel(prestamo.frecuenciaPago)} - {formatCurrency(prestamo.valorCuota)} - saldo{" "}
                            {formatCurrency(prestamo.saldoRestante)}
                          </option>
                        );
                      })}
                  </select>
                </label>

                <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/70 p-4 text-sm leading-6 text-slate-600">
                  El sistema registra una cuota completa por clic y genera el ticket imprimible
                  con fecha, foto, valor del pago, cuota y saldo restante.
                </div>

                <button
                  type="submit"
                  className="brand-button-dark h-13 rounded-2xl px-5 text-sm font-bold transition"
                >
                  Registrar pago y abrir recibo
                </button>
              </form>
            </article>
          </div>

          <div className="flex flex-col gap-4">
            <article className="glass-panel rounded-[30px] p-4 sm:p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-green-700">
                    Historial
                  </p>
                  <h2 className="section-title text-2xl font-black text-slate-900">
                    Ultimos pagos
                  </h2>
                </div>
              </div>

              <div className="grid gap-3">
                {pagos.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-5 text-sm text-slate-500">
                    Todavia no se han registrado pagos.
                  </div>
                ) : null}

                {pagos.slice(0, 8).map((pago) => {
                  const prestamo = prestamos.find((item) => item.id === pago.prestamoId);
                  const cliente =
                    clientes.find((item) => item.id === pago.clienteId)?.nombre ?? "Cliente";

                  return (
                    <article
                      key={pago.id}
                      className="rounded-[24px] border border-white/60 bg-white/80 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-black text-slate-900">{cliente}</h3>
                          <p className="mt-1 text-sm text-slate-500">{formatDate(pago.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black text-green-700">
                            {formatCurrency(pago.monto)}
                          </p>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Cuota {pago.cuotaNumero}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        Saldo restante:{" "}
                        <strong className="text-slate-900">
                          {formatCurrency(prestamo?.saldoRestante ?? 0)}
                        </strong>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenReceiptFromPayment(pago)}
                          className="rounded-2xl border border-green-200 bg-green-50 px-4 py-2 text-sm font-bold text-green-800 transition hover:bg-green-100"
                        >
                          Volver a generar recibo
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </article>
          </div>
        </section>
        ) : null}
        </div>
      </div>
    </main>
  );
}
