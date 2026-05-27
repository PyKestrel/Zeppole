/**
 * HTTP client for zeppole-google-emulator-builder (Google aemu image builds).
 */

export function imageBuilderConfigured(): boolean {
  const url = process.env.ZEPPOLE_IMAGE_BUILDER_URL?.trim();
  const token = process.env.ZEPPOLE_IMAGE_BUILDER_TOKEN?.trim();
  return Boolean(url && token);
}

export type ImageBuildJob = {
  buildId: string;
  apiLevel: number;
  codename: string;
  systemImage: string;
  abi: string;
  emulatorChannel: string;
  pageSize: string;
  dockerTag: string;
};

async function builderFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.ZEPPOLE_IMAGE_BUILDER_URL!.replace(/\/$/, "");
  const token = process.env.ZEPPOLE_IMAGE_BUILDER_TOKEN!;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error ?? res.statusText);
  }
  return data as T;
}

export async function fetchImageBuilderCatalog(): Promise<unknown> {
  return builderFetch("/v1/catalog");
}

export async function fetchImageBuilderPreflight(): Promise<{
  ok: boolean;
  recommendedFreeGb: number;
  detail: string;
}> {
  return builderFetch("/v1/preflight");
}

export async function startImageBuild(job: ImageBuildJob): Promise<void> {
  await builderFetch("/v1/build", { method: "POST", body: JSON.stringify(job) });
}

export async function pollImageBuild(buildId: string): Promise<{
  status: string;
  logTail: string;
  phase?: string;
}> {
  return builderFetch(`/v1/build/${buildId}`);
}

export async function imageBuilderHealth(): Promise<{ reachable: boolean; detail?: string }> {
  try {
    const base = process.env.ZEPPOLE_IMAGE_BUILDER_URL!.replace(/\/$/, "");
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { reachable: false, detail: `HTTP ${res.status}` };
    return { reachable: true, detail: "Builder online" };
  } catch (e) {
    return { reachable: false, detail: (e as Error).message };
  }
}
