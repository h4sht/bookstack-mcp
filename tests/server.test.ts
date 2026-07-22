/**
 * Tests for the MCP server protocol.
 *
 * Tests the JSON-RPC handshake, tool listing, and tool execution
 * by connecting to the server using an in-memory transport.
 * The BookStack API is mocked so no real server is needed.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BookStackClient } from "../src/client.js";
import { createTools } from "../src/tools.js";
import type { MCPTool } from "../src/tools.js";

// ── In-Memory Transport ─────────────────────────────────────────────
//
// The MCP SDK doesn't expose an InMemoryTransport, so we build a minimal
// one. Each side (client/server) calls the other's onmessage/onerror as if
// messages were travelling over stdin/stdout. No real I/O, no subprocess.

type MessageHandler = (message: unknown) => Promise<void>;

class PairTransport implements Transport {
  private other: PairTransport | null = null;
  private _onmessage: MessageHandler | null = null;
  private _onerror: ((error: Error) => void) | null = null;
  private _onclose: (() => void) | null = null;
  private closed = false;

  /** Wire two transports together so messages flow both ways. */
  static pair(): [PairTransport, PairTransport] {
    const a = new PairTransport();
    const b = new PairTransport();
    a.other = b;
    b.other = a;
    return [a, b];
  }

  get onmessage(): MessageHandler | null { return this._onmessage; }
  set onmessage(h: MessageHandler | null) { this._onmessage = h; }
  get onerror(): ((error: Error) => void) | null { return this._onerror; }
  set onerror(h: ((error: Error) => void) | null) { this._onerror = h; }
  get onclose(): (() => void) | null { return this._onclose; }
  set onclose(h: (() => void) | null) { this._onclose = h; }

  async start(): Promise<void> {}
  async close(): Promise<void> {
    this.closed = true;
    this._onclose?.();
  }

  /** Send a message to the paired transport. */
  async send(message: unknown): Promise<void> {
    if (this.closed) return;
    // Deliver asynchronously so the caller's stack unwinds first
    Promise.resolve().then(() => {
      this.other?._onmessage?.(message);
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

const BASE_URL = "https://books.example.com/api";
const TOKEN = "test_id:test_secret";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: unknown;
};

function makeRpc(method: string, params?: Record<string, unknown>, id = 1): JsonRpcRequest {
  return { jsonrpc: "2.0", id, method, params };
}

/** Build a server with tools registered and a mocked BookStackClient. */
function buildServer(
  mockApiResponse: unknown = { data: [], total: 0 }
): { server: Server; clientTransport: PairTransport; fetchCalls: { url: string; method: string }[] } {
  const fetchCalls: { url: string; method: string }[] = [];

  // Mock fetch globally for all BookStackClient calls
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), method: init?.method || "GET" });
    // For 204 DELETE responses
    if (init?.method === "DELETE") {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify(mockApiResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }) as typeof fetch;

  const client = new BookStackClient({ baseUrl: BASE_URL, apiToken: TOKEN, timeout: 5000 });
  const tools = createTools(client);
  const toolMap = new Map<string, MCPTool>();
  for (const tool of tools) toolMap.set(tool.name, tool);

  const server = new Server(
    { name: "bookstack-mcp-test", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolMap.get(req.params.name);
    if (!tool) throw new Error(`Unknown tool: ${req.params.name}`);
    const result = await tool.handler((req.params.arguments || {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(result ?? {}) }] };
  });

  const [serverTransport, clientTransport] = PairTransport.pair();

  server.connect(serverTransport);

  // Restore fetch after test completes
  const cleanup = () => { globalThis.fetch = originalFetch; };

  return { server, clientTransport, fetchCalls: Object.assign(fetchCalls, { cleanup }) };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("BookStack MCP Server", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.BOOKSTACK_BASE_URL = BASE_URL;
    process.env.BOOKSTACK_API_TOKEN = TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Initialize Handshake ────────────────────────────────────────

  describe("Initialize handshake", () => {
    it("responds to initialize with server info", async () => {
      const { clientTransport, fetchCalls } = buildServer();
      try {
        const msg = makeRpc("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        });
        clientTransport.send(msg);

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        assert.equal(response.id, 1);
        const result = response.result as Record<string, unknown>;
        assert.equal(result.protocolVersion, "2024-11-05");
        assert.equal((result.serverInfo as Record<string, unknown>).name, "bookstack-mcp-test");
        assert.ok((result.capabilities as Record<string, unknown>).tools);
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });
  });

  // ── Tool Listing ────────────────────────────────────────────────

  describe("tools/list", () => {
    it("returns all 25 tools", async () => {
      const { clientTransport, fetchCalls } = buildServer();
      try {
        clientTransport.send(makeRpc("tools/list"));
        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        const tools = (response.result as { tools: unknown[] }).tools;
        assert.equal(tools.length, 25);

        // Verify all categories are present
        const names = tools.map((t: { name: string }) => t.name);
        assert.ok(names.includes("bookstack_list_books"));
        assert.ok(names.includes("bookstack_create_page"));
        assert.ok(names.includes("bookstack_search"));
        assert.ok(names.includes("bookstack_system_info"));
        assert.ok(names.includes("bookstack_export_page"));

        // Every tool has a schema
        for (const tool of tools) {
          const t = tool as { name: string; inputSchema: { type: string; properties: Record<string, unknown> } };
          assert.equal(t.inputSchema.type, "object");
          assert.ok(typeof t.inputSchema.properties === "object", `${t.name} has no properties`);
        }
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });
  });

  // ── Tool Execution ──────────────────────────────────────────────

  describe("tools/call", () => {
    it("bookstack_list_books calls the API", async () => {
      const { clientTransport, fetchCalls } = buildServer({
        data: [{ id: 1, name: "Test Book" }],
        total: 1,
      });
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_list_books",
          arguments: { count: 10 },
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        const content = (response.result as { content: { text: string }[] }).content;
        const parsed = JSON.parse(content[0].text);
        assert.equal(parsed.total, 1);
        assert.equal(parsed.data[0].name, "Test Book");
        assert.ok(fetchCalls.some((c) => c.url.includes("/books")));
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });

    it("bookstack_search formats results nicely", async () => {
      const { clientTransport, fetchCalls } = buildServer({
        data: [{
          id: 42,
          name: "Async Guide",
          type: "page",
          url: "https://books.example.com/books/async-guide",
          preview_html: { name: "Async Guide", content: "Python asyncio lets you..." },
          tags: [{ name: "python", value: "core" }],
          book: { id: 1, name: "Programming" },
        }],
        total: 1,
      });
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_search",
          arguments: { query: "async" },
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        const parsed = JSON.parse(
          (response.result as { content: { text: string }[] }).content[0].text
        );
        assert.equal(parsed.results.length, 1);
        assert.equal(parsed.results[0].name, "Async Guide");
        assert.equal(parsed.results[0].type, "page");
        assert.equal(parsed.results[0].book, "Programming");
        assert.deepEqual(parsed.results[0].tags, ["python: core"]);
        assert.ok(parsed.results[0].preview.includes("Python asyncio"));
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });

    it("bookstack_system_info works", async () => {
      const { clientTransport, fetchCalls } = buildServer({
        version: "26.0.0",
        instance_id: "abc-123",
        app_name: "TestStack",
        app_logo: "",
        base_url: "https://books.example.com",
      });
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_system_info",
          arguments: {},
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        const parsed = JSON.parse(
          (response.result as { content: { text: string }[] }).content[0].text
        );
        assert.equal(parsed.version, "26.0.0");
        assert.equal(parsed.app_name, "TestStack");
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });

    it("unknown tool returns error", async () => {
      const { clientTransport, fetchCalls } = buildServer();
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_fake_tool",
          arguments: {},
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        assert.ok(response.error, "Expected error for unknown tool");
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });

    it("bookstack_create_page with markdown", async () => {
      const { clientTransport, fetchCalls } = buildServer({
        id: 100, name: "New Page", book_id: 3, chapter_id: null,
      });
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_create_page",
          arguments: {
            book_id: 3,
            name: "New Page",
            markdown: "# Title\n\nContent here",
          },
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        const parsed = JSON.parse(
          (response.result as { content: { text: string }[] }).content[0].text
        );
        assert.equal(parsed.id, 100);
        assert.equal(parsed.name, "New Page");
        // Should have called POST /pages
        assert.ok(fetchCalls.some((c) => c.url.includes("/pages") && c.method === "POST"));
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });

    it("bookstack_create_page rejects both markdown and html", async () => {
      const { clientTransport, fetchCalls } = buildServer({ id: 1 });
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_create_page",
          arguments: {
            book_id: 1,
            name: "Test",
            markdown: "# Hello",
            html: "<h1>Hello</h1>",
          },
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        // The MCP SDK returns errors at the JSON-RPC level when a handler throws.
        // But our server.ts catches errors and returns them as tool-result errors.
        // In this test, since we're using a simplified server setup, the error
        // propagates through the SDK as a JSON-RPC error.
        if (response.error) {
          // SDK-level error propagation
          const errData = response.error as { message?: string };
          assert.ok(
            errData.message?.includes("Provide either") || JSON.stringify(errData).includes("Provide either"),
            "Should reject both markdown and html"
          );
        } else {
          // Tool-level error (isError: true in result)
          const content = (response.result as { content: { text: string }[]; isError: boolean }).content;
          const result = JSON.parse(content[0].text);
          assert.ok(result.error?.includes("Provide either"), "Should reject both markdown and html");
          assert.ok((response.result as { isError: boolean }).isError, "Should be marked as error");
        }
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });

    it("bookstack_delete_book works", async () => {
      const { clientTransport, fetchCalls } = buildServer(null);
      try {
        clientTransport.send(makeRpc("tools/call", {
          name: "bookstack_delete_book",
          arguments: { id: 77 },
        }));

        const response = await new Promise<JsonRpcResponse>((resolve) => {
          clientTransport.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
        });

        const parsed = JSON.parse(
          (response.result as { content: { text: string }[] }).content[0].text
        );
        assert.equal(parsed.success, true);
        assert.equal(parsed.deleted_id, 77);
      } finally {
        (fetchCalls as unknown as { cleanup(): void }).cleanup?.();
      }
    });
  });

  // ── API Error Propagation ───────────────────────────────────────

  describe("Error propagation", () => {
    it("propagates BookStack API errors gracefully", async () => {
      // Mock a 404 error from BookStack
      globalThis.fetch = (() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: "Entity not found" } }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          })
        )
      ) as typeof fetch;

      const client = new BookStackClient({ baseUrl: BASE_URL, apiToken: TOKEN, timeout: 5000 });
      const tools = createTools(client);
      const toolMap = new Map<string, MCPTool>();
      for (const tool of tools) toolMap.set(tool.name, tool);

      const server = new Server(
        { name: "test", version: "1.0.0" },
        { capabilities: { tools: {} } }
      );

      server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
      server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const tool = toolMap.get(req.params.name);
        if (!tool) throw new Error(`Unknown: ${req.params.name}`);
        try {
          const result = await tool.handler((req.params.arguments || {}) as Record<string, unknown>);
          return { content: [{ type: "text", text: JSON.stringify(result ?? {}) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: (err as Error).message,
              status: (err as { status?: number }).status,
              hint: "Check your request.",
            }) }],
            isError: true,
          };
        }
      });

      const [srv, cli] = PairTransport.pair();
      server.connect(srv);

      cli.send(makeRpc("tools/call", {
        name: "bookstack_get_book",
        arguments: { id: 99999 },
      }));

      const response = await new Promise<JsonRpcResponse>((resolve) => {
        cli.onmessage = (m: unknown) => resolve(m as JsonRpcResponse);
      });

      const content = (response.result as { content: { text: string }[]; isError: boolean }).content;
      const parsed = JSON.parse(content[0].text);
      assert.ok(parsed.error?.includes("Entity not found"), "Should propagate error message");
      assert.ok((response.result as { isError: boolean }).isError);
    });
  });
});
