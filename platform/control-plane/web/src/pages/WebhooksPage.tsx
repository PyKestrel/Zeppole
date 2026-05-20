import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { EmptyState, PageHeader } from "../components/chrome";

type WebhookRow = { id: string; url: string; events: string[]; active: boolean };

export function WebhooksPage() {
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<WebhookRow[]>("/webhooks").then(setHooks).catch(() => setHooks([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/webhooks", {
        method: "POST",
        json: { url, secret, events: ["run.finished", "run.completed"] },
      });
      setUrl("");
      setSecret("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Webhooks"
        subtitle="Receive signed callbacks when runs finish. Verify payloads with HMAC-SHA256 using your shared secret."
      />

      <section className="card card--elevated">
        <h2 className="panel-heading">Add endpoint</h2>
        <form className="stack-form stack-form--narrow" onSubmit={(e) => void add(e)}>
          <div className="field-group">
            <label htmlFor="hook-url">HTTPS URL</label>
            <input
              id="hook-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://integrations.example.com/zeppole"
              required
            />
          </div>
          <div className="field-group">
            <label htmlFor="hook-secret">Signing secret</label>
            <input
              id="hook-secret"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
              required
            />
            <span className="field-hint">Stored server-side and used for HMAC signatures only.</span>
          </div>
          {err ? (
            <p className="field-error" role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" className="btn btn--primary">
            Register webhook
          </button>
        </form>
      </section>

      <section className="card card--elevated">
        <h2 className="panel-heading">Configured endpoints</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">URL</th>
                <th scope="col">Events</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id}>
                  <td>
                    <span className="mono-ellipsis" title={h.url}>
                      {h.url}
                    </span>
                  </td>
                  <td>{h.events.join(", ")}</td>
                  <td>{h.active ? <span className="status-badge status-badge--ok">Active</span> : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hooks.length === 0 ? (
          <EmptyState title="No webhooks" hint="Add an HTTPS endpoint to receive run notifications." />
        ) : null}
      </section>
    </div>
  );
}
