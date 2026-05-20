export type ImportedStep = {
  action: string;
  expected?: string;
  testData?: string;
};

export type ImportedCase = {
  title: string;
  steps: ImportedStep[];
  priority?: number;
  automationRef?: string;
  cycleNames: string[];
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function safeArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeSteps(rawSteps: unknown[]): ImportedStep[] {
  const steps: ImportedStep[] = [];
  for (const s of rawSteps) {
    if (!s || typeof s !== "object") continue;
    const obj = s as Record<string, unknown>;
    const action = asStr(obj.action || obj.step || obj.description || obj.name);
    if (!action) continue;
    steps.push({
      action,
      expected: asStr(obj.expected || obj.expectedResult || obj.result) || undefined,
      testData: asStr(obj.testData || obj.data) || undefined,
    });
  }
  return steps;
}

export function parseQmetryImport(format: "json" | "csv", raw: string): ImportedCase[] {
  if (format === "csv") {
    const lines = raw.split(/\r?\n/).filter((x) => x.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map((x) => x.toLowerCase());
    const iTitle = headers.indexOf("title");
    const iAction = headers.indexOf("step_action");
    const iExpected = headers.indexOf("step_expected");
    const iData = headers.indexOf("step_data");
    const iCycle = headers.indexOf("cycle");
    const map = new Map<string, ImportedCase>();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const title = (iTitle >= 0 ? cols[iTitle] : "").trim();
      if (!title) continue;
      const c = map.get(title) ?? {
        title,
        steps: [],
        cycleNames: [],
      };
      const action = (iAction >= 0 ? cols[iAction] : "").trim();
      if (action) {
        c.steps.push({
          action,
          expected: (iExpected >= 0 ? cols[iExpected] : "").trim() || undefined,
          testData: (iData >= 0 ? cols[iData] : "").trim() || undefined,
        });
      }
      const cycle = (iCycle >= 0 ? cols[iCycle] : "").trim();
      if (cycle && !c.cycleNames.includes(cycle)) c.cycleNames.push(cycle);
      map.set(title, c);
    }
    return [...map.values()];
  }

  const parsed = JSON.parse(raw) as unknown;
  const top = (parsed ?? {}) as Record<string, unknown>;
  const list = safeArr(top.testCases).length
    ? safeArr(top.testCases)
    : safeArr((parsed as Record<string, unknown>).issues).length
      ? safeArr((parsed as Record<string, unknown>).issues)
      : Array.isArray(parsed)
        ? parsed
        : [];

  const out: ImportedCase[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fields = (obj.fields ?? {}) as Record<string, unknown>;
    const title = asStr(obj.title || obj.name || obj.summary || fields.summary).trim();
    if (!title) continue;

    const cycleNames = [
      ...safeArr(obj.cycles).map(asStr),
      asStr(obj.cycle),
      ...safeArr(fields.cycles).map(asStr),
    ].filter((x) => x.trim());

    const steps = normalizeSteps(
      safeArr(obj.steps).length ? safeArr(obj.steps) : safeArr(fields.steps),
    );

    out.push({
      title,
      steps,
      priority: Number(obj.priority ?? fields.priority ?? 0) || 0,
      automationRef: asStr(obj.automationRef || obj.automation || fields.automationRef) || undefined,
      cycleNames: [...new Set(cycleNames)],
    });
  }
  return out;
}
