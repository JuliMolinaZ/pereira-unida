/** WebViews de Instagram/Facebook: un hilo, poca RAM y esperan el HTML. */
export function isInAppBrowser(userAgent = ""): boolean {
  const ua = userAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");
  return /Instagram|FBAN|FBAV|FB_IAB|Line\//i.test(ua);
}
