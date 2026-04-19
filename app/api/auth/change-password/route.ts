import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  buildSessionToken,
  getSessionCookieOptions,
  isValidSessionToken,
  updateStoredPassword,
  validateCurrentPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as
    | { currentPassword?: string; newPassword?: string; confirmPassword?: string }
    | null;

  const currentPassword = body?.currentPassword ?? "";
  const newPassword = body?.newPassword ?? "";
  const confirmPassword = body?.confirmPassword ?? "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      {
        ok: false,
        message: "Completa la clave actual, la nueva clave y la confirmacion.",
      },
      { status: 400 },
    );
  }

  if (!(await validateCurrentPassword(currentPassword))) {
    return NextResponse.json(
      {
        ok: false,
        message: "La clave actual no coincide.",
      },
      { status: 400 },
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      {
        ok: false,
        message: "La nueva clave debe tener al menos 6 caracteres.",
      },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      {
        ok: false,
        message: "La confirmacion de la clave no coincide.",
      },
      { status: 400 },
    );
  }

  await updateStoredPassword(newPassword);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    AUTH_COOKIE_NAME,
    await buildSessionToken(),
    getSessionCookieOptions(),
  );

  return response;
}
