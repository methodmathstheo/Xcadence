-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "chart" TEXT;
ALTER TABLE "Artist" ADD COLUMN "wikiTitle" TEXT;
ALTER TABLE "Artist" ADD COLUMN "country" TEXT;

-- CreateTable
CREATE TABLE "RosterCandidate" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "wikiTitle" TEXT NOT NULL,
    "chart" TEXT NOT NULL,
    "country" TEXT,
    "source" TEXT NOT NULL,
    "fetchedAt" REAL NOT NULL
);
