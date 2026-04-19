import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const AUTH_COOKIE_NAME = "creditos_cb_session";
export const APP_CREDENTIALS_TABLE = "credenciales_app";
export const APP_CREDENTIALS_ROW_ID = "principal";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getEnvCredentials() {
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

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getStoredCredentials() {
  const fallback = getEnvCredentials();
  const adminClient = createServiceRoleClient();

  if (!adminClient) {
    return {
      username: fallback.username,
      passwordHash: sha256(fallback.password),
      secret: fallback.secret,
      source: "env" as const,
    };
  }

  const response = await adminClient
    .from(APP_CREDENTIALS_TABLE)
    .select("username,password_hash")
    .eq("id", APP_CREDENTIALS_ROW_ID)
    .maybeSingle();

  if (response.error || !response.data?.username || !response.data?.password_hash) {
    return {
      username: fallback.username,
      passwordHash: sha256(fallback.password),
      secret: fallback.secret,
      source: "env" as const,
    };
  }

  return {
    username: String(response.data.username),
    passwordHash: String(response.data.password_hash),
    secret: fallback.secret,
    source: "supabase" as const,
  };
}

export async function updateStoredPassword(newPassword: string) {
  const adminClient = createServiceRoleClient();

  if (!adminClient) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY. Configurala en Vercel para poder cambiar la clave desde la app.",
    );
  }

  const fallback = getEnvCredentials();
  const passwordHash = sha256(newPassword);

  const response = await adminClient.from(APP_CREDENTIALS_TABLE).upsert(
    {
      id: APP_CREDENTIALS_ROW_ID,
      username: fallback.username,
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "id",
    },
  );

  if (response.error) {
    throw response.error;
  }
}

function createSessionToken(username: string, passwordHash: string, secret: string) {
  return sha256(`${username}:${passwordHash}:${secret}`);
}

export async function buildSessionToken() {
  const credentials = await getStoredCredentials();
  return createSessionToken(
    credentials.username,
    credentials.passwordHash,
    credentials.secret,
  );
}

export async function isValidLogin(username: string, password: string) {
  const credentials = await getStoredCredentials();
  const currentPasswordHash = sha256(password);

  return (
    username.trim().toLowerCase() === credentials.username.trim().toLowerCase() &&
    currentPasswordHash === credentials.passwordHash
  );
}

export async function isValidSessionToken(token?: string | null) {
  if (!token) {
    return false;
  }

  const expected = Buffer.from(await buildSessionToken());
  const current = Buffer.from(token);

  if (expected.length !== current.length) {
    return false;
  }

  return timingSafeEqual(expected, current);
}

export async function validateCurrentPassword(password: string) {
  const credentials = await getStoredCredentials();
  return sha256(password) === credentials.passwordHash;
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
