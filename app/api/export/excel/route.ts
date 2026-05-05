import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { AUTH_COOKIE_NAME, isValidSessionToken } from "@/lib/auth";
import { formatDate, formatShortDate } from "@/lib/loan-utils";
import { fetchDashboardData, fetchMovementHistoryData } from "@/lib/server-data";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!(await isValidSessionToken(token))) {
    return NextResponse.json(
      {
        ok: false,
        message: "Tu sesion ya no es valida. Inicia sesion nuevamente.",
      },
      { status: 401 },
    );
  }

  const [{ clientes, prestamos, pagos, montoInicial }, historialMovimientos] = await Promise.all([
    fetchDashboardData(),
    fetchMovementHistoryData(),
  ]);

  const workbook = XLSX.utils.book_new();

  const resumen = [
    ["Reporte", "Creditos CB"],
    ["Fecha de exportacion", formatShortDate(new Date().toISOString())],
    ["Monto inicial", montoInicial],
    ["Clientes", clientes.length],
    ["Prestamos", prestamos.length],
    ["Pagos", pagos.length],
    ["Movimientos", historialMovimientos.length],
  ];
  const clientesSheet = clientes.map((cliente) => ({
    Nombre: cliente.nombre,
    Cedula: cliente.cedula ?? "",
    Direccion: cliente.direccion,
    Telefono: cliente.telefono,
    Correo: cliente.correo ?? "",
    FechaRegistro: formatShortDate(cliente.fecha_registro),
  }));
  const prestamosSheet = prestamos.map((prestamo) => ({
    MontoPrestado: prestamo.monto_prestado,
    TotalAPagar: prestamo.total_a_pagar,
    NumeroCuotas: prestamo.numero_cuotas,
    ValorCuota: prestamo.valor_cuota,
    Estado: prestamo.estado_visible,
    EstadoBase: prestamo.estado ?? "",
    PagosRealizados: prestamo.pagos_realizados,
    SaldoRestante: prestamo.saldo_restante,
    PorcentajeInteres: prestamo.porcentaje_interes,
    FechaInicio: formatShortDate(prestamo.fecha_inicio),
  }));
  const pagosSheet = pagos.map((pago) => ({
    MontoPagado: pago.monto_pagado,
    CuotaNumero: pago.cuota_numero,
    FechaPago: formatShortDate(pago.fecha_pago),
  }));
  const historialSheet = historialMovimientos.map((movimiento) => ({
    FechaHora: formatDate(movimiento.fecha_hora),
    Cliente: movimiento.cliente ?? "",
    Cedula: movimiento.cedula ?? "",
    PrestamoID: movimiento.prestamo_codigo ?? movimiento.prestamo_id ?? "",
    TipoMovimiento: movimiento.tipo_movimiento ?? "",
    ValorAnterior: movimiento.valor_anterior ?? "",
    ValorNuevo: movimiento.valor_nuevo ?? "",
    Descripcion: movimiento.descripcion ?? "",
    Usuario: movimiento.usuario ?? "",
  }));

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(clientesSheet),
    "Clientes",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(prestamosSheet),
    "Prestamos",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pagosSheet), "Pagos");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(historialSheet),
    "Historial",
  );

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="creditos-cb-reporte.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
