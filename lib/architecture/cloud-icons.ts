import {
  Archive,
  BarChart3,
  Cloud,
  CloudCog,
  Container,
  Database,
  Hexagon,
  MemoryStick,
  Server,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Cloud service icon catalog — Epic 1 of the platform roadmap.
 *
 * A service is attached to an architecture node via its EXISTING stereotype
 * channel (`<<stereotype>>` in Mermaid), so assignment round-trips through
 * clean Mermaid text with zero parser/serializer changes: the class parser
 * already reads annotations and the serializer already emits them.
 *
 * The catalog is presentation-only data — no React, safe to import in
 * tests and non-component modules.
 */

export type CloudProvider = "aws" | "gcp" | "azure" | "kubernetes" | "docker" | "kafka" | "redis";

export interface CloudServiceIcon {
  /** Stereotype id written into Mermaid: `class Payments <<aws-lambda>>`. */
  id: string;
  label: string;
  provider: CloudProvider;
  icon: LucideIcon;
  /** Official brand hue — used for the icon glyph on a tinted chip. */
  color: string;
}

export const PROVIDER_LABELS: Record<CloudProvider, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  kubernetes: "Kubernetes",
  docker: "Docker",
  kafka: "Kafka",
  redis: "Redis",
};

export const CLOUD_SERVICES: readonly CloudServiceIcon[] = [
  { id: "aws-s3", label: "S3 Bucket", provider: "aws", icon: Archive, color: "#E8890C" },
  { id: "aws-ec2", label: "EC2 Instance", provider: "aws", icon: Server, color: "#E8890C" },
  { id: "aws-lambda", label: "Lambda", provider: "aws", icon: Zap, color: "#E8890C" },
  { id: "aws-dynamodb", label: "DynamoDB", provider: "aws", icon: Database, color: "#E8890C" },
  { id: "gcp-cloud-run", label: "Cloud Run", provider: "gcp", icon: Cloud, color: "#4285F4" },
  { id: "gcp-bigquery", label: "BigQuery", provider: "gcp", icon: BarChart3, color: "#4285F4" },
  { id: "azure-functions", label: "Azure Functions", provider: "azure", icon: CloudCog, color: "#0078D4" },
  { id: "kubernetes", label: "Kubernetes", provider: "kubernetes", icon: Hexagon, color: "#326CE5" },
  { id: "docker", label: "Docker Container", provider: "docker", icon: Container, color: "#2496ED" },
  { id: "kafka", label: "Kafka Topic", provider: "kafka", icon: Workflow, color: "#1A1A1A" },
  { id: "redis", label: "Redis Cache", provider: "redis", icon: MemoryStick, color: "#DC382D" },
] as const;

/** Friendly aliases accepted in Mermaid stereotypes (case-insensitive). */
const ALIASES: Record<string, string> = {
  s3: "aws-s3",
  bucket: "aws-s3",
  ec2: "aws-ec2",
  lambda: "aws-lambda",
  serverless: "aws-lambda",
  dynamo: "aws-dynamodb",
  dynamodb: "aws-dynamodb",
  "cloud-run": "gcp-cloud-run",
  cloudrun: "gcp-cloud-run",
  run: "gcp-cloud-run",
  bigquery: "gcp-bigquery",
  bq: "gcp-bigquery",
  functions: "azure-functions",
  "azure-functions": "azure-functions",
  k8s: "kubernetes",
  kubernetes: "kubernetes",
  docker: "docker",
  container: "docker",
  kafka: "kafka",
  topic: "kafka",
  redis: "redis",
  cache: "redis",
};

const BY_ID = new Map(CLOUD_SERVICES.map((service) => [service.id, service]));
for (const service of CLOUD_SERVICES) {
  ALIASES[service.id] = service.id;
}

/** Resolve a node stereotype to a known cloud service, or null for unknown/free-text ones. */
export function serviceIconForStereotype(stereotype: string | null | undefined): CloudServiceIcon | null {
  if (!stereotype) return null;
  const normalized = stereotype.trim().toLowerCase().replace(/[«»]/g, "");
  const id = ALIASES[normalized];
  return id ? BY_ID.get(id) ?? null : null;
}