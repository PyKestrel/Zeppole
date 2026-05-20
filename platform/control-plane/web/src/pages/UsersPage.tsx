import { useEffect, useState } from "react";
import { api } from "../api";
import { EmptyState, PageHeader } from "../components/chrome";
import type { User } from "../types";

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    api<User[]>("/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  return (
    <div className="page">
      <PageHeader
        title="Users"
        subtitle="Directory of accounts authorized for this Zeppole instance (via JWT)."
      />

      <section className="card card--elevated">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <span className="role-pill">{u.role.replace(/_/g, " ")}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length === 0 ? (
          <EmptyState title="No users loaded" hint="You may not have permission to list users." />
        ) : null}
      </section>
    </div>
  );
}
