const LITE_FALLBACK_REPLY = "I’m here. How can I help?";

const directReplyCue =
  /\b(?:hey|hi|hello|sure|absolutely|yes|no|thanks|you(?:'|’)re welcome|here(?:'|’)s|here is|got it|okay|of course|sorry|i(?:'|’)m sorry|let(?:'|’)s|you can|try|use|open|click|select)\b/i;

const reasoningLeakRe =
  /<\/?(?:think|thinking|reasoning)\b|\|begin_of_(?:thought|reasoning)\||(?:^|\n)\s*(?:thinking|thought|reasoning|analysis|scratchpad)\s*:|^\s*(?:the user\s+(?:said|asked|wants|needs|provided)|user message\b|i\s+(?:need|should|will|must|have to|can|want|am going|would)\b|i['’]ll\b|(?:as per|per|according to|based on|following)\b)/i;

export function hasLiteReasoningLeak(text: string): boolean {
  return reasoningLeakRe.test(text);
}

export function sanitizeLiteReply(text: string): string {
  let out = String(text ?? "")
    .replace(/```(?:analysis|reasoning|thinking)[\s\S]*?```/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<reasoning\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, "")
    .replace(/\|begin_of_thought\|[\s\S]*?\|end_of_thought\|/gi, "")
    .replace(/<\|begin_of_reasoning\|>[\s\S]*?<\|end_of_reasoning\|>/gi, "")
    .replace(/\|begin_of_reasoning\|[\s\S]*?\|end_of_reasoning\|/gi, "");

  const finalMarkers = Array.from(
    out.matchAll(/(?:^|\n)\s*(?:final(?: answer)?|answer|response)\s*:\s*/gi)
  );
  if (finalMarkers.length > 0) {
    const last = finalMarkers[finalMarkers.length - 1];
    out = out.slice((last.index ?? 0) + last[0].length);
  }

  if (reasoningLeakRe.test(out)) {
    const directStart = out.search(directReplyCue);
    if (directStart > 0) out = out.slice(directStart);
  }

  const metaLeadRe =
    /^\s*(?:[-*]\s*)?(?:the user\s+(?:said|asked|wants|needs|provided|is asking|is looking)|user message\b|i\s+(?:need|should|will|must|have to|can|want|am going|would)\b|i['’]ll\b|(?:as per|per|according to|based on|following)\b|(?:my|the)\s+(?:response|reply|answer)\b)[\s\S]{0,600}?(?:[.!?]["'’\])]*\s+|:\s*|\n+)/i;

  let guard = 0;
  while (metaLeadRe.test(out) && guard++ < 20) {
    out = out.replace(metaLeadRe, "").replace(/^\s*["'’\])}.]+\s*/, "");
  }

  return out.trim() || LITE_FALLBACK_REPLY;
}