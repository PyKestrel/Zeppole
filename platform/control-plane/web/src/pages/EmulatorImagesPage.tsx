import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, PageHeader, StatusBadge, Toast } from "../components/chrome";
import { IMAGE_BUILD_STEPS, LiveStatusPanel } from "../components/LiveStatusPanel";
import type { EmulatorImageBuild, EmulatorImagesLiveMeta, GoogleAemuCatalog } from "../types";

const POLL_MS = 2000;

export function EmulatorImagesPage() {
  const [catalog, setCatalog] = useState<GoogleAemuCatalog | null>(null);
  const [builds, setBuilds] = useState<EmulatorImageBuild[]>([]);
  const [live, setLive] = useState<EmulatorImagesLiveMeta | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; variant: "success" | "error" } | null>(null);
  const [builderConfigured, setBuilderConfigured] = useState(true);
  const [preflight, setPreflight] = useState<{
    ok: boolean;
    recommendedFreeGb: number;
    detail: string;
  } | null>(null);

  const [name, setName] = useState("Google API 34 Play");
  const [apiLevel, setApiLevel] = useState(34);
  const [codename, setCodename] = useState("U");
  const [systemImage, setSystemImage] = useState("google_apis_playstore");
  const [abi, setAbi] = useState("x86_64");
  const [channel, setChannel] = useState("stable");
  const [pageSize, setPageSize] = useState("");
  const [dockerTag, setDockerTag] = useState("zeppole-google:34-playstore");
  const [submitting, setSubmitting] = useState(false);

  const hasActiveBuild = builds.some((b) => b.status === "BUILDING");

  const selected = useMemo(
    () => builds.find((b) => b.id === selectedId) ?? builds.find((b) => b.status === "BUILDING") ?? builds[0],
    [builds, selectedId],
  );

  function showToast(msg: string, variant: "success" | "error" = "success") {
    setToast({ msg, variant });
    window.setTimeout(() => setToast(null), 8000);
  }

  const loadList = useCallback(() => {
    return api<{ builds: EmulatorImageBuild[]; live: EmulatorImagesLiveMeta }>("/emulator-images/builds")
      .then((r) => {
        setBuilds(r.builds);
        setLive(r.live);
        setSelectedId((prev) => {
          if (prev) return prev;
          const active = r.builds.find((b) => b.status === "BUILDING");
          return active?.id ?? r.builds[0]?.id ?? null;
        });
      })
      .catch((err: Error) => {
        showToast(err.message, "error");
        setBuilds([]);
        setLive(null);
      });
  }, []);

  const loadDetail = useCallback((buildId: string) => {
    return api<{ build: EmulatorImageBuild; live: EmulatorImagesLiveMeta }>(
      `/emulator-images/builds/${buildId}`,
    ).then((r) => {
      setBuilds((prev) => prev.map((b) => (b.id === buildId ? r.build : b)));
      setLive(r.live);
    });
  }, []);

  const load = useCallback(() => {
    void loadList();
    api<GoogleAemuCatalog>("/emulator-images/catalog")
      .then((c) => setCatalog(c))
      .catch((err: Error) => {
        setBuilderConfigured(false);
        showToast(err.message, "error");
      });
    api<{ ok: boolean; recommendedFreeGb: number; detail: string }>("/emulator-images/preflight")
      .then(setPreflight)
      .catch(() => setPreflight(null));
  }, [loadList]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedIsBuilding = selected?.status === "BUILDING";

  useEffect(() => {
    if (!hasActiveBuild && !selectedIsBuilding) return;
    const tick = () => {
      void loadList();
      if (selectedId && (hasActiveBuild || selectedIsBuilding)) {
        void loadDetail(selectedId);
      }
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [hasActiveBuild, selectedIsBuilding, selectedId, loadList, loadDetail]);

  useEffect(() => {
    const row = catalog?.apiLevels.find((a) => a.apiLevel === apiLevel);
    if (row) setCodename(row.codename);
  }, [apiLevel, catalog]);

  async function deleteBuild(buildId: string) {
    if (!window.confirm("Delete this build record and its log? The built Docker image is kept.")) return;
    try {
      await api(`/emulator-images/builds/${buildId}`, { method: "DELETE" });
      setSelectedId((prev) => (prev === buildId ? null : prev));
      showToast("Build entry removed.");
      await loadList();
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function clearFinishedBuilds() {
    const finished = builds.filter((b) => b.status !== "BUILDING");
    if (finished.length === 0) return;
    if (
      !window.confirm(
        `Delete ${finished.length} finished build record(s) and their logs? Built Docker images are kept.`,
      )
    )
      return;
    let failed = 0;
    for (const b of finished) {
      try {
        await api(`/emulator-images/builds/${b.id}`, { method: "DELETE" });
      } catch {
        failed += 1;
      }
    }
    setSelectedId(null);
    showToast(
      failed === 0
        ? `Removed ${finished.length} build entr${finished.length === 1 ? "y" : "ies"}.`
        : `Removed ${finished.length - failed}, ${failed} failed.`,
      failed === 0 ? "success" : "error",
    );
    await loadList();
  }

  async function startBuild(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api<{ build: EmulatorImageBuild }>("/emulator-images/builds", {
        method: "POST",
        json: {
          name,
          apiLevel,
          codename,
          systemImage,
          abi,
          emulatorChannel: channel,
          ...(pageSize ? { pageSize } : {}),
          dockerTag,
        },
      });
      setSelectedId(res.build.id);
      showToast("Build started. Live status updates every few seconds.");
      await loadList();
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Emulator images"
        subtitle="Build Google android-emulator-container-scripts images. Deploy adds a ws-scrcpy sidecar for browser display and control."
        actions={
          <Link to="/emulators" className="btn btn--secondary btn--sm">
            Deploy instances
          </Link>
        }
      />

      <Toast
        message={toast?.msg ?? null}
        variant={toast?.variant === "error" ? "error" : "success"}
        onDismiss={() => setToast(null)}
      />

      {preflight && !preflight.ok ? (
        <div className="callout callout--warn" role="status">
          <strong>Low disk on Docker host.</strong> Emulator image builds need about{" "}
          {preflight.recommendedFreeGb}GB free under <code>/var/lib/docker</code>.
        </div>
      ) : null}

      {!builderConfigured ? (
        <div className="callout callout--warn" role="status">
          <strong>Image builder is not available.</strong> Start the{" "}
          <code>google-emulator-builder</code> service.
        </div>
      ) : hasActiveBuild ? (
        <div className="callout callout--neutral" role="status">
          <strong>{live?.buildingCount ?? 1} build(s) in progress.</strong> Refreshes every {POLL_MS / 1000}s.
        </div>
      ) : (
        <div className="callout callout--neutral" role="status">
          Catalog from{" "}
          <code>emu-docker list</code> when online —{" "}
          <a href="https://github.com/google/android-emulator-container-scripts" target="_blank" rel="noreferrer">
            android-emulator-container-scripts
          </a>
          .
        </div>
      )}

      <div className="layout-split">
        <section className="card card--elevated side-form">
          <h2 className="panel-heading">New build</h2>
          <form onSubmit={(e) => void startBuild(e)}>
            <div className="field-group">
              <label htmlFor="img-name">Build name</label>
              <input id="img-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field-group">
              <label htmlFor="img-api">Android API level</label>
              <select id="img-api" value={apiLevel} onChange={(e) => setApiLevel(Number(e.target.value))}>
                {(catalog?.apiLevels ?? [{ apiLevel: 34, codename: "U", androidVersion: "14" }]).map((a) => (
                  <option key={a.apiLevel} value={a.apiLevel}>
                    API {a.apiLevel} (Android {a.androidVersion}, {a.codename})
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="img-sys">System image</label>
              <select id="img-sys" value={systemImage} onChange={(e) => setSystemImage(e.target.value)}>
                {(catalog?.systemImages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="img-abi">ABI</label>
              <select id="img-abi" value={abi} onChange={(e) => setAbi(e.target.value)}>
                {(catalog?.abis ?? [{ id: "x86_64", label: "x86_64" }]).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="img-channel">Emulator channel</label>
              <select id="img-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {(catalog?.emulatorChannels ?? [{ id: "stable", label: "Stable" }]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="img-pages">Page size</label>
              <select id="img-pages" value={pageSize} onChange={(e) => setPageSize(e.target.value)}>
                {(catalog?.pageSizes ?? [{ id: "", label: "4 KB (default)" }]).map((p) => (
                  <option key={p.id || "default"} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="img-tag">Docker tag</label>
              <input
                id="img-tag"
                value={dockerTag}
                onChange={(e) => setDockerTag(e.target.value)}
                placeholder="zeppole-google:34-playstore"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn--primary btn--block"
              style={{ marginTop: "1rem" }}
              disabled={!builderConfigured || submitting || preflight?.ok === false}
            >
              {submitting ? "Starting build…" : "Start build"}
            </button>
          </form>
        </section>

        <section className="card card--elevated flex-grow">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 className="panel-heading">Builds</h2>
            {builds.some((b) => b.status !== "BUILDING") ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void clearFinishedBuilds()}
                title="Delete all finished build records and logs (Docker images are kept)"
              >
                Clear finished
              </button>
            ) : null}
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Progress</th>
                  <th scope="col">Status</th>
                  <th scope="col">Image tag</th>
                  <th scope="col" className="col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {builds.map((b) => (
                  <tr
                    key={b.id}
                    className={selected?.id === b.id ? "data-table__row--selected" : undefined}
                    onClick={() => setSelectedId(b.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{b.name}</td>
                    <td>
                      {b.status === "BUILDING" ? (
                        <div className="table-sub">
                          <span className="live-status__inline-pulse" aria-hidden />
                          {b.phaseLabel ?? "Building"}
                        </div>
                      ) : (
                        <span className="muted small">{b.phaseLabel ?? "—"}</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td>
                      <code className="key-chip">{b.dockerTag}</code>
                    </td>
                    <td className="col-actions">
                      {b.status !== "BUILDING" ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteBuild(b.id);
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {builds.length === 0 ? (
            <EmptyState title="No builds yet" hint="Start a build, then deploy on the Emulators page." />
          ) : null}

          {selected ? (
            <div style={{ marginTop: "1.25rem" }}>
              <LiveStatusPanel
                title={selected.name}
                phaseLabel={selected.phaseLabel ?? selected.status}
                phaseId={selected.phase ?? "unknown"}
                steps={IMAGE_BUILD_STEPS}
                status={selected.status}
                elapsedSeconds={selected.elapsedSeconds ?? 0}
                lastLogLine={selected.lastLogLine}
                buildLog={selected.buildLog}
                errorMessage={selected.errorMessage}
                isLive={selected.status === "BUILDING" && Boolean(live?.builderReachable ?? live?.syncing)}
                builderDetail={live?.builderDetail}
                hint={
                  selected.status === "BUILDING"
                    ? "After platform-tools, docker may run quietly for 10–40 minutes. Heartbeat lines appear every 90s."
                    : selected.status === "SUCCEEDED"
                      ? `Deploy ${selected.dockerTag} on Emulators — ws-scrcpy opens on port 8000. In the UI choose proxy over adb.`
                      : undefined
                }
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
