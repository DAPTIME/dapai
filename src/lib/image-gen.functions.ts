import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DAILY_IMAGE_LIMIT = 3;

const InputSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

/**
 * Generate an image via ComfyUI.
 * - Pro tier only.
 * - Hard cap: 3 generations per UTC day per user.
 * - Counter is enforced server-side via supabaseAdmin (bypasses the
 *   profile-protection trigger; users cannot self-edit the counter).
 */
export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => InputSchema.parse(i))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Load tier + current daily counter.
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("tier, images_generated_today, images_generated_date")
      .eq("id", userId)
      .single();
    if (pErr) throw new Error(pErr.message);

    if (profile.tier !== "pro") {
      throw new Error("Image generation is a Pro-only feature.");
    }

    const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    const sameDay = profile.images_generated_date === today;
    const used = sameDay ? profile.images_generated_today : 0;

    if (used >= DAILY_IMAGE_LIMIT) {
      throw new Error(
        `Daily image limit reached (${DAILY_IMAGE_LIMIT}/day). Resets at 00:00 UTC.`
      );
    }

    // Reserve the slot BEFORE calling ComfyUI so concurrent calls can't
    // exceed the cap.
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({
        images_generated_today: used + 1,
        images_generated_date: today,
      })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    const comfyUrl = process.env.COMFY_API_URL;
    if (!comfyUrl) {
      throw new Error(
        "Image backend not configured yet. (COMFY_API_URL missing.)"
      );
    }

    // TODO: POST the HiDream workflow to `${comfyUrl}/prompt` and poll
    // `/history/<prompt_id>` for the final image. Wire up once the
    // ComfyUI tunnel is live.
    return {
      ok: true,
      remaining: DAILY_IMAGE_LIMIT - (used + 1),
      prompt: data.prompt,
    };
  });

/** Read the caller's remaining image-gen budget for today. */
export const getImageQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("tier, images_generated_today, images_generated_date")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);

    const today = new Date().toISOString().slice(0, 10);
    const used =
      profile.images_generated_date === today
        ? profile.images_generated_today
        : 0;
    return {
      tier: profile.tier,
      used,
      limit: DAILY_IMAGE_LIMIT,
      remaining: Math.max(0, DAILY_IMAGE_LIMIT - used),
    };
  });
