-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Artist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "debutTier" TEXT NOT NULL DEFAULT 'emerging',
    "debutMs" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "exitMs" REAL,
    "exitReason" TEXT,
    "trueQuality" REAL NOT NULL,
    "hazardRate" REAL NOT NULL,
    "driftMu" REAL NOT NULL,
    "sigma" REAL NOT NULL,
    "breakoutP" REAL NOT NULL,
    "listeners" REAL NOT NULL,
    "listeners30" REAL NOT NULL,
    "listeners90" REAL NOT NULL,
    "volatility" REAL NOT NULL,
    "royaltyRate" REAL NOT NULL,
    "unitScale" REAL NOT NULL DEFAULT 10000,
    "q" REAL NOT NULL DEFAULT 0,
    "b" REAL NOT NULL,
    "vMax" REAL NOT NULL,
    "price" REAL NOT NULL,
    "prevPrice" REAL NOT NULL,
    CONSTRAINT "Artist_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Artist" ("active", "b", "breakoutP", "debutMs", "driftMu", "exitMs", "exitReason", "genre", "hazardRate", "id", "listeners", "listeners30", "listeners90", "name", "prevPrice", "price", "q", "royaltyRate", "runId", "sigma", "tier", "trueQuality", "unitScale", "vMax", "volatility") SELECT "active", "b", "breakoutP", "debutMs", "driftMu", "exitMs", "exitReason", "genre", "hazardRate", "id", "listeners", "listeners30", "listeners90", "name", "prevPrice", "price", "q", "royaltyRate", "runId", "sigma", "tier", "trueQuality", "unitScale", "vMax", "volatility" FROM "Artist";
DROP TABLE "Artist";
ALTER TABLE "new_Artist" RENAME TO "Artist";
CREATE INDEX "Artist_runId_active_idx" ON "Artist"("runId", "active");
CREATE INDEX "Artist_runId_tier_idx" ON "Artist"("runId", "tier");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
