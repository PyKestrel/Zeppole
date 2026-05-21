/**
 * Optional HTTP bridge that runs docker-android containers on a Docker host.
 * Set ZEPPOLE_EMULATOR_BRIDGE_URL and ZEPPOLE_EMULATOR_BRIDGE_TOKEN on the API.
 */

export function emulatorBridgeConfigured(): boolean {
  const url = process.env.ZEPPOLE_EMULATOR_BRIDGE_URL?.trim();
  const token = process.env.ZEPPOLE_EMULATOR_BRIDGE_TOKEN?.trim();
  return Boolean(url && token);
}

export type EmulatorBridgeHealth = {
  reachable: boolean;
  kvmAvailable: boolean;
  detail?: string;
  lastError?: string;
};

export async function emulatorBridgeHealth(): Promise<EmulatorBridgeHealth> {
  if (!emulatorBridgeConfigured()) {
    return { reachable: false, kvmAvailable: false, detail: "Bridge URL/token not configured on API" };
  }
  const base = process.env.ZEPPOLE_EMULATOR_BRIDGE_URL!.replace(/\/$/, "");
  const token = process.env.ZEPPOLE_EMULATOR_BRIDGE_TOKEN!;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 120_000);
  try {
    const res = await fetch(`${base}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    });
    const text = await res.text();
    let data: { kvmAvailable?: boolean; kvm?: { detail?: string; lastError?: string } } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return {
        reachable: false,
        kvmAvailable: false,
        detail: `Bridge /health returned non-JSON (${res.status})`,
        lastError: text.slice(0, 200),
      };
    }
    if (!res.ok) {
      return {
        reachable: false,
        kvmAvailable: false,
        detail: `Bridge /health HTTP ${res.status}`,
        lastError: data.kvm?.lastError ?? text.slice(0, 200),
      };
    }
    return {
      reachable: true,
      kvmAvailable: Boolean(data.kvmAvailable),
      detail: data.kvm?.detail,
      lastError: data.kvm?.lastError,
    };
  } catch (e) {
    return {
      reachable: false,
      kvmAvailable: false,
      detail: "API could not reach emulator-bridge /health",
      lastError: (e as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function emulatorBridgeKvmAvailable(): Promise<boolean> {
  return (await emulatorBridgeHealth()).kvmAvailable;
}

export type BridgeDeployRequest = {
  instanceId: string;
  name: string;
  emulatorDevice?: string;
  image?: string;
  containerName: string;
  runtime?: "docker-android" | "google-aemu";
};

export type BridgeDeployResponse = {
  containerName: string;
  displayUrl: string;
  appiumUrl: string;
  dockerImage: string;
};

export type BridgeStopRequest = {
  containerName: string;
};

async function bridgeFetch<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const base = process.env.ZEPPOLE_EMULATOR_BRIDGE_URL!.replace(/\/$/, "");
  const token = process.env.ZEPPOLE_EMULATOR_BRIDGE_TOKEN!;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const msg = (data as { error?: string })?.error ?? res.statusText;
      throw new Error(msg);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function bridgeDeploy(req: BridgeDeployRequest): Promise<BridgeDeployResponse> {
  // First deploy may pull a large docker-android image.
  return bridgeFetch<BridgeDeployResponse>("/v1/deploy", req, 600_000);
}

export async function bridgeStop(req: BridgeStopRequest): Promise<void> {
  await bridgeFetch<{ ok: boolean }>("/v1/stop", req);
}
