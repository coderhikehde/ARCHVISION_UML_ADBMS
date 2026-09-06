-- Replace the non-unique (diagramId, version) index with a unique
-- constraint. The VersionService computes the next version number from
-- max+1 inside a transaction; this constraint turns racing saves into a
-- retryable unique-conflict instead of allowing duplicates.

DROP INDEX IF EXISTS "DiagramVersion_diagramId_version_idx";
CREATE UNIQUE INDEX "DiagramVersion_diagramId_version_key" ON "DiagramVersion"("diagramId", "version");