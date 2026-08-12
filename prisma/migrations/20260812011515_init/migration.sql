-- CreateTable
CREATE TABLE "Run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "seed" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "simMs" REAL NOT NULL,
    "startMs" REAL NOT NULL,
    "speed" INTEGER NOT NULL DEFAULT 1440,
    "running" BOOLEAN NOT NULL DEFAULT true,
    "tick" INTEGER NOT NULL DEFAULT 0,
    "lastMonthKey" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Artist" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
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
    "q" REAL NOT NULL DEFAULT 0,
    "b" REAL NOT NULL,
    "vMax" REAL NOT NULL,
    "price" REAL NOT NULL,
    "prevPrice" REAL NOT NULL,
    CONSTRAINT "Artist_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtistMonth" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "artistId" INTEGER NOT NULL,
    "monthKey" INTEGER NOT NULL,
    "dateMs" REAL NOT NULL,
    "listeners" REAL NOT NULL,
    "royalty" REAL NOT NULL,
    "rank" INTEGER NOT NULL,
    CONSTRAINT "ArtistMonth_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricePoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "artistId" INTEGER NOT NULL,
    "tMs" REAL NOT NULL,
    "price" REAL NOT NULL,
    CONSTRAINT "PricePoint_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "cash" REAL NOT NULL,
    "aggression" REAL NOT NULL,
    "horizon" INTEGER NOT NULL,
    CONSTRAINT "Bot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BotPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "botId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "qty" REAL NOT NULL,
    "costBasis" REAL NOT NULL,
    CONSTRAINT "BotPosition_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BotPosition_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "botId" INTEGER,
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
    CONSTRAINT "Trade_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "artistId" INTEGER,
    "kind" TEXT NOT NULL,
    "magnitude" REAL NOT NULL,
    "headline" TEXT NOT NULL,
    "tMs" REAL NOT NULL,
    CONSTRAINT "MarketEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketEvent_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "cash" REAL NOT NULL,
    "startingCash" REAL NOT NULL,
    "realisedPnl" REAL NOT NULL DEFAULT 0,
    "sessionStartEquity" REAL NOT NULL,
    CONSTRAINT "Account_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Position" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "qty" REAL NOT NULL,
    "costBasis" REAL NOT NULL,
    "realised" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Position_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Position_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "pctRoyalty" REAL NOT NULL,
    "askCredits" REAL NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "openMs" REAL NOT NULL,
    "expiresMs" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "filled" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "Offering_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Offering_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfferingPosition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "offeringId" INTEGER NOT NULL,
    "credits" REAL NOT NULL,
    "sharePct" REAL NOT NULL,
    "startMonthKey" INTEGER NOT NULL,
    "endMonthKey" INTEGER NOT NULL,
    "royalties" REAL NOT NULL DEFAULT 0,
    "monthsPaid" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OfferingPosition_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfferingPosition_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoyaltyPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "positionId" INTEGER NOT NULL,
    "monthKey" INTEGER NOT NULL,
    "dateMs" REAL NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "RoyaltyPayment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "OfferingPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndexPoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "tMs" REAL NOT NULL,
    "equal" REAL NOT NULL,
    "weighted" REAL NOT NULL,
    CONSTRAINT "IndexPoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquityPoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" INTEGER NOT NULL,
    "tMs" REAL NOT NULL,
    "equity" REAL NOT NULL,
    "cash" REAL NOT NULL,
    "marketValue" REAL NOT NULL,
    "realised" REAL NOT NULL,
    CONSTRAINT "EquityPoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Run_active_idx" ON "Run"("active");

-- CreateIndex
CREATE INDEX "Artist_runId_active_idx" ON "Artist"("runId", "active");

-- CreateIndex
CREATE INDEX "Artist_runId_tier_idx" ON "Artist"("runId", "tier");

-- CreateIndex
CREATE INDEX "ArtistMonth_artistId_monthKey_idx" ON "ArtistMonth"("artistId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistMonth_artistId_monthKey_key" ON "ArtistMonth"("artistId", "monthKey");

-- CreateIndex
CREATE INDEX "PricePoint_artistId_tMs_idx" ON "PricePoint"("artistId", "tMs");

-- CreateIndex
CREATE INDEX "Bot_runId_idx" ON "Bot"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "BotPosition_botId_artistId_key" ON "BotPosition"("botId", "artistId");

-- CreateIndex
CREATE INDEX "Trade_runId_id_idx" ON "Trade"("runId", "id");

-- CreateIndex
CREATE INDEX "Trade_artistId_id_idx" ON "Trade"("artistId", "id");

-- CreateIndex
CREATE INDEX "Trade_runId_actor_id_idx" ON "Trade"("runId", "actor", "id");

-- CreateIndex
CREATE INDEX "MarketEvent_runId_id_idx" ON "MarketEvent"("runId", "id");

-- CreateIndex
CREATE INDEX "MarketEvent_artistId_id_idx" ON "MarketEvent"("artistId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_runId_key" ON "Account"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_runId_artistId_key" ON "Position"("runId", "artistId");

-- CreateIndex
CREATE INDEX "Offering_runId_status_idx" ON "Offering"("runId", "status");

-- CreateIndex
CREATE INDEX "OfferingPosition_runId_active_idx" ON "OfferingPosition"("runId", "active");

-- CreateIndex
CREATE INDEX "RoyaltyPayment_positionId_monthKey_idx" ON "RoyaltyPayment"("positionId", "monthKey");

-- CreateIndex
CREATE INDEX "IndexPoint_runId_tMs_idx" ON "IndexPoint"("runId", "tMs");

-- CreateIndex
CREATE INDEX "EquityPoint_runId_tMs_idx" ON "EquityPoint"("runId", "tMs");
