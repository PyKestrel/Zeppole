/**
 * Ensures worker submitted exactly one result per test case in the cycle (for this job).
 */
export function validateWorkerResultsAgainstCycle(
  cycleTestCaseIds: string[],
  resultTestCaseIds: string[],
): { ok: true } | { ok: false; error: string } {
  const expected = new Set(cycleTestCaseIds);
  const got = new Set(resultTestCaseIds);

  if (expected.size !== got.size) {
    return {
      ok: false,
      error: `Expected ${expected.size} test results (one per cycle case), got ${got.size}.`,
    };
  }

  for (const id of expected) {
    if (!got.has(id)) {
      return { ok: false, error: `Missing result for test case ${id}.` };
    }
  }

  for (const id of got) {
    if (!expected.has(id)) {
      return { ok: false, error: `Unexpected test case id in results: ${id}.` };
    }
  }

  return { ok: true };
}
