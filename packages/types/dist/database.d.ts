/**
 * Database types — Supabase auto-generated type definitions.
 * This is a placeholder for the actual Supabase type generation.
 *
 * In production, run: `npx supabase gen types typescript --project-id <id>`
 */
export type Workspace = {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
};
export type SupportSession = {
    id: string;
    workspace_id: string;
    visitor_id: string;
    status: 'active' | 'closed';
    created_at: string;
    updated_at: string;
};
export type SupportMessage = {
    id: string;
    session_id: string;
    role: 'user' | 'agent';
    content: string;
    created_at: string;
};
export type Lead = {
    id: string;
    workspace_id: string;
    name: string;
    email: string;
    score: number;
    status: 'new' | 'contacted' | 'qualified' | 'lost';
    created_at: string;
    updated_at: string;
};
export type AgentLog = {
    id: string;
    workspace_id: string;
    agent_type: string;
    session_id: string;
    event: string;
    metadata: Record<string, unknown>;
    created_at: string;
};
export type KnowledgeChunk = {
    id: string;
    workspace_id: string;
    source: string;
    content: string;
    embedding: number[];
    created_at: string;
};
export type Database = {
    public: {
        Tables: {
            workspaces: {
                Row: Workspace;
            };
            support_sessions: {
                Row: SupportSession;
            };
            support_messages: {
                Row: SupportMessage;
            };
            leads: {
                Row: Lead;
            };
            agent_logs: {
                Row: AgentLog;
            };
            knowledge_chunks: {
                Row: KnowledgeChunk;
            };
        };
    };
};
//# sourceMappingURL=database.d.ts.map