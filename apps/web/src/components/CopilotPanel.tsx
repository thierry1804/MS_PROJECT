import { useCallback, useEffect, useState } from "react";
import { useMatch } from "react-router-dom";
import { CopilotMessage } from "./CopilotMessage";
import { CopilotQuestionField } from "./CopilotQuestionField";
import {
  appendMessage,
  createSession,
  markCancelled,
  markExecuted,
  setIntent,
  transitionToPreview,
} from "../copilot/session";
import { detectIntentFromMessage, extractSlotsFromText, inferFromPortfolio } from "../copilot/slot-filler";
import { callCopilotChat, mergeLlmIntoSession } from "../copilot/llm-bridge";
import { executeAction, getMissingSlots } from "../copilot/registry";
import { buildQuestionsForIntent } from "../copilot/question-policy";
import { applyMemoryMutator, getCachedMemory, loadCopilotMemory, recordSuccessfulExecution } from "../copilot/memory-client";
import { recordCancellation, recordQuestionAnswered } from "../copilot/signals";
import type { CopilotSession } from "../copilot/types";
import { useStore } from "../store";
import "../styles/copilot.css";

interface Props {
  onClose: () => void;
}

export function CopilotPanel({ onClose }: Props) {
  const portfolio = useStore((s) => s.portfolio);
  const getStore = useStore.getState;
  const projectMatch = useMatch("/projets/:projectId/*");
  const currentProjectId = projectMatch?.params.projectId;
  const [session, setSession] = useState<CopilotSession>(() => createSession());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadCopilotMemory();
  }, []);

  const processMessage = useCallback(
    async (text: string, baseSession: CopilotSession) => {
      let s = appendMessage(baseSession, "user", text);
      setLoading(true);

      const memory = getCachedMemory();
      let intent = s.intent ?? detectIntentFromMessage(text);
      const extracted = extractSlotsFromText(intent ?? "createProject", text);
      const inferred = inferFromPortfolio(
        intent ?? "createProject",
        extracted,
        portfolio,
        memory,
        text,
        currentProjectId,
      );

      if (intent) {
        s = setIntent(s, intent, { ...extracted, ...inferred });
      }

      const llm = await callCopilotChat(text, s, portfolio, memory);
      if (llm) {
        if (llm.intent && llm.confidence >= 0.5) {
          intent = llm.intent;
          const merged = { ...s.slots, ...llm.extractedSlots, ...extracted };
          const reinferred = inferFromPortfolio(llm.intent, merged, portfolio, memory, text, currentProjectId);
          s = setIntent(s, llm.intent, { ...merged, ...reinferred });
        } else {
          s = mergeLlmIntoSession(s, llm, portfolio, memory);
        }
        s = appendMessage(s, "assistant", llm.assistantMessage);
      } else if (intent) {
        s = appendMessage(
          s,
          "assistant",
          `Intent détecté : ${intent}. Complétez les informations demandées.`,
        );
      } else {
        s = appendMessage(
          s,
          "assistant",
          "Bonjour. Je peux consulter le portefeuille, gérer le RAID, le pipeline et le planning. Que souhaitez-vous faire ?",
        );
      }

      if (s.intent) {
        const missing = getMissingSlots(s.intent, s.slots);
        if (missing.length > 0) {
          const questions = buildQuestionsForIntent(s.intent, s.slots, portfolio, memory);
          s = { ...s, pendingQuestions: questions, phase: "gathering", preview: undefined };
        } else if (s.pendingQuestions.length === 0) {
          s = transitionToPreview(s, portfolio);
        }
      }

      setSession(s);
      setLoading(false);
    },
    [portfolio, currentProjectId],
  );

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    void processMessage(text, session);
  }

  function handleAnswer(_questionId: string, slotKey: string, value: unknown) {
    applyMemoryMutator((m) => recordQuestionAnswered(m, `${session.intent}.${slotKey}`));
    const memory = getCachedMemory();
    const slots = { ...session.slots, [slotKey]: value };
    const missing = session.intent ? getMissingSlots(session.intent, slots) : [];
    let s: CopilotSession = { ...session, slots, pendingQuestions: [] };
    if (session.intent && missing.length > 0) {
      s = {
        ...s,
        pendingQuestions: buildQuestionsForIntent(session.intent, slots, portfolio, memory),
        phase: "gathering",
        preview: undefined,
      };
    } else if (session.intent) {
      s = transitionToPreview(s, portfolio);
    }
    setSession(s);
  }

  function handleConfirm() {
    if (!session.intent || !session.preview) return;
    const missing = getMissingSlots(session.intent, session.slots);
    if (missing.length > 0) return;

    const result = executeAction(() => getStore(), session.intent, session.slots, { source: "copilot" });
    let s = markExecuted(session);

    if (result.type === "query") {
      s = appendMessage(s, "assistant", result.markdown);
    } else if (result.type === "mutation") {
      s = appendMessage(s, "assistant", result.message);
      applyMemoryMutator((m) => recordSuccessfulExecution(m, session.intent!, session.slots, session));
    } else {
      s = appendMessage(s, "assistant", result.message);
    }

    setSession({ ...createSession(), id: s.id, messages: s.messages, phase: "gathering" });
  }

  function handleCancel() {
    applyMemoryMutator((m) => recordCancellation(m, session));
    setSession(markCancelled(session));
  }

  return (
    <aside className="copilot-panel" aria-label="Copilot PMO">
      <header className="copilot-head">
        <h2>Copilot</h2>
        <button type="button" className="copilot-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>

      <div className="copilot-thread">
        {session.messages.length === 0 && (
          <p className="copilot-hint">
            Exemples : « Quels projets sont en rouge ? », « Crée un projet Demo », « Mets les tâches 1.2 et 1.3 à 100 % dans SFOI »
          </p>
        )}
        {session.messages.map((m, i) => (
          <CopilotMessage key={`${m.at}-${i}`} message={m} />
        ))}
        {loading && <p className="copilot-loading">Analyse…</p>}

        {session.pendingQuestions.map((q) => (
          <CopilotQuestionField
            key={q.id}
            question={q}
            onAnswer={(val) => handleAnswer(q.id, q.slotKey, val)}
          />
        ))}

        {session.phase === "preview" && session.preview && (
          <div className="copilot-preview">
            <strong>{session.preview.summary}</strong>
            {session.preview.details.map((d) => (
              <div key={d} className="copilot-preview-detail">
                {d}
              </div>
            ))}
            <div className="copilot-preview-actions">
              <button type="button" className="copilot-btn primary" onClick={handleConfirm}>
                Confirmer
              </button>
              <button type="button" className="copilot-btn ghost" onClick={handleCancel}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="copilot-foot">
        <textarea
          className="copilot-input copilot-compose"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Décrivez ce que vous voulez faire…"
          disabled={loading}
        />
        <button type="button" className="copilot-btn primary" onClick={handleSend} disabled={loading || !input.trim()}>
          Envoyer
        </button>
      </footer>
    </aside>
  );
}
