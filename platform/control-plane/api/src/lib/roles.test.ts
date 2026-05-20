import { describe, expect, it } from "vitest";
import { can } from "./roles.js";

describe("can", () => {
  it("allows admin to manage users", () => {
    expect(can("ADMIN", "manage_users")).toBe(true);
    expect(can("VIEWER", "manage_users")).toBe(false);
  });

  it("allows qa_lead to manage projects", () => {
    expect(can("QA_LEAD", "manage_projects")).toBe(true);
    expect(can("AUTOMATION", "manage_projects")).toBe(false);
  });

  it("allows automation to execute runs", () => {
    expect(can("AUTOMATION", "execute_runs")).toBe(true);
    expect(can("VIEWER", "execute_runs")).toBe(false);
  });
});
