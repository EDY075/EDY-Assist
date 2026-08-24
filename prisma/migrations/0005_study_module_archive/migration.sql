ALTER TABLE "StudyModule" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudyModule" ADD COLUMN "archivedAt" DATETIME;
CREATE INDEX "StudyModule_isArchived_name_idx" ON "StudyModule"("isArchived", "name");
