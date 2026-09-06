-- Multi-tenant workspaces with role-based access (Epic 3 foundation).
-- Organizations gate collaboration; memberships are (organizationId, userId)
-- unique so concurrent joins cannot duplicate, and cascade on both sides.

CREATE TYPE "OrgRole" AS ENUM ('admin', 'editor', 'viewer', 'guest');

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Organization_createdAt_idx" ON "Organization"("createdAt");
CREATE INDEX "WorkspaceMember_organizationId_idx" ON "WorkspaceMember"("organizationId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

CREATE UNIQUE INDEX "WorkspaceMember_organizationId_userId_key" ON "WorkspaceMember"("organizationId", "userId");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
