import { NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  buildSessionToken,
  getSessionCookieOptions,
  isValidLogin,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { username?: string; password?: string }
    | null;

  const username = body?.username ?? "";
  const password = body?.password ?? "";

  if (!(await isValidLogin(username, password))) {
    return NextResponse.json(
      {
        ok: false,
        message: "Usuario o clave incorrectos.",
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    AUTH_COOKIE_NAME,
    await buildSessionToken(),
    getSessionCookieOptions(),
  );

  return response;
}
