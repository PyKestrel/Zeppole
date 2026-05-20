/**
 * Optional HTTP bridge that runs docker-android containers on a Docker host.
 * Set ZEPPOLE_EMULATOR_BRIDGE_URL and ZEPPOLE_EMULATOR_BRIDGE_TOKEN on the API.
 */

export function emulatorBridgeConfigured(): boolean {
  const url = process.env.ZEPPOLE_EMULATOR_BRIDGE_URL?.trim();
  const token = process.env.ZEPPOLE_EMULATOR_BRIDGE_TOKEN?.trim();
  return Boolean(url && token);
}

export async function emulatorBridgeKvmAvailable(): Promise<boolean> {
  if (!emulatorBridgeConfigured()) return false;
  const base = process.env.ZEPPOLE_EMULATOR_BRIDGE_URL!.replace(/\/$/, "");
  const token = process.env.ZEPPOLE_EMULATOR_BRIDGE_TOKEN!;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);
  try {
    const res = await fetch(`${base}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { kvmAvailable?: boolean };
    return Boolean(data.kvmAvailable);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type BridgeDeployRequest = {
  instanceId: string;
  name: string;
  emulatorDevice: string;
  image?: string;
  containerName: string;
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
