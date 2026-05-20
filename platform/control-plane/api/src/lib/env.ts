/**
 * Fail fast on insecure production configuration.
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt.length < 32) {
    throw new Error(
      "Zeppole: JWT_SECRET must be set to at least 32 characters when NODE_ENV=production.",
    );
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Zeppole: DATABASE_URL is required when NODE_ENV=production.");
  }

  const insecureDefaults = [
    "unsafe-dev-zeppole-jwt-secret",
    "change-me-in-production",
    "change-me",
  ];
  if (jwt && insecureDefaults.includes(jwt)) {
    throw new Error("Zeppole: JWT_SECRET must not use a documented placeholder in production.");
  }
}
