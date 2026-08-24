-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "appMode" TEXT NOT NULL DEFAULT 'LOCAL',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "quietEnabled" BOOLEAN NOT NULL DEFAULT true,
    "quietStart" TEXT NOT NULL DEFAULT '22:00',
    "quietEnd" TEXT NOT NULL DEFAULT '07:00',
    "whatsappRecipient" TEXT,
    "dailySummaryTime" TEXT NOT NULL DEFAULT '20:00',
    "weeklySummaryDay" INTEGER NOT NULL DEFAULT 0,
    "weeklySummaryTime" TEXT NOT NULL DEFAULT '19:00',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL DEFAULT 'LOCAL',
    "externalUserId" TEXT,
    "lastReminderId" TEXT,
    "lastFocusSessionId" TEXT,
    "pendingIntentJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'LOCAL',
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "externalId" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "dueAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "recurrence" TEXT NOT NULL DEFAULT 'NONE',
    "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
    "recurrenceDaysJson" TEXT,
    "recurrenceUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'LOCAL',
    "notificationSentAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "parentReminderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "durationMinutes" INTEGER NOT NULL,
    "subject" TEXT,
    "track" TEXT,
    "objective" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "hydrationReminderId" TEXT,
    CONSTRAINT "FocusSession_hydrationReminderId_fkey" FOREIGN KEY ("hydrationReminderId") REFERENCES "Reminder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "StudyLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "focusSessionId" TEXT,
    "subject" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "objective" TEXT,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "correctAnswers" INTEGER NOT NULL DEFAULT 0,
    "studiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyLog_focusSessionId_fkey" FOREIGN KEY ("focusSessionId") REFERENCES "FocusSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studyLogId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_studyLogId_fkey" FOREIGN KEY ("studyLogId") REFERENCES "StudyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ConversationSession_channel_externalUserId_key" ON "ConversationSession"("channel", "externalUserId");
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");
CREATE INDEX "Reminder_dueAt_status_idx" ON "Reminder"("dueAt", "status");
CREATE INDEX "Reminder_category_dueAt_idx" ON "Reminder"("category", "dueAt");
CREATE UNIQUE INDEX "FocusSession_hydrationReminderId_key" ON "FocusSession"("hydrationReminderId");
CREATE INDEX "FocusSession_status_startedAt_idx" ON "FocusSession"("status", "startedAt");
CREATE INDEX "StudyLog_studiedAt_idx" ON "StudyLog"("studiedAt");
CREATE INDEX "StudyLog_track_subject_idx" ON "StudyLog"("track", "subject");
CREATE INDEX "Review_dueAt_status_idx" ON "Review"("dueAt", "status");
CREATE UNIQUE INDEX "Review_studyLogId_intervalDays_key" ON "Review"("studyLogId", "intervalDays");
