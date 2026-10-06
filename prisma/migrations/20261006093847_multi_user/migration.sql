/*
  Warnings:

  - Added the required column `userId` to the `Account` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `EquityPoint` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `OfferingPosition` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Position` table without a default value. This is not possible if the table is not empty.

  The four user-owned tables gain a NOT NULL `userId`. Rows written before
  accounts existed belong to one anonymous book and cannot be attributed to a
  person, so they are cleared rather than assigned to an arbitrary user. Trade
  rows survive untouched: `userId` is nullable there, and historic user fills
  simply read as NULL.
*/
PRAGMA foreign_keys=OFF;
DELETE FROM "EquityPoint";
DELETE FROM "OfferingPosition";
DELETE FROM "Position";
DELETE FROM "Account";
PRAGMA foreign_keys=ON;

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "cash" REAL NOT NULL,
    "startingCash" REAL NOT NULL,
    "realisedPnl" REAL NOT NULL DEFAULT 0,
    "sessionStartEquity" REAL NOT NULL,
    CONSTRAINT "Account_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("cash", "id", "realisedPnl", "runId", "sessionStartEquity", "startingCash") SELECT "cash", "id", "realisedPnl", "runId", "sessionStartEquity", "startingCash" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_runId_userId_key" ON "Account"("runId", "userId");
CREATE TABLE "new_EquityPoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "tMs" REAL NOT NULL,
    "equity" REAL NOT NULL,
    "cash" REAL NOT NULL,
    "marketValue" REAL NOT NULL,
    "realised" REAL NOT NULL,
    CONSTRAINT "EquityPoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EquityPoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_EquityPoint" ("cash", "equity", "id", "marketValue", "realised", "runId", "tMs") SELECT "cash", "equity", "id", "marketValue", "realised", "runId", "tMs" FROM "EquityPoint";
DROP TABLE "EquityPoint";
ALTER TABLE "new_EquityPoint" RENAME TO "EquityPoint";
CREATE INDEX "EquityPoint_runId_userId_tMs_idx" ON "EquityPoint"("runId", "userId", "tMs");
CREATE TABLE "new_OfferingPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "offeringId" INTEGER NOT NULL,
    "credits" REAL NOT NULL,
    "sharePct" REAL NOT NULL,
    "startMonthKey" INTEGER NOT NULL,
    "endMonthKey" INTEGER NOT NULL,
    "royalties" REAL NOT NULL DEFAULT 0,
    "monthsPaid" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OfferingPosition_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferingPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferingPosition_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_OfferingPosition" ("active", "credits", "endMonthKey", "id", "monthsPaid", "offeringId", "royalties", "runId", "sharePct", "startMonthKey") SELECT "active", "credits", "endMonthKey", "id", "monthsPaid", "offeringId", "royalties", "runId", "sharePct", "startMonthKey" FROM "OfferingPosition";
DROP TABLE "OfferingPosition";
ALTER TABLE "new_OfferingPosition" RENAME TO "OfferingPosition";
CREATE INDEX "OfferingPosition_runId_userId_active_idx" ON "OfferingPosition"("runId", "userId", "active");
CREATE TABLE "new_Position" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "qty" REAL NOT NULL,
    "costBasis" REAL NOT NULL,
    "realised" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Position_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Position" ("artistId", "costBasis", "id", "qty", "realised", "runId") SELECT "artistId", "costBasis", "id", "qty", "realised", "runId" FROM "Position";
DROP TABLE "Position";
ALTER TABLE "new_Position" RENAME TO "Position";
CREATE INDEX "Position_runId_userId_idx" ON "Position"("runId", "userId");
CREATE UNIQUE INDEX "Position_runId_userId_artistId_key" ON "Position"("runId", "userId", "artistId");
CREATE TABLE "new_Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "botId" INTEGER,
    "userId" INTEGER,
    "actor" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "priceBefore" REAL NOT NULL,
    "priceAfter" REAL NOT NULL,
    "tMs" REAL NOT NULL,
    "realised" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Trade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Trade" ("actor", "artistId", "botId", "cost", "id", "priceAfter", "priceBefore", "qty", "realised", "runId", "side", "tMs") SELECT "actor", "artistId", "botId", "cost", "id", "priceAfter", "priceBefore", "qty", "realised", "runId", "side", "tMs" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
CREATE INDEX "Trade_runId_id_idx" ON "Trade"("runId", "id");
CREATE INDEX "Trade_artistId_id_idx" ON "Trade"("artistId", "id");
CREATE INDEX "Trade_runId_actor_id_idx" ON "Trade"("runId", "actor", "id");
CREATE INDEX "Trade_runId_userId_id_idx" ON "Trade"("runId", "userId", "id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
