/**
 * One-shot container entry: ensure admin exists, create automation device, write token for worker.
 * Idempotent via persisted volume file at TOKEN_PATH.
 */
import fs from "node:fs";
import path from "node:path";

const apiBase = (process.env.PREPARE_API_BASE ?? "http://api:4000").replace(/\/$/, "");
const v1 = `${apiBase}/api/v1`;
const tokenPath = process.env.TOKEN_PATH ?? "/runtime/device.token";
const adminEmail = (process.env.ZEPPOLE_ADMIN_EMAIL ?? "admin@zeppole.local")
  .toLowerCase()
  .trim();
const adminPassword = (process.env.ZEPPOLE_ADMIN_PASSWORD ?? "").replace(/^\uFEFF/, "").trim();
const deviceName = (process.env.ZEPPOLE_AUTOMATION_DEVICE_NAME ?? "Zeppole automation worker").trim();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHealth(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${apiBase}/health`);
      if (r.ok) return;
    } catch {
      /* ignore */
    }
    await sleep(2000);
  }
  throw new Error("API health check timed out");
}

function parseJsonSafe(text, context) {
  if (!text || !text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context}: non-JSON response: ${text.slice(0, 800)}`);
  }
}

async function jsonFetch(path, opts = {}) {
  const r = await fetch(`${v1}${path}`, {
    ...opts,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await r.text();
  const data = parseJsonSafe(text, path);
  if (!r.ok) {
    const err = (data && typeof data === "object" && "error" in data && data.error) || text || r.statusText;
    throw new Error(`${path} -> ${r.status}: ${err}`);
  }
  return data;
}

async function deleteDevice(deviceId, authHeader) {
  const r = await fetch(`${v1}/devices/${deviceId}`, {
    method: "DELETE",
    headers: { Accept: "application/json", Authorization: authHeader },
  });
  if (r.status !== 204 && !r.ok) {
    const t = await r.text();
    throw new Error(`DELETE device ${deviceId} -> ${r.status}: ${t}`);
  }
}

async function main() {
  if (fs.existsSync(tokenPath)) {
    const existing = fs.readFileSync(tokenPath, "utf8").trim();
    if (existing.length > 20) {
      console.info("prepare-worker: token file already present, skipping.");
      process.exit(0);
    }
  }

  if (!adminPassword || adminPassword.length < 8) {
    console.error(
      "prepare-worker: ZEPPOLE_ADMIN_PASSWORD must be set and at least 8 characters (check docker-compose env_file zeppole.autopilot.env).",
    );
    console.error(`prepare-worker: password length was ${adminPassword.length}.`);
    process.exit(1);
  }

  await waitHealth();

  const meta = await jsonFetch("/meta/bootstrap-needed");

  if (meta.bootstrapNeeded) {
    const r = await fetch(`${v1}/auth/bootstrap`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
        name: "Admin",
      }),
    });
    const t = await r.text();
    if (r.ok) {
      console.info("prepare-worker: initial admin created.");
    } else if (r.status === 403) {
      console.info("prepare-worker: bootstrap skipped (another process completed it).");
    } else {
      let msg = t.slice(0, 500);
      try {
        const err = JSON.parse(t);
        if (err && err.error) msg = err.error;
      } catch {
        /* keep raw */
      }
      throw new Error(`/auth/bootstrap -> ${r.status}: ${msg}`);
    }
  }

  const loginRes = await fetch(`${v1}/auth/login`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const loginText = await loginRes.text();
  const loginData = parseJsonSafe(loginText, "/auth/login");
  if (!loginRes.ok) {
    throw new Error(
      `/auth/login -> ${loginRes.status}: ${(loginData && loginData.error) || loginText}. ` +
        `If Postgres kept an old admin password, run "npm run zeppole:up -- --reset" or set ZEPPOLE_ADMIN_PASSWORD to match the existing account.`,
    );
  }
  const jwt = loginData.token;
  if (!jwt) {
    throw new Error("/auth/login: missing token in response");
  }

  const auth = `Bearer ${jwt}`;

  const devices = await jsonFetch("/devices", { headers: { Authorization: auth } });
  if (Array.isArray(devices)) {
    for (const d of devices) {
      if (d.name === deviceName) {
        console.info(`prepare-worker: removing stale device ${d.id}`);
        await deleteDevice(d.id, auth);
      }
    }
  }

  const created = await jsonFetch("/devices", {
    method: "POST",
    headers: { Authorization: auth },
    body: JSON.stringify({ name: deviceName }),
  });
  const apiToken = created.apiToken;
  if (!apiToken) {
    console.error("prepare-worker: API did not return apiToken.");
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, apiToken, { mode: 0o600 });
  console.info("prepare-worker: wrote device token for worker.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
