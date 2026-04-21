import { createClient } from "@supabase/supabase-js";
import { getLoanOverdueInfo, type LoanFrequency } from "@/lib/loan-utils";

type ClienteRow = {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  correo: string | null;
  foto_url: string | null;
  fecha_registro: string | null;
};

type PrestamoRow = {
  id: string;
  cliente_id: string;
  monto_prestado: number;
  total_a_pagar: number;
  numero_cuotas: number;
  valor_cuota: number;
  frecuencia_pago?: string | null;
  frecuencia?: string | null;
  modalidad_pago?: string | null;
  estado: string | null;
  fecha_inicio: string | null;
};

type PagoRow = {
  id: string;
  prestamo_id: string;
  monto_pagado: number;
  cuota_numero: number;
  fecha_pago: string | null;
};

function normalizeServerPaymentFrequency(value: string | null | undefined): LoanFrequency {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

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

function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan credenciales de Supabase en el servidor.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function fetchDashboardData() {
  const supabase = createServerSupabaseClient();

  const [clientesResponse, prestamosResponse, pagosResponse, configResponse] = await Promise.all([
    supabase.from("clientes").select("*"),
    supabase.from("prestamos").select("*"),
    supabase.from("pagos").select("*"),
    supabase.from("configuracion_app").select("monto_inicial").eq("id", "principal").maybeSingle(),
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

  const clientes = (clientesResponse.data ?? []) as ClienteRow[];
  const pagos = (pagosResponse.data ?? []) as PagoRow[];
  const prestamos = ((prestamosResponse.data ?? []) as PrestamoRow[]).map((prestamo) => {
    const pagosPrestamo = pagos.filter((pago) => pago.prestamo_id === prestamo.id);
    const totalPagado = pagosPrestamo.reduce((sum, pago) => sum + Number(pago.monto_pagado ?? 0), 0);
    const saldoRestante = Math.max(Number(prestamo.total_a_pagar ?? 0) - totalPagado, 0);
    const frecuenciaPago = normalizeServerPaymentFrequency(
      prestamo.frecuencia_pago ?? prestamo.frecuencia ?? prestamo.modalidad_pago,
    );
    const porcentajeInteres =
      Number(prestamo.monto_prestado) > 0
        ? ((Number(prestamo.total_a_pagar) - Number(prestamo.monto_prestado)) /
            Number(prestamo.monto_prestado)) *
          100
        : 0;
    const overdueInfo = getLoanOverdueInfo({
      createdAt: prestamo.fecha_inicio,
      frecuenciaPago,
      cuotasPagadas: pagosPrestamo.length,
      saldoRestante,
    });

    return {
      ...prestamo,
      pagos_realizados: pagosPrestamo.length,
      saldo_restante: saldoRestante,
      porcentaje_interes: Math.round((porcentajeInteres + Number.EPSILON) * 100) / 100,
      estado_visible:
        saldoRestante <= 0
          ? "Pago de prestamo completado"
          : overdueInfo.isOverdue
            ? `Moroso - ${overdueInfo.overdueDays} dia${overdueInfo.overdueDays === 1 ? "" : "s"} de mora`
            : "Al dia",
    };
  });

  return {
    clientes,
    prestamos,
    pagos,
    montoInicial: Number(configResponse.data?.monto_inicial ?? 0),
  };
}

export async function cleanupOldData() {
  const supabase = createServerSupabaseClient();
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffIso = cutoff.toISOString();

  const pagosResponse = await supabase
    .from("pagos")
    .select("id,prestamo_id")
    .lt("fecha_pago", cutoffIso);

  if (pagosResponse.error) {
    throw pagosResponse.error;
  }

  const pagosIds = (pagosResponse.data ?? []).map((item) => item.id);

  if (pagosIds.length > 0) {
    const { error } = await supabase.from("pagos").delete().in("id", pagosIds);

    if (error) {
      throw error;
    }
  }

  const prestamosResponse = await supabase
    .from("prestamos")
    .select("id,cliente_id")
    .lt("fecha_inicio", cutoffIso);

  if (prestamosResponse.error) {
    throw prestamosResponse.error;
  }

  const prestamosIds = (prestamosResponse.data ?? []).map((item) => item.id);

  if (prestamosIds.length > 0) {
    const { error } = await supabase.from("prestamos").delete().in("id", prestamosIds);

    if (error) {
      throw error;
    }
  }

  const clientesResponse = await supabase
    .from("clientes")
    .select("id,nombre")
    .lt("fecha_registro", cutoffIso);

  if (clientesResponse.error) {
    throw clientesResponse.error;
  }

  let clientesEliminados = 0;

  for (const cliente of clientesResponse.data ?? []) {
    const remainingLoanResponse = await supabase
      .from("prestamos")
      .select("id")
      .eq("cliente_id", cliente.id)
      .limit(1);

    if (remainingLoanResponse.error) {
      throw remainingLoanResponse.error;
    }

    if ((remainingLoanResponse.data ?? []).length === 0) {
      const { error } = await supabase.from("clientes").delete().eq("id", cliente.id);

      if (error) {
        throw error;
      }

      clientesEliminados += 1;
    }
  }

  return {
    cutoffIso,
    pagosEliminados: pagosIds.length,
    prestamosEliminados: prestamosIds.length,
    clientesEliminados,
  };
}
