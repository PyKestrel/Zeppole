import type { FastifyPluginAsync } from "fastify";
import { authPlugin } from "./auth.js";
import { devicesPlugin } from "./devices.js";
import { emulatorsPlugin } from "./emulators.js";
import { emulatorImagesPlugin } from "./emulator-images.js";
import { projectsPlugin } from "./projects.js";
import { runsPlugin } from "./runs.js";
import { testCasesPlugin } from "./test-cases.js";
import { testCyclesPlugin } from "./test-cycles.js";
import { webhooksPlugin } from "./webhooks.js";
import { workerPlugin } from "./worker.js";
import { usersPlugin } from "./users.js";

export const registerV1: FastifyPluginAsync = async (app) => {
  await app.register(authPlugin);
  await app.register(usersPlugin);
  await app.register(projectsPlugin);
  await app.register(testCasesPlugin);
  await app.register(testCyclesPlugin);
  await app.register(runsPlugin);
  await app.register(devicesPlugin);
  await app.register(emulatorsPlugin);
  await app.register(emulatorImagesPlugin);
  await app.register(workerPlugin);
  await app.register(webhooksPlugin);
};
