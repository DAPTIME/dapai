import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "about_dap_ai",
  title: "About DAP AI",
  description: "Return a short description of the DAP AI app, its models, and what it can do.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: [
          "DAP AI is a chat app with two models:",
          "- DAP AI 4 (pro): most capable, supports images.",
          "- DAP AI 4 Lite (free): fast, text-only responses.",
          "Both models are served from a local AI backend behind a relay.",
        ].join("\n"),
      },
    ],
  }),
});
