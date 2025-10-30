-- CreateTable
CREATE TABLE "configuration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "day" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "presentacion" TEXT NOT NULL,
    "instructions" TEXT NOT NULL
);
