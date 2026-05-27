-- Drop display/Appium flags from image builds (ws-scrcpy sidecar at deploy time).
ALTER TABLE "EmulatorImageBuild" DROP COLUMN IF EXISTS "enableNovnc";
ALTER TABLE "EmulatorImageBuild" DROP COLUMN IF EXISTS "enableAppium";
