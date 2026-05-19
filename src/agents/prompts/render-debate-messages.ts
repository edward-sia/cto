import type { DebateMessage } from "../../types/index.js";

export const renderDebateMessages = (messages: DebateMessage[]) =>
  messages
    .map(
      (msg) =>
        `[${msg.role.toUpperCase()}]: ${msg.content}${
          msg.proposedAlternative
            ? `\n  → PROPOSED ALTERNATIVE: ${msg.proposedAlternative}`
            : ""
        }`
    )
    .join("\n\n");
