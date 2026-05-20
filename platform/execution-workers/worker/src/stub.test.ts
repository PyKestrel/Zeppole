import { describe, expect, it } from "vitest";

describe("worker stub", () => {
  it("maps cycle items", () => {
    const job = {
      run: {
        cycle: {
          items: [{ testCase: { id: "a", title: "t1" } }],
        },
      },
    };
    const cases = job.run.cycle.items.map((i) => i.testCase);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("a");
  });
});
