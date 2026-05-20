-- Dedupe accidental duplicate rows before enforcing uniqueness (production safety).
DELETE FROM "TestResult" a USING "TestResult" b
WHERE a."createdAt" < b."createdAt"
  AND a."runId" = b."runId"
  AND a."testCaseId" = b."testCaseId"
  AND a."deviceId" IS NOT DISTINCT FROM b."deviceId";

CREATE UNIQUE INDEX "TestResult_runId_testCaseId_deviceId_key" ON "TestResult"("runId", "testCaseId", "deviceId");
