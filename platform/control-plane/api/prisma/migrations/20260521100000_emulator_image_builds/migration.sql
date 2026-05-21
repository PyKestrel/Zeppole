-- CreateTable
CREATE TABLE "EmulatorImageBuild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "apiLevel" INTEGER NOT NULL,
    "codename" TEXT NOT NULL,
    "systemImage" TEXT NOT NULL,
    "abi" TEXT NOT NULL,
    "emulatorChannel" TEXT NOT NULL,
    "pageSize" TEXT,
    "enableNovnc" BOOLEAN NOT NULL DEFAULT true,
    "enableAppium" BOOLEAN NOT NULL DEFAULT true,
    "dockerTag" TEXT NOT NULL,
    "imageRef" TEXT,
    "buildLog" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmulatorImageBuild_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmulatorImageBuild_status_idx" ON "EmulatorImageBuild"("status");
