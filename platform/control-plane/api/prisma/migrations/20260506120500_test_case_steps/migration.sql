CREATE TABLE "TestCaseStep" (
  "id" TEXT NOT NULL,
  "testCaseId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "action" TEXT NOT NULL,
  "expected" TEXT,
  "testData" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TestCaseStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TestCaseStep_testCaseId_sortOrder_idx" ON "TestCaseStep"("testCaseId", "sortOrder");

ALTER TABLE "TestCaseStep"
ADD CONSTRAINT "TestCaseStep_testCaseId_fkey"
FOREIGN KEY ("testCaseId") REFERENCES "TestCase"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
