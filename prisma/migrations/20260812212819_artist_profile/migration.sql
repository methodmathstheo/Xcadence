-- CreateTable
CREATE TABLE "ArtistProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "artistId" INTEGER NOT NULL,
    "spotifyId" TEXT,
    "imageUrl" TEXT,
    "followers" INTEGER,
    "popularity" INTEGER,
    "genres" TEXT,
    "externalUrl" TEXT,
    "releases" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT false,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistProfile_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistProfile_artistId_key" ON "ArtistProfile"("artistId");
