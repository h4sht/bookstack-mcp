/**
 * MCP tool definitions for BookStack operations.
 *
 * Each tool maps to a BookStack API endpoint. All handlers receive the
 * BookStackClient instance via closure over the client parameter.
 */
import type { BookStackClient } from "./client.js";
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}
export declare function createTools(client: BookStackClient): MCPTool[];
//# sourceMappingURL=tools.d.ts.map