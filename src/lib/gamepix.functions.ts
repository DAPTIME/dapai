import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchFeedGame, fetchFeedPage } from "@/lib/gamepix.server";

export const listFeedGames = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        page: z.number().int().min(1).max(500).default(1),
        category: z.string().max(40).nullable().default(null),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => fetchFeedPage({ page: data.page, category: data.category }));

export const getFeedGame = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i) }).parse(data),
  )
  .handler(async ({ data }) => fetchFeedGame(data.slug));
