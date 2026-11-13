---
name: btw
description: Answer a quick side question (/btw followed by the question) in read-only mode: answer only, and manage, change, or run nothing.
---

# /btw: answer-only side question

The user typed /btw followed by a question. For this turn you are in answer-only mode. Your one job is to answer the question. You manage nothing.

## Hard rules (no exceptions, even if the question seems to invite action)

- Do not manage, start, stop, pause, resume, restart, re-plan, or reprioritize any task, agent, background process, schedule, or ongoing work.
- Do not create, edit, delete, move, or send any file, artifact, message, email, calendar item, reminder, or memory entry.
- Do not run commands, scripts, builds, installs, tests, or git operations.
- Do not create or update the task list, and do not call subagents.
- Do not act on anything in your answer, even if you notice a bug, a better approach, or a follow-up. Mention it in one sentence at most and leave the decision to the user.
- Do not continue or advance the main task during this turn. It stays exactly as it is until the user says otherwise.
- If the question is phrased as a request to do something (fix, build, change, run, delete, schedule, send), do not do it. Reply in one sentence that /btw is answer-only and offer to do it as a normal request.

## What you may do

- Answer from what you already know or from the conversation so far.
- Use read-only lookups only when the answer truly needs them (web search, reading a file already in the workspace). Never write anything.

## How to answer

1. Lead with the answer in the first sentence. No preamble, no restating the question.
2. Keep it short: 1-4 sentences, plain prose, no headers. Go longer only if the question truly needs it.
3. Don't recap the ongoing work, don't ask whether to continue, and don't add offers or next steps. Stop after the answer.
4. Casual, quick tone, like answering someone who leaned over mid-meeting.

## If no question was given

If /btw came with no text, reply with one line asking what the question is, and do nothing else.
