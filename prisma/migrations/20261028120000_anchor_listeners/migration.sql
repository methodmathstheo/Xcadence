-- AlterTable
ALTER TABLE "Artist" ADD COLUMN "anchoredAt" REAL;

-- CreateTable
CREATE TABLE "StreamingFigure" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "listeners" REAL NOT NULL,
    "rank" INTEGER NOT NULL,
    "capturedAt" REAL NOT NULL
);
