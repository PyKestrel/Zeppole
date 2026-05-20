export type User = {
  id: string;
  email: string;
  role: string;
  name?: string | null;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

export type TestCase = {
  id: string;
  title: string;
  steps: string;
  stepsList?: { action: string; expected?: string; testData?: string }[];
  priority: number;
};

export type TestCycle = { id: string; name: string };

export type Device = { id: string; name: string; status: string };

export type DeviceRow = {
  id: string;
  name: string;
  status: string;
  lastHeartbeat: string | null;
};

export type RunSummary = {
  id: string;
  status: string;
  createdAt: string;
  cycleId: string;
  executionJobs: {
    id: string;
    status: string;
    device: { id: string; name: string };
  }[];
};

export type EmulatorInstance = {
  id: string;
  name: string;
  mode: string;
  status: string;
  displayUrl: string | null;
  appiumUrl: string | null;
  emulatorDevice: string | null;
  containerName: string | null;
  dockerImage: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
