import { describe, expect, it } from "vitest";
import { validateWorkerResultsAgainstCycle } from "./cycleValidation.js";

describe("validateWorkerResultsAgainstCycle", () => {
  it("accepts matching sets", () => {
    const r = validateWorkerResultsAgainstCycle(
      ["a", "b"],
      ["b", "a"],
    );
    expect(r.ok).toBe(true);
  });

  it("rejects wrong count", () => {
    const r = validateWorkerResultsAgainstCycle(["a"], ["a", "b"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Expected 1/);
  });

  it("rejects missing id", () => {
    const r = validateWorkerResultsAgainstCycle(["a", "b"], ["a", "c"]);
    expect(r.ok).toBe(false);
  });
});
