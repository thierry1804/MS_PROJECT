import type { CopilotMessage as CopilotMessageType } from "../copilot/types";

export function CopilotMessage({ message }: { message: CopilotMessageType }) {
  const isUser = message.role === "user";
  return (
    <div className={`copilot-msg copilot-msg-${message.role}`}>
      <div className="copilot-msg-bubble">{message.content}</div>
    </div>
  );
}
