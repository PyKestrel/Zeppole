import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("buildApp", () => {
  it(
    "responds on /health",
    async () => {
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { status: string };
      expect(body.status).toBe("ok");
      await app.close();
    },
    20_000,
  );
});
