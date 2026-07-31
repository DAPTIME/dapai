import { defineMcp } from "@lovable.dev/mcp-js";
import aboutTool from "./tools/about";
import echoTool from "./tools/echo";

/**
 * The MCP endpoint is served at /mcp on the public site, so with no auth
 * config on the definition anyone who knows the URL can call the tools.
 * Bearer tokens are verified against the project's own GoTrue issuer —
 * the same one that mints the session JWTs the rest of the app uses — so
 * a caller has to present a real signed-in user's token to reach a tool.
 * Supabase stamps `aud: "authenticated"` on those tokens, which is what
 * acceptedAudiences pins.
 *
 * Both URLs are read from the environment rather than baked in: they
 * differ between the preview project and production, and this module is
 * loaded by the generated /mcp route on the server, where only
 * process.env is populated.
 *
 * If SUPABASE_URL is missing the issuer falls back to a host that can
 * never mint a token. defineMcp() validates at import, and this module
 * is in the SSR graph, so throwing here would take the whole site down
 * rather than just the MCP route — and an endpoint that rejects every
 * caller is the safe way to be misconfigured.
 */
const SUPABASE_URL = (
  import.meta.env?.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  ""
).replace(/\/+$/, "");

const SITE_URL = (
  import.meta.env?.VITE_SITE_URL ??
  process.env.SITE_URL ??
  "https://dapai.lovable.app"
).replace(/\/+$/, "");

export default defineMcp({
  name: "dap-ai-mcp",
  title: "DAP AI",
  version: "0.1.0",
  auth: {
    type: "oauth",
    issuer: SUPABASE_URL
      ? `${SUPABASE_URL}/auth/v1`
      : "https://supabase-url-not-configured.invalid/auth/v1",
    resource: `${SITE_URL}/mcp`,
    acceptedAudiences: ["authenticated"],
    resourceName: "DAP AI",
  },
  instructions:
    "Tools for the DAP AI app. Use `echo` to verify connectivity and `about_dap_ai` to describe the app and its available models.",
  tools: [echoTool, aboutTool],
});
