const LITE_FALLBACK_REPLY = "I’m here. How can I help?";

const directReplyWords =
  "hey|hi|hello|sure|absolutely|yes|no|thanks|you(?:'|’)re welcome|here(?:'|’)s|here is|got it|okay|of course|sorry|i(?:'|’)m sorry|let(?:'|’)s|you can|try|use|open|click|select";

const directReplyCue = new RegExp(`\\b(?:${directReplyWords})\\b`, "i");
const directReplyStartCue = new RegExp(
  `(?:^|[\\n.!?]\\s*)(?:${directReplyWords})\\b`,
  "i"
);

const reasoningLeakRe =
  /<\/?(?:think|thinking|reasoning)\b|\|begin_of_(?:thought|reasoning)\||(?:^|\n)\s*(?:thinking|thought|reasoning|analysis|scratchpad)\s*:|\b(?:the user\s+(?:said|asked|wants|needs|provided|sent|input|is\s+(?:asking|saying|sending|looking))|user (?:message|input|said|sent|asked)\b|this (?:is\s+)?(?:likely|probably|appears|seems|looks like)\b|(?:very\s+)?short input\b|i\s+(?:need|should|will|must|have to|am going)\b|i['’]ll\b|(?:as per|per|according to|based on|following)\b)/i;

const leakedThoughtSentenceRe =
  /(?:^|[\s\n])(?:[-*]\s*)?(?:the user\s+(?:said|asked|wants|needs|provided|sent|input|is\s+(?:asking|saying|sending|looking))|user (?:message|input|said|sent|asked)\b|this (?:is\s+)?(?:likely|probably|appears|seems|looks like)\b|i\s+(?:need|should|will|must|have to|am going)\b|i['’]ll\b|(?:as per|per|according to|based on|following)\b|(?:my|the)\s+(?:response|reply)\b|my\s+answer\b)[^.!?\n]*(?:[.!?]+|\n|$)/gi;

export function hasLiteReasoningLeak(text: string): boolean {
  return reasoningLeakRe.test(text);
}

function directReplyIndex(text: string): number {
  const match = directReplyStartCue.exec(text);
  if (!match) return -1;
  const cue = directReplyCue.exec(match[0]);
  return (match.index ?? 0) + (cue?.index ?? 0);
}

export function sanitizeLiteReply(text: string): string {
  let out = String(text ?? "")
    .replace(/```(?:analysis|reasoning|thinking|system)[\s\S]*?```/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, "")
    .replace(/<reasoning\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<\|begin_of_thought\|>[\s\S]*?<\|end_of_thought\|>/gi, "")
    .replace(/\|begin_of_thought\|[\s\S]*?\|end_of_thought\|/gi, "")
    .replace(/<\|begin_of_reasoning\|>[\s\S]*?<\|end_of_reasoning\|>/gi, "")
    .replace(/\|begin_of_reasoning\|[\s\S]*?\|end_of_reasoning\|/gi, "")
    // Strip echoed system-prompt blocks. If the model repeats one of our
    // internal system tags or rule headers, drop everything up through
    // the end of that block.
    .replace(/\[Auto-tuned prompt[\s\S]*?\][\s\S]*?(?:\n\n|$)/gi, "")
    .replace(/^[\s\S]*?Accuracy rules:[\s\S]*?(?:\n\n|$)/i, "")
    .replace(/^[\s\S]*?What you remember about this user[\s\S]*?(?:\n\n|$)/i, "")
    .replace(/^[\s\S]*?You are DAP AI[\s\S]*?(?:\n\n|$)/i, "")
    .replace(/^[\s\S]*?\[DAP:[^\]]*\][\s\S]*?(?:\n\n|$)/i, "");



  const finalMarkers = Array.from(
    out.matchAll(/(?:^|\n)\s*(?:final(?: answer)?|answer|response)\s*:\s*/gi)
  );
  if (finalMarkers.length > 0) {
    const last = finalMarkers[finalMarkers.length - 1];
    out = out.slice((last.index ?? 0) + last[0].length);
  }

  const directStart = directReplyIndex(out);
  if (directStart > 0 && reasoningLeakRe.test(out.slice(0, directStart))) {
    out = out.slice(directStart);
  }

  if (reasoningLeakRe.test(out)) {
    const nextDirectStart = directReplyIndex(out);
    if (nextDirectStart > 0) out = out.slice(nextDirectStart);
  }

  const metaLeadRe =
    /^\s*(?:[-*]\s*)?(?:the user\s+(?:said|asked|wants|needs|provided|sent|input|is\s+(?:asking|saying|sending|looking))|user (?:message|input|said|sent|asked)\b|this (?:is\s+)?(?:likely|probably|appears|seems|looks like)\b|i\s+(?:need|should|will|must|have to|am going)\b|i['’]ll\b|(?:as per|per|according to|based on|following)\b|(?:my|the)\s+(?:response|reply)\b|my\s+answer\b)[\s\S]{0,600}?(?:[.!?]["'’\])]*\s+|:\s*|\n+)/i;

  let guard = 0;
  while (metaLeadRe.test(out) && guard++ < 20) {
    out = out.replace(metaLeadRe, "").replace(/^\s*["'’\])}.]+\s*/, "");
  }

  out = out.replace(leakedThoughtSentenceRe, " ");
  out = out.replace(/\s+([.,!?;:])/g, "$1").replace(/([.!?])(?=\S)/g, "$1 ");

  return out.trim() || LITE_FALLBACK_REPLY;
}