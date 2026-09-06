-- Async collaboration: persisted comments and ADRs per diagram (Epic 3/6).
-- Both are diagram-scoped and cascade when the diagram is deleted.

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Adr" (
    "id" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "consequences" TEXT NOT NULL,
    "linkedNodes" JSONB NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Adr_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_diagramId_idx" ON "Comment"("diagramId");
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");
CREATE INDEX "Adr_diagramId_idx" ON "Adr"("diagramId");
CREATE UNIQUE INDEX "Adr_diagramId_number_key" ON "Adr"("diagramId", "number");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "Diagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Adr" ADD CONSTRAINT "Adr_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "Diagram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Adr" ADD CONSTRAINT "Adr_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
