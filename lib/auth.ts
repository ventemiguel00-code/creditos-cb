import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "creditos_cb_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getAppCredentials() {
  return {
    username:
      process.env.APP_USERNAME ??
      process.env.NEXT_PUBLIC_APP_USERNAME ??
      "CamiloBM",
    password:
      process.env.APP_PASSWORD ??
      process.env.NEXT_PUBLIC_APP_PASSWORD ??
      "12345678",
    secret:
      process.env.AUTH_SESSION_SECRET ??
      process.env.APP_PASSWORD ??
      process.env.NEXT_PUBLIC_APP_PASSWORD ??
      "creditos-cb-session-secret",
  };
}

export function buildSessionToken() {
  const { username, password, secret } = getAppCredentials();
  return sha256(`${username}:${password}:${secret}`);
}

export function isValidLogin(username: string, password: string) {
  const credentials = getAppCredentials();

  return (
    username.trim().toLowerCase() === credentials.username.trim().toLowerCase() &&
    password === credentials.password
  );
}

export function isValidSessionToken(token?: string | null) {
  if (!token) {
    return false;
  }

  const expected = Buffer.from(buildSessionToken());
  const current = Buffer.from(token);

  if (expected.length !== current.length) {
    return false;
  }

  return timingSafeEqual(expected, current);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}
