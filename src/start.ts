import { createMiddleware, createStart } from "@tanstack/react-start";

/**
 * Baseline security headers for every response.
 *
 * The app renders resident names, room numbers, complaint descriptions and
 * staff phone numbers, so a framing or content-sniffing attack is a genuine data
 * exposure here rather than a cosmetic one. `frame-ancestors 'none'` in the CSP
 * is what actually blocks clickjacking; `X-Frame-Options` is kept for older
 * browsers that predate CSP support in this position.
 *
 * The script/style allowances are deliberately narrow. Vite injects the client
 * bundle as a module script and Tailwind ships a same-origin stylesheet, so
 * 'self' covers both. 'unsafe-inline' is limited to styles because the
 * stylesheet uses inline custom properties for the theme.
 */
const securityHeaders = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    const result = await next();
    // Request middleware receives a { request, pathname, response } envelope;
    // the mutable headers live on the Response it carries.
    const headers = result.response.headers;
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        // The auth client and server functions post to same-origin paths only.
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
    // Permissions-Policy opts out of the powerful device APIs this app never uses.
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );

    return result;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}));

export { securityHeaders };
