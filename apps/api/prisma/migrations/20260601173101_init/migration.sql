-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "color" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "user" TEXT,
    "password_enc" TEXT,
    "database" TEXT,
    "ssl" BOOLEAN NOT NULL DEFAULT false,
    "connection_string_enc" TEXT,
    "options_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
