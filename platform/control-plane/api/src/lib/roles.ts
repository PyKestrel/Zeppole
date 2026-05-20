import type { Role } from "@prisma/client";

const hierarchy: Record<Role, number> = {
  ADMIN: 100,
  QA_LEAD: 80,
  AUTOMATION: 60,
  VIEWER: 20,
};

export function can(role: Role, action: "manage_users" | "manage_projects" | "execute_runs" | "view"): boolean {
  const h = hierarchy[role];
  switch (action) {
    case "manage_users":
      return h >= hierarchy.ADMIN;
    case "manage_projects":
      return h >= hierarchy.QA_LEAD;
    case "execute_runs":
      return h >= hierarchy.AUTOMATION;
    case "view":
      return h >= hierarchy.VIEWER;
    default:
      return false;
  }
}
