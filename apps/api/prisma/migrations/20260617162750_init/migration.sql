-- CreateTable
CREATE TABLE "connections" (
    "id" TEXT NOT NULL,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "source_json" TEXT NOT NULL,
    "destination_json" TEXT NOT NULL,
    "auth_enc" TEXT,
    "transform_json" TEXT NOT NULL,
    "delivery_json" TEXT NOT NULL,
    "trigger_json" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hook_runs" (
    "id" TEXT NOT NULL,
    "hook_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cursor_offset" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "total_count" INTEGER,
    "config_snapshot_json" TEXT NOT NULL,
    "cursor_json" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "hook_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hook_deliveries" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "row_index" INTEGER NOT NULL,
    "row_count" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "http_status" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "row_keys_json" TEXT,
    "request_body" TEXT,
    "response_body" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hooks_connection_id_idx" ON "hooks"("connection_id");

-- CreateIndex
CREATE INDEX "hook_runs_hook_id_idx" ON "hook_runs"("hook_id");

-- CreateIndex
CREATE INDEX "hook_runs_status_idx" ON "hook_runs"("status");

-- CreateIndex
CREATE INDEX "hook_deliveries_run_id_idx" ON "hook_deliveries"("run_id");

-- CreateIndex
CREATE UNIQUE INDEX "hook_deliveries_run_id_sequence_key" ON "hook_deliveries"("run_id", "sequence");

-- AddForeignKey
ALTER TABLE "hook_runs" ADD CONSTRAINT "hook_runs_hook_id_fkey" FOREIGN KEY ("hook_id") REFERENCES "hooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hook_deliveries" ADD CONSTRAINT "hook_deliveries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "hook_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
