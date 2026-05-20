/**
 * Zeppole execution worker — polls the control plane for ExecutionJobs and reports results.
 * Configure real Appium / device hooks here; default behavior runs a deterministic stub.
 */
import fs from "node:fs";

const apiBase = (process.env.ZEPPOLE_API_URL ?? "http://127.0.0.1:4000/api/v1").replace(
  /\/$/,
  "",
);

function loadDeviceToken(): string {
  const file = process.env.ZEPPOLE_DEVICE_TOKEN_FILE?.trim();
  if (file) {
    try {
      const t = fs.readFileSync(file, "utf8").trim();
      if (t) return t;
    } catch {
      console.error(`Could not read ZEPPOLE_DEVICE_TOKEN_FILE: ${file}`);
    }
  }
  return process.env.ZEPPOLE_DEVICE_TOKEN ?? "";
}

const token = loadDeviceToken();

type CycleItem = { testCase: { id: string; title: string } };

type JobPayload = {
  id: string;
  run: {
    cycle: {
      items: CycleItem[];
    };
  };
};

async function heartbeat(): Promise<void> {
  await fetch(`${apiBase}/worker/heartbeat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "ONLINE" }),
  });
}

async function nextJob(): Promise<JobPayload | null> {
  const res = await fetch(`${apiBase}/worker/jobs/next`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`jobs/next ${res.status}`);
  return (await res.json()) as JobPayload;
}

async function complete(
  jobId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${apiBase}/worker/jobs/${jobId}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`complete failed: ${res.status} ${t}`);
  }
}

async function runStub(job: JobPayload): Promise<void> {
  const cases = job.run.cycle.items.map((i) => i.testCase);
  await new Promise((r) => setTimeout(r, 250));
  const results = cases.map((tc) => ({
    testCaseId: tc.id,
    status: "PASSED" as const,
    durationMs: 150,
    logs: `Zeppole worker stub OK — ${tc.title}`,
  }));
  await complete(job.id, { results });
}

async function loop(): Promise<void> {
  if (!token) {
    console.error("ZEPPOLE_DEVICE_TOKEN is required");
    process.exit(1);
  }

  setInterval(() => {
    void heartbeat().catch((e) => console.error("heartbeat", e));
  }, 15_000);

  for (;;) {
    try {
      await heartbeat();
      const job = await nextJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.info(`claimed job ${job.id}`);
      await runStub(job);
    } catch (e) {
      console.error(e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

void loop();
