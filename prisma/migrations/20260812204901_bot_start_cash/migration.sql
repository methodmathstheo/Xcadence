-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Bot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "cash" REAL NOT NULL,
    "startCash" REAL NOT NULL DEFAULT 0,
    "aggression" REAL NOT NULL,
    "horizon" INTEGER NOT NULL,
    CONSTRAINT "Bot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Bot" ("aggression", "cash", "horizon", "id", "name", "runId", "strategy") SELECT "aggression", "cash", "horizon", "id", "name", "runId", "strategy" FROM "Bot";
DROP TABLE "Bot";
ALTER TABLE "new_Bot" RENAME TO "Bot";
CREATE INDEX "Bot_runId_idx" ON "Bot"("runId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
