import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  enrichBuild,
  syncAllBuildingBuilds,
  syncBuildFromBuilder,
} from "../../lib/emulatorImageBuildSync.js";
import {
  fetchImageBuilderCatalog,
  fetchImageBuilderPreflight,
  imageBuilderConfigured,
  imageBuilderHealth,
  startImageBuild,
} from "../../lib/imageBuilder.js";
import { can } from "../../lib/roles.js";

const createBody = z.object({
  name: z.string().min(1).max(200),
  apiLevel: z.number().int().min(28).max(40),
  codename: z.string().min(1).max(10),
  systemImage: z.enum(["google_apis", "google_apis_playstore", "aosp"]),
  abi: z.enum(["x86_64", "x86"]).default("x86_64"),
  emulatorChannel: z.enum(["stable", "dev", "canary"]).default("stable"),
  pageSize: z.string().max(20).optional(),
  dockerTag: z.string().min(1).max(200),
  enableNovnc: z.boolean().default(true),
  enableAppium: z.boolean().default(true),
});

export const emulatorImagesPlugin: FastifyPluginAsync = async (app) => {
  app.get(
    "/emulator-images/catalog",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulator-images"], summary: "Google aemu build catalog options" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "view")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      if (!imageBuilderConfigured()) {
        reply.code(503).send({
          error:
            "Image builder is not configured. Set ZEPPOLE_IMAGE_BUILDER_URL and ZEPPOLE_IMAGE_BUILDER_TOKEN.",
        });
        return;
      }
      return fetchImageBuilderCatalog();
    },
  );

  app.get(
    "/emulator-images/preflight",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulator-images"], summary: "Check Docker host disk before starting a build" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "view")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      if (!imageBuilderConfigured()) {
        reply.code(503).send({ error: "Image builder is not configured." });
        return;
      }
      return fetchImageBuilderPreflight();
    },
  );

  app.get(
    "/emulator-images/builds",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["emulator-images"],
        summary: "List custom emulator image builds (syncs in-progress builds from builder)",
      },
    },
    async (request, reply) => {
      if (!can(request.user.role, "view")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const builds = await syncAllBuildingBuilds(app.prisma);
      const buildingCount = builds.filter((b) => b.status === "BUILDING").length;
      const builderHealth = imageBuilderConfigured() ? await imageBuilderHealth() : { reachable: false };
      return {
        builds,
        live: {
          syncing: buildingCount > 0,
          buildingCount,
          builderConfigured: imageBuilderConfigured(),
          builderReachable: builderHealth.reachable,
          builderDetail: builderHealth.detail,
          syncedAt: new Date().toISOString(),
        },
      };
    },
  );

  app.get(
    "/emulator-images/builds/:buildId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulator-images"], summary: "Get build status, phase, and live log tail" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "view")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { buildId } = request.params as { buildId: string };
      const row = await app.prisma.emulatorImageBuild.findUnique({ where: { id: buildId } });
      if (!row) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      const build = await syncBuildFromBuilder(app.prisma, row);
      const builderHealth = imageBuilderConfigured() ? await imageBuilderHealth() : { reachable: false };
      return {
        build,
        live: {
          syncing: build.status === "BUILDING",
          builderReachable: builderHealth.reachable,
          builderDetail: builderHealth.detail,
          syncedAt: new Date().toISOString(),
        },
      };
    },
  );

  app.post(
    "/emulator-images/builds",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["emulator-images"],
        summary: "Start building a Google aemu image with Zeppole overlay (noVNC + Appium)",
      },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      if (!imageBuilderConfigured()) {
        reply.code(503).send({
          error: "Image builder is not configured on the API.",
        });
        return;
      }
      const body = createBody.parse(request.body);

      const row = await app.prisma.emulatorImageBuild.create({
        data: {
          name: body.name,
          status: "BUILDING",
          apiLevel: body.apiLevel,
          codename: body.codename,
          systemImage: body.systemImage,
          abi: body.abi,
          emulatorChannel: body.emulatorChannel,
          pageSize: body.pageSize ?? null,
          enableNovnc: body.enableNovnc,
          enableAppium: body.enableAppium,
          dockerTag: body.dockerTag,
        },
      });

      try {
        await startImageBuild({
          buildId: row.id,
          apiLevel: body.apiLevel,
          codename: body.codename,
          systemImage: body.systemImage,
          abi: body.abi,
          emulatorChannel: body.emulatorChannel,
          pageSize: body.pageSize ?? "",
          dockerTag: body.dockerTag,
          enableNovnc: body.enableNovnc,
          enableAppium: body.enableAppium,
        });
      } catch (e) {
        await app.prisma.emulatorImageBuild.update({
          where: { id: row.id },
          data: { status: "FAILED", errorMessage: (e as Error).message },
        });
        reply.code(502).send({ error: (e as Error).message });
        return;
      }

      reply.code(202).send({ build: enrichBuild(row, "initializing") });
    },
  );

  app.delete(
    "/emulator-images/builds/:buildId",
    {
      onRequest: [app.authenticate],
      schema: { tags: ["emulator-images"], summary: "Delete build record (does not remove local docker image)" },
    },
    async (request, reply) => {
      if (!can(request.user.role, "manage_projects")) {
        reply.code(403).send({ error: "Forbidden" });
        return;
      }
      const { buildId } = request.params as { buildId: string };
      const row = await app.prisma.emulatorImageBuild.findUnique({ where: { id: buildId } });
      if (row?.status === "FAILED" && imageBuilderConfigured()) {
        try {
          await fetch(
            `${process.env.ZEPPOLE_IMAGE_BUILDER_URL!.replace(/\/$/, "")}/v1/build/${buildId}/cleanup`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.ZEPPOLE_IMAGE_BUILDER_TOKEN!}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ dockerTag: row.dockerTag }),
            },
          );
        } catch {
          /* best-effort */
        }
      }
      await app.prisma.emulatorImageBuild.delete({ where: { id: buildId } }).catch(() => null);
      reply.code(204).send();
    },
  );
};
