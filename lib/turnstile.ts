import "server-only";

/**
 * Verificación server-side de Cloudflare Turnstile — ver
 * components/TurnstileWidget.tsx para el lado cliente. Sigue la guía oficial
 * (challenges.cloudflare.com/turnstile/v0/siteverify): token de un solo uso,
 * validado contra la API de Cloudflare antes de aceptar el envío.
 *
 * Fail-open si no está configurado (TURNSTILE_SECRET_KEY vacía) — mismo
 * espíritu que PUBLIC_API_KEY/ACOPIO_PIN: una feature nueva no debe romper
 * el flujo existente en quien clona el repo sin configurarla, pero acá
 * "fail-open" significa "no exigir el captcha", nunca "aceptar un token
 * inválido cuando sí está configurada".
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };

  if (!token || typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, error: "Verificación anti-spam faltante. Recargá la página e intentá de nuevo." };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, error: "No se pudo verificar el anti-spam. Probá de nuevo en un momento." };
    }
    const result = (await res.json()) as { success?: boolean };
    if (!result.success) {
      return { ok: false, error: "Verificación anti-spam inválida. Recargá la página e intentá de nuevo." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo verificar el anti-spam. Probá de nuevo en un momento." };
  }
}
