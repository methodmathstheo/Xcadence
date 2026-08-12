-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "seed" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "simMs" REAL NOT NULL,
    "startMs" REAL NOT NULL,
    "speed" INTEGER NOT NULL DEFAULT 1440,
    "running" BOOLEAN NOT NULL DEFAULT true,
    "tick" INTEGER NOT NULL DEFAULT 0,
    "lastMonthKey" INTEGER NOT NULL,
    "indexBaseEqual" REAL NOT NULL DEFAULT 1,
    "indexBaseWeighted" REAL NOT NULL DEFAULT 1
);
INSERT INTO "new_Run" ("active", "createdAt", "id", "lastMonthKey", "running", "seed", "simMs", "speed", "startMs", "tick") SELECT "active", "createdAt", "id", "lastMonthKey", "running", "seed", "simMs", "speed", "startMs", "tick" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
CREATE INDEX "Run_active_idx" ON "Run"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
