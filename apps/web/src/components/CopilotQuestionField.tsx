import { useState } from "react";
import type { CopilotQuestion } from "../copilot/types";

interface Props {
  question: CopilotQuestion;
  onAnswer: (value: unknown) => void;
}

export function CopilotQuestionField({ question, onAnswer }: Props) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});

  if (question.type === "boolean") {
    return (
      <div className="copilot-question">
        <p>{question.text}</p>
        <div className="copilot-question-actions">
          <button type="button" className="copilot-btn" onClick={() => onAnswer(true)}>
            Oui
          </button>
          <button type="button" className="copilot-btn ghost" onClick={() => onAnswer(false)}>
            Non
          </button>
        </div>
      </div>
    );
  }

  if (question.type === "scale") {
    return (
      <div className="copilot-question">
        <p>{question.text}</p>
        <input
          type="range"
          min={0}
          max={5}
          defaultValue={3}
          onChange={(e) => onAnswer(Number(e.target.value))}
        />
      </div>
    );
  }

  if (question.type === "choice" && question.choices?.length) {
    return (
      <div className="copilot-question">
        <p>{question.text}</p>
        <select
          className="copilot-select"
          defaultValue=""
          onChange={(e) => e.target.value && onAnswer(e.target.value)}
        >
          <option value="" disabled>
            Choisir…
          </option>
          {question.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (question.type === "checklist" && question.checklistItems?.length) {
    return (
      <div className="copilot-question">
        <p>{question.text}</p>
        <ul className="copilot-checklist">
          {question.checklistItems.map((item) => (
            <li key={item}>
              <label>
                <input
                  type="checkbox"
                  checked={checklist[item] ?? false}
                  onChange={(e) => {
                    const next = { ...checklist, [item]: e.target.checked };
                    setChecklist(next);
                    const selected = Object.entries(next)
                      .filter(([, v]) => v)
                      .map(([k]) => k);
                    onAnswer(selected);
                  }}
                />
                {item}
              </label>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="copilot-question">
      <p>{question.text}</p>
      <input
        type="text"
        className="copilot-input"
        onKeyDown={(e) => {
          if (e.key === "Enter") onAnswer((e.target as HTMLInputElement).value);
        }}
        placeholder="Répondre…"
      />
    </div>
  );
}
