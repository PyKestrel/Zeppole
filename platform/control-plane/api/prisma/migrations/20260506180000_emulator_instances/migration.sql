-- CreateEnum
CREATE TYPE "EmulatorStatus" AS ENUM ('DRAFT', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'ERROR');

-- CreateTable
CREATE TABLE "EmulatorInstance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" "EmulatorStatus" NOT NULL DEFAULT 'DRAFT',
    "displayUrl" TEXT,
    "appiumUrl" TEXT,
    "emulatorDevice" TEXT,
    "containerName" TEXT,
    "dockerImage" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmulatorInstance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmulatorInstance_containerName_key" ON "EmulatorInstance"("containerName");
