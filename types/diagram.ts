export type DiagramType =
  | "CLASS"
  | "SEQUENCE"
  | "USE_CASE"
  | "STATE"
  | "ACTIVITY"
  | "COMPONENT"
  | "DEPLOYMENT"
  | "ER"
  | "PACKAGE";

export type ViewMode = "EXECUTIVE" | "ENGINEERING";

export type Visibility = "public" | "private" | "protected";

export interface UMLAttribute {
  name: string;
  type: string;
  visibility: Visibility;
  isStatic: boolean;
  isDerived: boolean;
}

export interface UMLMethod {
  name: string;
  parameters: Array<{ name: string; type: string }>;
  returnType: string;
  visibility: Visibility;
  isStatic: boolean;
  isAbstract: boolean;
}

export interface UMLClass {
  id: string;
  name: string;
  stereotype: string | null;
  /** Enclosing Mermaid namespace (C4 container), or null at top level. */
  parentId: string | null;
  attributes: UMLAttribute[];
  methods: UMLMethod[];
  isAbstract: boolean;
  isInterface: boolean;
}

export type RelationType = "inheritance" | "implementation" | "association" | "composition" | "aggregation" | "dependency";

export interface UMLLink {
  id: string;
  from: string;
  to: string;
  type: RelationType;
  label: string | null;
  fromMultiplicity: string | null;
  toMultiplicity: string | null;
}

export interface UMLModel {
  title: string;
  diagramType: DiagramType;
  classes: UMLClass[];
  links: UMLLink[];
}

export interface DiagramMeta {
  classCount: number;
  methodCount: number;
  attributeCount: number;
  relationCount: number;
  cycles: string[][];
  godClasses: string[];
}

export interface ValidationIssue {
  severity: "critical" | "warning" | "info";
  message: string;
  rule: string;
  target: string | null;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  score: number;
}

export interface AnalysisMetric {
  label: string;
  value: number;
  max: number;
  severity: "critical" | "warning" | "info";
  description: string;
}

export interface AnalysisResult {
  metrics: AnalysisMetric[];
  insights: string[];
  refactorings: string[];
  generatedAt: string;
}

export type CodeLanguage = "typescript" | "java" | "python" | "csharp";

export interface CodeGenOptions {
  includeGettersSetters: boolean;
  useLombok: boolean;
  usePydantic: boolean;
  addDecorators: boolean;
}

export interface ExportRecord {
  id: string;
  diagramId: string;
  format: string;
  url: string;
  createdAt: string;
}

export interface PromptHistoryEntry {
  id: string;
  diagramId: string;
  prompt: string;
  response: string;
  actionType: "generate" | "transform" | "analyze" | "explain";
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  githubRepo: string | null;
  githubBranch: string;
  lastSyncedAt: string | null;
  syncing: boolean;
  diagramCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Diagram {
  id: string;
  name: string;
  type: DiagramType;
  projectId: string;
  mermaidCode: string;
  viewMode: ViewMode;
  isValid: boolean;
  validationScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramDraft {
  name: string;
  type: DiagramType;
  description: string;
}

export const DIAGRAM_TYPES: Array<{ value: DiagramType; label: string; description: string }> = [
  { value: "CLASS", label: "Class", description: "Classes, interfaces & relationships" },
  { value: "SEQUENCE", label: "Sequence", description: "Message flows over time" },
  { value: "USE_CASE", label: "Use Case", description: "Actors & system behaviors" },
  { value: "STATE", label: "State", description: "State machines & transitions" },
  { value: "ACTIVITY", label: "Activity", description: "Workflows & branching" },
  { value: "COMPONENT", label: "Component", description: "System components & interfaces" },
  { value: "DEPLOYMENT", label: "Deployment", description: "Runtime topology" },
  { value: "ER", label: "ER", description: "Entity relationships (Crow's Foot)" },
  { value: "PACKAGE", label: "Package", description: "Namespace dependencies" },
];

export const RELATION_SPECS: Record<RelationType, { label: string; mermaid: string; marker: string }> = {
  inheritance: { label: "Inheritance", mermaid: "--|>", marker: "empty-triangle" },
  implementation: { label: "Implementation", mermaid: "..|>", marker: "empty-triangle" },
  association: { label: "Association", mermaid: "-->", marker: "arrow" },
  composition: { label: "Composition", mermaid: "*--", marker: "filled-diamond" },
  aggregation: { label: "Aggregation", mermaid: "o--", marker: "empty-diamond" },
  dependency: { label: "Dependency", mermaid: "..>", marker: "open-arrow" },
};

export const DEFAULT_CLASS_MERMAID = `classDiagram
    direction LR

    class User {
        +String id
        +String email
        +String passwordHash
        -DateTime createdAt
        +authenticate(password: String): Boolean
        +updateProfile(profile: Profile): User
    }

    class Profile {
        +String firstName
        +String lastName
        +String? avatarUrl
        +updateAvatar(url: String): void
    }

    class Session {
        +String token
        +DateTime expiresAt
        +refresh(): Session
        +revoke(): void
    }

    class AuthService {
        +login(email: String, password: String): Session
        +logout(session: Session): void
        +register(data: UserInput): User
    }

    class UserRepository {
        +findById(id: String): User
        +findByEmail(email: String): User
        +save(user: User): User
    }

    class AuthController {
        +handleLogin(req: Request): Response
        +handleRegister(req: Request): Response
    }

    User "1" --> "0..1" Profile : owns
    User "1" --> "0..*" Session : has
    User --> UserRepository : uses
    AuthService --> UserRepository : depends
    AuthService --> Session : issues
    AuthController --> AuthService : delegates
    AuthService ..> User : manages`;

export const DEFAULT_SEQUENCE_MERMAID = `sequenceDiagram
    participant Client
    participant AuthController
    participant AuthService
    participant UserRepository
    participant Database

    Client->>AuthController: POST /login {email, password}
    activate AuthController
    AuthController->>AuthService: login(email, password)
    activate AuthService
    AuthService->>UserRepository: findByEmail(email)
    activate UserRepository
    UserRepository->>Database: SELECT * FROM users
    Database-->>UserRepository: user row
    UserRepository-->>AuthService: User
    deactivate UserRepository
    AuthService->>AuthService: verifyPassword(hash, password)
    AuthService-->>AuthController: Session
    deactivate AuthService
    AuthController-->>Client: 200 {token, expiresAt}
    deactivate AuthController`;

export const DEFAULT_ER_MERMAID = `erDiagram
    USER ||--o{ PROFILE : "owns"
    USER ||--o{ SESSION : "has"
    USER {
        string id PK
        string email UK
        string passwordHash
        datetime createdAt
    }
    PROFILE {
        string id PK
        string firstName
        string lastName
        string userId FK
    }
    SESSION {
        string token PK
        datetime expiresAt
        string userId FK
    }`;

export function mermaidForType(type: DiagramType): string {
  switch (type) {
    case "CLASS":
      return DEFAULT_CLASS_MERMAID;
    case "SEQUENCE":
      return DEFAULT_SEQUENCE_MERMAID;
    case "ER":
      return DEFAULT_ER_MERMAID;
    case "USE_CASE":
      return `flowchart LR
    A[User] --> B(Login)
    B --> C{Authenticate}
    C -->|valid| D[Access Dashboard]
    C -->|invalid| E[Show Error]`;
    default:
      return DEFAULT_CLASS_MERMAID;
  }
}

/* ------------------------------------------------------------------ */
/* CANONICAL ARCHITECTURE MODEL — single source of truth for the app.  */
/* All consumers (renderer, AI copilot, docs, validation, export) must */
/* operate on this representation, never on independently reparsed    */
/* views of the diagram.                                               */
/* ------------------------------------------------------------------ */

export type ArchitectureNodeKind =
  | "class"
  | "abstract"
  | "interface"
  | "enum"
  | "entity"
  | "table"
  | "controller"
  | "service"
  | "repository"
  | "component"
  | "package"
  | "actor"
  | "boundary"
  | "external"
  | "database"
  | "api"
  | "event"
  | "state"
  /* --- Creately-style UML shape library kinds (round-trip via <<stereotype>>) --- */
  | "usecase"
  | "note"
  | "constraint"
  | "lifeline"
  | "start"
  | "end"
  | "decision"
  | "activity"
  | "fork"
  | "initial"
  | "final"
  | "swimlane"
  | "node"
  | "artifact"
  | "port"
  | "weak-entity"
  | "attribute"
  | "derived-attribute"
  | "relationship"
  | "weak-relationship"
  | "cloud"
  | "parallelogram"
  | "document"
  | "circle"
  | "diamond"
  | "rect"
  | "rounded-rect"
  /* --- sequence/annotation shapes (drop-on-canvas annotations) --- */
  | "activation"
  | "fragment"
  | "destroy"
  | "message"
  | "return-message"
  | "self-message"
  | "transition";

export type RelationshipMultiplicity = string; // "1" | "0..1" | "0..*" | "1..*" | "n" | "m..n"

export const MULTIPLICITY_PATTERN = /^(\d|\*|n|[m])\s*(\.\.\s*(\d|\*|n|[mn]))?$/;

export interface ArchitectureAttribute {
  name: string;
  type: string;
  visibility: Visibility;
  isStatic: boolean;
  isDerived: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isUnique?: boolean;
  isNullable?: boolean;
  defaultValue?: string | null;
}

export interface ArchitectureMethod {
  name: string;
  parameters: Array<{ name: string; type: string }>;
  returnType: string;
  visibility: Visibility;
  isStatic: boolean;
  isAbstract: boolean;
  isAsync: boolean;
  description?: string | null;
}

export interface ArchitectureNode {
  id: string;
  name: string;
  kind: ArchitectureNodeKind;
  stereotype: string | null;
  /** C4 hierarchy — id of the enclosing container node (Mermaid namespace), or null at top level. */
  parentId: string | null;
  attributes: ArchitectureAttribute[];
  methods: ArchitectureMethod[];
  isAbstract: boolean;
  isInterface: boolean;
  notes: string[];
  /** ER diagrams: true when the table was never declared with a block and
   * only appeared as an endpoint of a relationship. */
  implicit?: boolean;
  /** Client-side presentation (not serialized to Mermaid): fill/border/font. */
  style?: {
    fill?: string;
    border?: string;
    fontSize?: number;
    width?: number;
    height?: number;
  };
}

export type ArchitectureRelationshipType =
  | "association"
  | "inheritance"
  | "implementation"
  | "aggregation"
  | "composition"
  | "dependency"
  | "call"
  | "flow"
  | "reference"
  | "transition"
  | "include"
  | "extend"
  | "return"
  | "message"
  | "async";

export interface ArchitectureRelationship {
  id: string;
  source: string;
  target: string;
  type: ArchitectureRelationshipType;
  label: string | null;
  sourceMultiplicity: string; // "1" means exactly one
  targetMultiplicity: string;
  direction: "forward" | "reverse";
  action: string | null; // e.g. "retrieves", "persists", "authenticates"
  foreignKeyColumn: string | null; // ER diagrams: FK column on target end
  description?: string | null; // the requirement sentence that produced it
  /** Role names near each endpoint (client-rendered; not in Mermaid). */
  sourceRole?: string | null;
  targetRole?: string | null;
  /** Client-side presentation (not serialized to Mermaid). */
  style?: {
    color?: string;
    width?: number;
    dash?: string;
    routing?: "orthogonal" | "straight" | "curved";
  };
  /** Manually placed bend points for orthogonal routing (flow coordinates). */
  waypoints?: Array<{ x: number; y: number }>;
}

export interface Architecture {
  diagramType: DiagramType;
  title: string;
  nodes: ArchitectureNode[];
  relationships: ArchitectureRelationship[];
  notes: string[];
  sourceText: string | null;
}

export const VALID_MULTIPLICITIES = new Set<string>([
  "1",
  "0..1",
  "0..*",
  "1..*",
  "*",
  "n",
  "m..n",
]);

export const RELATIONSHIP_LABELS: Record<ArchitectureRelationshipType, string> = {
  association: "Association",
  inheritance: "Inheritance",
  implementation: "Implementation",
  aggregation: "Aggregation",
  composition: "Composition",
  dependency: "Dependency",
  call: "Call",
  flow: "Flow",
  reference: "Reference (FK)",
  transition: "Transition",
  include: "Include",
  extend: "Extend",
  return: "Return Message",
  message: "Message",
  async: "Async Message",
};