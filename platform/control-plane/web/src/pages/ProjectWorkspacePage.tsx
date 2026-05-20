import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import {
  Breadcrumbs,
  EmptyState,
  PageHeader,
  StatusBadge,
  Tabs,
  Toast,
} from "../components/chrome";
import type { Device, Project, RunSummary, TestCase, TestCycle } from "../types";

const TAB_IDS = ["cases", "import", "cycles", "execute", "runs"] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(x: string | null): x is TabId {
  return !!x && (TAB_IDS as readonly string[]).includes(x);
}

export function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabId = isTabId(tabParam) ? tabParam : "cases";

  const setTab = useCallback(
    (id: TabId) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("tab", id);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const pid = projectId!;

  const [project, setProject] = useState<Project | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [cycles, setCycles] = useState<TestCycle[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);

  const [title, setTitle] = useState("");
  const [stepAction, setStepAction] = useState("");
  const [stepExpected, setStepExpected] = useState("");
  const [stepData, setStepData] = useState("");
  const [caseSteps, setCaseSteps] = useState<
    { action: string; expected?: string; testData?: string }[]
  >([]);
  const [cycleName, setCycleName] = useState("");
  const [importSource, setImportSource] = useState<"qmetry" | "qmetry-jira-plugin">("qmetry");
  const [importFormat, setImportFormat] = useState<"json" | "csv">("json");
  const [importPayload, setImportPayload] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<string>("");
  const [selectedDevices, setSelectedDevices] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ msg: string; variant: "success" | "error" | "info" } | null>(
    null,
  );

  const showToast = useCallback((msg: string, variant: "success" | "error" | "info" = "success") => {
    setToast({ msg, variant });
    window.setTimeout(() => setToast(null), 5500);
  }, []);

  const reload = useCallback(() => {
    if (!pid) return;
    api<Project>(`/projects/${pid}`)
      .then(setProject)
      .catch(() => setProject(null));
    api<TestCase[]>(`/projects/${pid}/test-cases`).then(setCases).catch(() => setCases([]));
    api<TestCycle[]>(`/projects/${pid}/test-cycles`).then(setCycles).catch(() => setCycles([]));
    api<Device[]>("/devices").then(setDevices).catch(() => setDevices([]));
    api<RunSummary[]>(`/projects/${pid}/runs`).then(setRuns).catch(() => setRuns([]));
  }, [pid]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function addCase(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/projects/${pid}/test-cases`, {
        method: "POST",
        json: { title, stepsList: caseSteps, steps: "" },
      });
      setTitle("");
      setCaseSteps([]);
      setStepAction("");
      setStepExpected("");
      setStepData("");
      reload();
      showToast("Test case created.");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  function addStepDraft() {
    if (!stepAction.trim()) return;
    setCaseSteps((prev) => [
      ...prev,
      {
        action: stepAction.trim(),
        expected: stepExpected.trim() || undefined,
        testData: stepData.trim() || undefined,
      },
    ]);
    setStepAction("");
    setStepExpected("");
    setStepData("");
  }

  async function importCases(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/projects/${pid}/test-cases/import`, {
        method: "POST",
        json: {
          source: importSource,
          format: importFormat,
          payload: importPayload,
        },
      });
      setImportPayload("");
      reload();
      showToast("Imported test cases and cycles.");
      setTab("cycles");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function addCycle(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/projects/${pid}/test-cycles`, {
        method: "POST",
        json: { name: cycleName },
      });
      setCycleName("");
      reload();
      showToast("Test cycle created.");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function attachAllToCycle(cycleId: string) {
    try {
      await api(`/projects/${pid}/test-cycles/${cycleId}/items`, {
        method: "PUT",
        json: { testCaseIds: cases.map((c) => c.id) },
      });
      reload();
      showToast("Cycle updated with all cases in list order.");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function executeRun() {
    const devIds = Object.entries(selectedDevices)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!selectedCycle || devIds.length === 0) {
      showToast("Select a cycle and at least one device.", "error");
      return;
    }
    try {
      const run = await api<{ id: string }>(`/projects/${pid}/runs/execute`, {
        method: "POST",
        json: {
          cycleId: selectedCycle,
          deviceIds: devIds,
          idempotencyKey: `ui-${Date.now()}`,
        },
      });
      reload();
      showToast(`Run started · ${run.id}`);
      setTab("runs");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  async function cancelRun(runId: string) {
    try {
      await api(`/projects/${pid}/runs/${runId}/cancel`, { method: "POST" });
      reload();
      showToast("Run cancelled.");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  }

  const tabs = useMemo(
    () => [
      { id: "cases" as const, label: "Test cases" },
      { id: "import" as const, label: "Import" },
      { id: "cycles" as const, label: "Test cycles" },
      { id: "execute" as const, label: "Execute" },
      { id: "runs" as const, label: "Run history" },
    ],
    [],
  );

  const projectTitle = project?.name ?? "Project";

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Projects", to: "/projects" },
          { label: projectTitle },
        ]}
      />

      <PageHeader
        title={projectTitle}
        subtitle={
          project ? (
            <>
              Key <code className="key-chip">{project.slug}</code>
              {project.description ? (
                <>
                  {" "}
                  · <span className="muted">{project.description}</span>
                </>
              ) : null}
            </>
          ) : (
            "Loading project…"
          )
        }
      />

      <Toast
        message={toast?.msg ?? null}
        variant={toast?.variant === "error" ? "error" : toast?.variant === "info" ? "info" : "success"}
        onDismiss={() => setToast(null)}
      />

      <Tabs idPrefix="proj" tabs={tabs} active={activeTab} onChange={(id) => setTab(id as TabId)} />

      <div className="tab-panels">
        {activeTab === "cases" ? (
          <section
            id="proj-cases-panel"
            role="tabpanel"
            aria-labelledby="proj-cases-tab"
            className="card card--elevated tab-panel"
          >
            <h2 className="panel-heading">Test cases</h2>
            <p className="panel-lede muted">
              Define reusable scenarios with ordered steps — similar to detailed cases in QMetry or Zephyr-style Jira
              tests.
            </p>

            <form className="stack-form" onSubmit={(e) => void addCase(e)}>
              <div className="field-group">
                <label htmlFor="case-title">Summary</label>
                <input
                  id="case-title"
                  placeholder="Short title shown in lists"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <fieldset className="fieldset">
                <legend className="fieldset__legend">Steps</legend>
                <div className="step-builder-grid">
                  <input
                    aria-label="Step action"
                    placeholder="Action"
                    value={stepAction}
                    onChange={(e) => setStepAction(e.target.value)}
                  />
                  <input
                    aria-label="Expected result"
                    placeholder="Expected"
                    value={stepExpected}
                    onChange={(e) => setStepExpected(e.target.value)}
                  />
                  <input
                    aria-label="Test data"
                    placeholder="Data (optional)"
                    value={stepData}
                    onChange={(e) => setStepData(e.target.value)}
                  />
                  <button type="button" className="btn btn--secondary" onClick={addStepDraft}>
                    Add step
                  </button>
                </div>
              </fieldset>

              {caseSteps.length > 0 ? (
                <ol className="step-draft-list">
                  {caseSteps.map((s, idx) => (
                    <li key={`${idx}-${s.action}`}>
                      <span className="step-draft-list__num">{idx + 1}</span>
                      <div className="step-draft-list__body">
                        <div>{s.action}</div>
                        {s.expected ? <div className="muted small">Expect: {s.expected}</div> : null}
                        {s.testData ? <div className="muted small">Data: {s.testData}</div> : null}
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setCaseSteps((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}

              <button type="submit" className="btn btn--primary">
                Create test case
              </button>
            </form>

            <h3 className="subpanel-heading">Repository</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Summary</th>
                    <th scope="col">Steps</th>
                    <th scope="col">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td>{c.title}</td>
                      <td>{c.stepsList?.length ?? 0}</td>
                      <td>{c.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cases.length === 0 ? (
              <EmptyState title="No test cases" hint="Author steps above or use the Import tab." />
            ) : null}
          </section>
        ) : null}

        {activeTab === "import" ? (
          <section
            id="proj-import-panel"
            role="tabpanel"
            aria-labelledby="proj-import-tab"
            className="card card--elevated tab-panel"
          >
            <h2 className="panel-heading">Import from QMetry / Jira plugin</h2>
            <p className="panel-lede muted">
              Paste JSON or CSV exported from QMetry or the QMetry Jira app. Zeppole maps cases and inferred cycles from
              your payload.
            </p>
            <form className="stack-form" onSubmit={(e) => void importCases(e)}>
              <div className="inline-fields">
                <div className="field-group flex-1">
                  <label htmlFor="import-src">Source</label>
                  <select
                    id="import-src"
                    value={importSource}
                    onChange={(e) => setImportSource(e.target.value as "qmetry" | "qmetry-jira-plugin")}
                  >
                    <option value="qmetry">QMetry</option>
                    <option value="qmetry-jira-plugin">QMetry Jira plugin</option>
                  </select>
                </div>
                <div className="field-group flex-1">
                  <label htmlFor="import-fmt">Format</label>
                  <select
                    id="import-fmt"
                    value={importFormat}
                    onChange={(e) => setImportFormat(e.target.value as "json" | "csv")}
                  >
                    <option value="json">JSON</option>
                    <option value="csv">CSV</option>
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="import-body">Payload</label>
                <textarea
                  id="import-body"
                  className="textarea-block"
                  placeholder="Paste export payload…"
                  value={importPayload}
                  onChange={(e) => setImportPayload(e.target.value)}
                  required
                  rows={12}
                />
              </div>
              <button type="submit" className="btn btn--primary">
                Import
              </button>
            </form>
          </section>
        ) : null}

        {activeTab === "cycles" ? (
          <section
            id="proj-cycles-panel"
            role="tabpanel"
            aria-labelledby="proj-cycles-tab"
            className="card card--elevated tab-panel"
          >
            <h2 className="panel-heading">Test cycles</h2>
            <p className="panel-lede muted">
              Cycles group ordered cases for execution — analogous to test suites or fix-version scoped runs.
            </p>
            <form className="inline-form" onSubmit={(e) => void addCycle(e)}>
              <input
                className="flex-grow"
                placeholder="Cycle name (e.g. Sprint 42 regression)"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn--primary">
                Add cycle
              </button>
            </form>

            <ul className="entity-list">
              {cycles.map((c) => (
                <li key={c.id} className="entity-list__item">
                  <div>
                    <div className="entity-list__title">{c.name}</div>
                    <div className="muted small">Cycle ID · {c.id}</div>
                  </div>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={() => void attachAllToCycle(c.id)}>
                    Attach all cases
                  </button>
                </li>
              ))}
            </ul>
            {cycles.length === 0 ? (
              <EmptyState title="No cycles" hint="Create a cycle, then attach cases from your repository." />
            ) : null}
          </section>
        ) : null}

        {activeTab === "execute" ? (
          <section
            id="proj-execute-panel"
            role="tabpanel"
            aria-labelledby="proj-execute-tab"
            className="card card--elevated tab-panel"
          >
            <h2 className="panel-heading">Execute cycle</h2>
            <p className="panel-lede muted">
              Queue a distributed run against registered workers — pick a cycle and one or more devices.
            </p>
            <div className="field-group">
              <label htmlFor="exec-cycle">Cycle</label>
              <select
                id="exec-cycle"
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
              >
                <option value="">Select cycle…</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <fieldset className="fieldset">
              <legend className="fieldset__legend">Devices</legend>
              <div className="checkbox-grid">
                {devices.map((d) => (
                  <label key={d.id} className="checkbox-tile">
                    <input
                      type="checkbox"
                      checked={!!selectedDevices[d.id]}
                      onChange={(e) =>
                        setSelectedDevices((s) => ({ ...s, [d.id]: e.target.checked }))
                      }
                    />
                    <span>{d.name}</span>
                    <StatusBadge status={d.status} />
                  </label>
                ))}
              </div>
              {devices.length === 0 ? (
                <EmptyState
                  title="No devices registered"
                  hint={
                    <>
                      Register execution workers under <Link to="/devices">Devices</Link>.
                    </>
                  }
                />
              ) : null}
            </fieldset>
            <button type="button" className="btn btn--primary" onClick={() => void executeRun()}>
              Run cycle
            </button>
          </section>
        ) : null}

        {activeTab === "runs" ? (
          <section
            id="proj-runs-panel"
            role="tabpanel"
            aria-labelledby="proj-runs-tab"
            className="card card--elevated tab-panel"
          >
            <h2 className="panel-heading">Run history</h2>
            <p className="panel-lede muted">Recent executions for this project. Cancel runs that are still active.</p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Started</th>
                    <th scope="col">Run ID</th>
                    <th scope="col">Status</th>
                    <th scope="col">Jobs</th>
                    <th scope="col" className="col-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.createdAt).toLocaleString()}</td>
                      <td>
                        <code className="mono-ellipsis" title={r.id}>
                          {r.id}
                        </code>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        <ul className="job-inline-list">
                          {r.executionJobs.map((j) => (
                            <li key={j.id}>
                              {j.device.name}: <StatusBadge status={j.status} />
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="col-actions">
                        {["QUEUED", "RUNNING"].includes(r.status.toUpperCase()) ? (
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void cancelRun(r.id)}>
                            Cancel
                          </button>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {runs.length === 0 ? (
              <EmptyState title="No runs yet" hint="Execute a cycle from the Execute tab." />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
