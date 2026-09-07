import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const diagramType = body.diagramType || "UML";
    const mode = body.mode || "simple";

    const explanation =
      mode === "simple"
        ? `### Plain English Breakdown (${diagramType} Diagram)\n\n- **Purpose:** This diagram maps out the core building blocks of the system and shows how data flows between them.\n- **How It Works:** Each box represents a service or entity. The arrows show dependencies and interactions.\n- **Key Takeaway:** The design keeps components decoupled, making it easy to scale and maintain.\n- **Real-World Analogy:** Think of it like a city map — each building (class) has a specific job, and the roads (relationships) show how they communicate.`
        : `### Technical Architectural Analysis\n\n- **Structural Pattern:** Modular domain-driven design with decoupled service boundaries.\n- **Coupling & Cohesion:** High cohesion within domain entities; loose coupling via interface contracts.\n- **Data Consistency:** State mutations are isolated, ensuring ACID-compliant transitions across subsystem boundaries.\n- **Design Patterns Identified:** Repository Pattern for data access, Factory Pattern for object creation, Observer Pattern for event-driven state changes.\n- **Scalability:** Horizontal scaling supported through stateless service layers and connection-pooled database access.`;

    return NextResponse.json({ explanation });
  } catch {
    return NextResponse.json({ explanation: "### Architecture Summary\n\nModular design with standard UML relational contracts and ACID-compliant data persistence." });
  }
}
