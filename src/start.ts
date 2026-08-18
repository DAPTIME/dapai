import {
  createStart,
  createMiddleware,
  createCsrfMiddleware,
} from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    // Server functions have their own structured error protocol. Returning an
    // HTML error page here makes useServerFn lose the real message and show a
    // generic "something went wrong" instead.
    if (new URL(request.url).pathname.startsWith("/_serverFn/")) {
      throw error;
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/* Server functions are same-origin RPC endpoints, so cross-site requests to
   them are rejected. Public API routes (webhooks, /api/public/*) are left
   alone — they authenticate their callers themselves. */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
