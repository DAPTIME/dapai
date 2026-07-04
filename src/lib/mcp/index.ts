import { defineMcp } from "@lovable.dev/mcp-js";
import aboutTool from "./tools/about";
import echoTool from "./tools/echo";

export default defineMcp({
  name: "dap-ai-mcp",
  title: "DAP AI",
  version: "0.1.0",
  instructions:
    "Tools for the DAP AI app. Use `echo` to verify connectivity and `about_dap_ai` to describe the app and its available models.",
  tools: [echoTool, aboutTool],
});
