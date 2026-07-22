#!/usr/bin/env node
/**
 * @h4sht/bookstack-mcp — MCP Server for BookStack
 *
 * Connects Claude Code, Codex, OpenCode and any MCP-compatible
 * AI assistant to your BookStack wiki via stdio transport.
 *
 * ## Quick Start
 *
 *   claude mcp add bookstack -- npx @h4sht/bookstack-mcp
 *
 * Then set env vars when prompted or pass them:
 *
 *   claude mcp add bookstack \\
 *     --env BOOKSTACK_BASE_URL=https://your-books.com/api \\
 *     --env BOOKSTACK_API_TOKEN=id:secret \\
 *     -- npx @h4sht/bookstack-mcp
 *
 * ## Architecture
 *
 * - Stdio transport only (no HTTP server, no open ports)
 * - 25 tools: Books, Chapters, Pages, Shelves, Search, System Info
 * - Markdown content (BookStack's native format)
 * - Single dependency: @modelcontextprotocol/sdk (official Anthropic)
 * - All logging to stderr (stdlib-protocol safe)
 *
 * ## Security
 *
 * 4 auditable TypeScript files. No telemetry. No external calls
 * beyond your configured BookStack API.
 */
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { BookStackClient, BookStackError } from "./client.js";
import { createTools } from "./tools.js";
function loadConfig() {
    const baseUrl = process.env.BOOKSTACK_BASE_URL;
    const apiToken = process.env.BOOKSTACK_API_TOKEN;
    const timeout = parseInt(process.env.BOOKSTACK_TIMEOUT || "30000", 10);
    if (!baseUrl) {
        console.error("❌  BOOKSTACK_BASE_URL is required.\n" +
            "    Set it to your BookStack API URL:\n" +
            '    export BOOKSTACK_BASE_URL="https://books.example.com/api"');
        process.exit(1);
    }
    if (!apiToken) {
        console.error("❌  BOOKSTACK_API_TOKEN is required.\n" +
            "    Create an API token in BookStack (Profile → API Tokens) and:\n" +
            '    export BOOKSTACK_API_TOKEN="token_id:token_secret"');
        process.exit(1);
    }
    try {
        new URL(baseUrl);
    }
    catch {
        console.error(`❌  BOOKSTACK_BASE_URL is not a valid URL: "${baseUrl}"\n` +
            "    Include the protocol and /api path.\n" +
            "    Example: https://books.example.com/api");
        process.exit(1);
    }
    return { baseUrl, apiToken, timeout };
}
// ── Logging ─────────────────────────────────────────────────────────
// ALL output to stderr. Stdout carries the MCP JSON-RPC stream.
// Writing anything else to stdout corrupts the protocol.
const LOG_PREFIX = "[@h4sht/bookstack-mcp]";
function log(msg, data) {
    const ts = new Date().toISOString();
    const extra = data ? " " + JSON.stringify(data) : "";
    console.error(`${ts} ${LOG_PREFIX} ${msg}${extra}`);
}
// ── Main ────────────────────────────────────────────────────────────
async function main() {
    log("Starting BookStack MCP Server...");
    const config = loadConfig();
    log("Configuration loaded. Base URL: " + new URL(config.baseUrl).origin + "/api");
    const client = new BookStackClient(config);
    const tools = createTools(client);
    const toolMap = new Map();
    for (const tool of tools)
        toolMap.set(tool.name, tool);
    log(`Registered ${tools.length} tools`);
    const server = new Server({ name: "@h4sht/bookstack-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
    // ── List tools ──────────────────────────────────────────────────
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        log(`Listing ${tools.length} tools`);
        return {
            tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
        };
    });
    // ── Call tool ───────────────────────────────────────────────────
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = toolMap.get(name);
        if (!tool) {
            log(`Unknown tool: ${name}`);
            throw new Error(`Unknown tool: ${name}. Available: ${[...toolMap.keys()].sort().join(", ")}`);
        }
        log(`Tool: ${name}`);
        try {
            const result = await tool.handler((args || {}));
            log(`OK: ${name}`);
            return {
                content: [{ type: "text", text: JSON.stringify(result ?? {}, null, 2) }],
            };
        }
        catch (error) {
            if (error instanceof BookStackError) {
                log(`BookStack error in ${name}: ${error.status} ${error.message}`);
                const hints = {
                    401: "Check BOOKSTACK_API_TOKEN — it may be invalid or expired.",
                    403: "Your API token lacks permission for this operation.",
                    404: "Resource not found. Verify the ID is correct.",
                    409: "Conflict. A resource with this name may already exist.",
                    422: "Validation error. Check the input fields.",
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                error: error.message,
                                status: error.status,
                                hint: hints[error.status] || `HTTP ${error.status} error from BookStack.`,
                            }, null, 2),
                        },
                    ],
                    isError: true,
                };
            }
            const msg = error instanceof Error ? error.message : String(error);
            log(`Error in ${name}: ${msg}`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ error: msg, hint: "An unexpected error occurred." }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });
    // ── Connect stdio ───────────────────────────────────────────────
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log(`Ready. ${tools.length} tools, connected to ${new URL(config.baseUrl).origin}/api`);
    log("Waiting for MCP requests on stdin...");
    // Graceful shutdown
    const shutdown = async () => {
        log("Shutting down...");
        await server.close();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
// Only run when executed directly, not when imported.
// Uses the standard Node.js ESM pattern: compare argv[1] against import.meta.url.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch((error) => {
        console.error(`${LOG_PREFIX} Fatal:`, error);
        process.exit(1);
    });
}
export { BookStackClient, createTools };
//# sourceMappingURL=index.js.map