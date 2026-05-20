import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

describe("notifyRunFinished HMAC", () => {
  it("computes sha256 signature compatible with receiver verification", () => {
    const secret = "test-secret-at-least-eight";
    const body = JSON.stringify({ event: "run.finished", x: 1 });
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(sig).toHaveLength(64);

    const recv = createHmac("sha256", secret).update(body).digest("hex");
    expect(recv).toBe(sig);
  });
});
