import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { EmptyState, PageHeader } from "../components/chrome";
import type { Project } from "../types";

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [query, setQuery] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Project[]>("/projects")
      .then(setProjects)
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [projects, query]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/projects", { method: "POST", json: { name, slug } });
      setName("");
      setSlug("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        subtitle="Organize test assets the way you would in QMetry or Jira — per product or release train."
        actions={
          <span className="toolbar-meta">{projects.length} project{projects.length === 1 ? "" : "s"}</span>
        }
      />

      <div className="layout-split">
        <section className="card card--elevated side-form" aria-labelledby="new-project-heading">
          <h2 id="new-project-heading" className="panel-heading">
            New project
          </h2>
          <form onSubmit={(e) => void create(e)}>
            <div className="field-group">
              <label htmlFor="proj-name">Display name</label>
              <input
                id="proj-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mobile checkout"
                required
              />
            </div>
            <div className="field-group">
              <label htmlFor="proj-slug">Key / slug</label>
              <input
                id="proj-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="checkout-app"
                autoComplete="off"
                required
              />
              <span className="field-hint">Lowercase letters, numbers, and hyphens. Used in URLs and automation.</span>
            </div>
            {err ? (
              <p className="field-error" role="alert">
                {err}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary btn--block">
              Create project
            </button>
          </form>
        </section>

        <section className="card card--elevated flex-grow">
          <div className="table-toolbar">
            <label className="sr-only" htmlFor="project-filter">
              Filter projects
            </label>
            <input
              id="project-filter"
              className="table-toolbar__search"
              type="search"
              placeholder="Filter by name, key, or description…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Key</th>
                  <th scope="col" className="col-actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="table-primary-link" to={`/projects/${p.id}`}>
                        {p.name}
                      </Link>
                      {p.description ? <div className="table-sub muted">{p.description}</div> : null}
                    </td>
                    <td>
                      <code className="key-chip">{p.slug}</code>
                    </td>
                    <td className="col-actions">
                      <Link className="btn btn--ghost btn--sm" to={`/projects/${p.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title={projects.length === 0 ? "No projects yet" : "No matches"}
              hint={
                projects.length === 0
                  ? "Create a project on the left to start authoring cases and cycles."
                  : "Try a different search term."
              }
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
