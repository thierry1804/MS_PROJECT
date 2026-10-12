import { vi } from "vitest";

if (typeof window === "undefined") {
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

if (typeof fetch === "undefined") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => null,
    })),
  );
}
