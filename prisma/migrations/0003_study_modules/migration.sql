CREATE TABLE "StudyModule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#7c5cff',
  "topicsJson" TEXT NOT NULL DEFAULT '[]',
  "isStarter" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "StudyModule_name_key" ON "StudyModule"("name");
CREATE INDEX "StudyModule_name_idx" ON "StudyModule"("name");
