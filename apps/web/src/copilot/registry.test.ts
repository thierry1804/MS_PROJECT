import { describe, expect, it, vi } from "vitest";
import { getMissingSlots, executeAction } from "./registry";
import { buildPreview } from "./preview";
import { deriveProjectCode } from "./uid";

describe("copilot registry", () => {
  it("getMissingSlots for createProject", () => {
    const missing = getMissingSlots("createProject", { name: "CRM" });
    expect(missing.some((m) => m.key === "manager")).toBe(true);
    expect(missing.some((m) => m.key === "budget")).toBe(true);
  });

  it("buildPreview marks deleteProject as destructive", () => {
    const p = buildPreview("deleteProject", { projectId: "x" });
    expect(p.destructive).toBe(true);
    expect(p.requiresConfirmation).toBe(true);
  });

  it("deriveProjectCode from name", () => {
    expect(deriveProjectCode("CRM Migration")).toBe("CM");
  });

  it("executeAction createProject calls store", () => {
    const createProject = vi.fn(() => "proj-1");
    const result = executeAction(
      () =>
        ({
          portfolio: { projects: [], resources: [], demands: [] },
          createProject,
        }) as never,
      "createProject",
      { name: "Test", manager: "Alice", budget: 1000, code: "TST" },
    );
    expect(createProject).toHaveBeenCalledOnce();
    expect(result.type).toBe("mutation");
  });
});
