import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconChevronRight } from "./Icons";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <div className="page-subtitle">{subtitle}</div> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`}>
            {i > 0 ? <IconChevronRight className="breadcrumbs__sep" /> : null}
            {item.to ? (
              <Link to={item.to} className="breadcrumbs__link">
                {item.label}
              </Link>
            ) : (
              <span className={i === items.length - 1 ? "breadcrumbs__current" : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p className="empty-state__title">{title}</p>
      {hint ? <p className="empty-state__hint">{hint}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  let tone: "neutral" | "ok" | "warn" | "bad" | "info" = "neutral";
  if (["PASSED", "ONLINE", "ACTIVE", "COMPLETED", "DONE"].includes(s)) tone = "ok";
  else if (["FAILED", "OFFLINE", "ERROR"].includes(s)) tone = "bad";
  else if (["RUNNING", "PENDING", "QUEUED", "RETRYING", "STARTING", "STOPPING"].includes(s)) tone = "info";
  else if (["CANCELLED", "WARNING"].includes(s)) tone = "warn";
  return (
    <span className={`status-badge status-badge--${tone}`} title={status}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Toast({
  message,
  variant = "success",
  onDismiss,
}: {
  message: string | null;
  variant?: "success" | "error" | "info";
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className={`toast toast--${variant}`} role="status">
      <span>{message}</span>
      {onDismiss ? (
        <button type="button" className="toast__close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
  idPrefix,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Section">
      {tabs.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-${t.id}-panel`}
            id={`${idPrefix}-${t.id}-tab`}
            className={`tabs__tab${selected ? " tabs__tab--active" : ""}`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
