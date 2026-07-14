import { useEffect } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { onAiReply } from "@/lib/ai-reply-notifier";

export function AiReplyListener() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    return onAiReply(({ chatId, title, preview }) => {
      // Only nudge the user when they're NOT already reading that chat.
      if (pathname === `/c/${chatId}`) return;
      toast(`💬 ${title || "New reply"}`, {
        description: preview || "DAP AI just replied.",
        position: "top-center",
        duration: 5000,
        action: {
          label: "Open",
          onClick: () =>
            navigate({ to: "/c/$threadId", params: { threadId: chatId } }),
        },
      });
    });
  }, [pathname, navigate]);
  return null;
}
