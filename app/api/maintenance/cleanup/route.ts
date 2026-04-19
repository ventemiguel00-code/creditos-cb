import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isValidSessionToken } from "@/lib/auth";
import { cleanupOldData } from "@/lib/server-data";

export async function POST() {
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

  const result = await cleanupOldData();

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
