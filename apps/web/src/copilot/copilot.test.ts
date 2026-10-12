import { describe, expect, it } from "vitest";
import { extractSlotsFromText, detectIntentFromMessage } from "./slot-filler";
import { recordCorrection } from "./signals";
import { EMPTY_MEMORY } from "./types";
import { selectEpisodes } from "./few-shot";

describe("slot-filler", () => {
  it("extracts budget from message", () => {
    const slots = extractSlotsFromText("createProject", "budget 120000 €");
    expect(slots.budget).toBe(120000);
  });

  it("detects query intent", () => {
    expect(detectIntentFromMessage("Quels projets sont en rouge ?")).toBe("queryPortfolioHealth");
  });

  it("detects updateTask intent from WBS and percent", () => {
    expect(
      detectIntentFromMessage("Dans le projet SFOI, mets à jour les tâches 1.2 et 1.3 à 100%"),
    ).toBe("updateTask");
  });

  it("extracts percent and demand title", () => {
    const slots = extractSlotsFromText(
      "addDemand",
      "créer un nouveau pipeline de demande pour le projet TAP Axian",
    );
    expect(slots.title).toBe("TAP Axian");
    const pct = extractSlotsFromText("updateTask", "passer la tâche 1.2 à 100 %");
    expect(pct.percentComplete).toBe(100);
  });
});

describe("signals", () => {
  it("increments disambiguation count", () => {
    let m = EMPTY_MEMORY;
    m = recordCorrection(m, "Alpha", "proj-2", "project");
    m = recordCorrection(m, "Alpha", "proj-2", "project");
    expect(m.disambiguations[0]?.count).toBe(2);
  });
});

describe("few-shot", () => {
  it("selects episodes by intent", () => {
    const episodes = selectEpisodes(
      "createProject",
      "nouveau projet crm",
      [
        {
          id: "1",
          intent: "createProject",
          userMessages: ["crée projet crm"],
          finalSlots: {},
          outcome: "executed",
          at: "",
        },
        {
          id: "2",
          intent: "addRisk",
          userMessages: ["risque"],
          finalSlots: {},
          outcome: "executed",
          at: "",
        },
      ],
      2,
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.intent).toBe("createProject");
  });
});
