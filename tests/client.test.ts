/**
 * Tests for BookStackClient - the HTTP layer.
 *
 * Mocks global fetch to test all CRUD operations, error handling,
 * export, search, and edge cases without a real BookStack instance.
 */
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { BookStackClient, BookStackError } from "../src/client.js";

// ── Helpers ─────────────────────────────────────────────────────────

const BASE_URL = "https://books.example.com/api";
const TOKEN = "test_id:test_secret";

/** Build a fake Response object for fetch mocking. */
function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

/** Create a client with the mock fetch already in place. */
function makeClient(timeout = 5000): BookStackClient {
  return new BookStackClient({ baseUrl: BASE_URL, apiToken: TOKEN, timeout });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("BookStackClient", () => {
  let originalFetch: typeof fetch;
  let fetchCalls: { url: string; method: string; body?: string }[] = [];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: Response): void {
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      fetchCalls.push({
        url: String(url),
        method: init?.method || "GET",
        body: init?.body as string | undefined,
      });
      return Promise.resolve(response);
    }) as typeof fetch;
  }

  // ── Books ──────────────────────────────────────────────────────

  describe("Books", () => {
    it("listBooks sends GET /books", async () => {
      mockFetch(jsonResponse({ data: [{ id: 1, name: "My Book" }], total: 1 }));
      const client = makeClient();
      const result = await client.listBooks({ count: 10, offset: 0, sort: "-created_at" });
      assert.equal(result.total, 1);
      assert.equal(result.data[0].name, "My Book");
      assert.ok(fetchCalls[0].url.includes("/books"));
      assert.ok(fetchCalls[0].url.includes("count=10"));
      assert.ok(fetchCalls[0].url.includes("sort=-created_at"));
    });

    it("getBook sends GET /books/:id", async () => {
      mockFetch(jsonResponse({ id: 5, name: "Test Book", contents: [] }));
      const client = makeClient();
      const book = await client.getBook(5);
      assert.equal(book.id, 5);
      assert.equal(book.name, "Test Book");
      assert.ok(fetchCalls[0].url.endsWith("/books/5"));
    });

    it("createBook sends POST /books with body", async () => {
      mockFetch(jsonResponse({ id: 99, name: "New Book" }, 200));
      const client = makeClient();
      const book = await client.createBook({ name: "New Book", description: "Desc" });
      assert.equal(book.id, 99);
      assert.equal(fetchCalls[0].method, "POST");
      assert.ok(JSON.parse(fetchCalls[0].body!).name === "New Book");
    });

    it("updateBook sends PUT /books/:id", async () => {
      mockFetch(jsonResponse({ id: 10, name: "Updated" }));
      const client = makeClient();
      const book = await client.updateBook(10, { name: "Updated" });
      assert.equal(book.name, "Updated");
      assert.equal(fetchCalls[0].method, "PUT");
      assert.ok(fetchCalls[0].url.endsWith("/books/10"));
    });

    it("deleteBook sends DELETE /books/:id", async () => {
      mockFetch(noContentResponse());
      const client = makeClient();
      await client.deleteBook(7);
      assert.equal(fetchCalls[0].method, "DELETE");
      assert.ok(fetchCalls[0].url.endsWith("/books/7"));
    });
  });

  // ── Pages ──────────────────────────────────────────────────────

  describe("Pages", () => {
    it("createPage sends markdown (not html)", async () => {
      mockFetch(jsonResponse({ id: 42, name: "My Page", book_id: 1 }));
      const client = makeClient();
      const page = await client.createPage({
        book_id: 1,
        name: "My Page",
        markdown: "# Hello\nWorld",
      });
      assert.equal(page.id, 42);
      const body = JSON.parse(fetchCalls[0].body!);
      assert.equal(body.markdown, "# Hello\nWorld");
      assert.equal(body.html, undefined);
    });

    it("getPage returns PageWithContent", async () => {
      mockFetch(jsonResponse({
        id: 42, book_id: 1, chapter_id: null, name: "Test",
        html: "<h1>Hi</h1>", raw_html: "<h1>Hi</h1>", markdown: "# Hi",
        revision_count: 1, editor: "markdown", draft: false, template: false,
        priority: 0,
      }));
      const client = makeClient();
      const page = await client.getPage(42);
      assert.equal(page.markdown, "# Hi");
      assert.equal(page.html, "<h1>Hi</h1>");
    });
  });

  // ── Chapters ───────────────────────────────────────────────────

  describe("Chapters", () => {
    it("createChapter requires book_id", async () => {
      mockFetch(jsonResponse({ id: 3, name: "Ch1", book_id: 1 }));
      const client = makeClient();
      const ch = await client.createChapter({ book_id: 1, name: "Ch1" });
      assert.equal(ch.book_id, 1);
      const body = JSON.parse(fetchCalls[0].body!);
      assert.equal(body.book_id, 1);
      assert.equal(body.name, "Ch1");
    });
  });

  // ── Shelves ────────────────────────────────────────────────────

  describe("Shelves", () => {
    it("createShelf with books", async () => {
      mockFetch(jsonResponse({ id: 8, name: "Shelf" }));
      const client = makeClient();
      const shelf = await client.createShelf({ name: "Shelf", books: [1, 2, 3] });
      assert.equal(shelf.id, 8);
      const body = JSON.parse(fetchCalls[0].body!);
      assert.deepEqual(body.books, [1, 2, 3]);
    });
  });

  // ── Search ─────────────────────────────────────────────────────

  describe("Search", () => {
    it("search sends query parameter", async () => {
      mockFetch(jsonResponse({ data: [], total: 0 }));
      const client = makeClient();
      const result = await client.search({ query: "async python", count: 20 });
      assert.equal(result.total, 0);
      // URLSearchParams may encode spaces as + or %20 depending on impl
      assert.ok(
        fetchCalls[0].url.includes("query=async") &&
        (fetchCalls[0].url.includes("%20python") || fetchCalls[0].url.includes("+python")),
        `URL should contain encoded query, got: ${fetchCalls[0].url}`
      );
      assert.ok(fetchCalls[0].url.includes("count=20"));
    });
  });

  // ── System Info ────────────────────────────────────────────────

  describe("System", () => {
    it("getSystemInfo returns version", async () => {
      mockFetch(jsonResponse({
        version: "25.1.0",
        instance_id: "xxx",
        app_name: "BookStack",
        app_logo: "",
        base_url: "https://books.example.com",
      }));
      const client = makeClient();
      const info = await client.getSystemInfo();
      assert.equal(info.version, "25.1.0");
      assert.equal(info.app_name, "BookStack");
    });
  });

  // ── Error Handling ─────────────────────────────────────────────

  describe("Error handling", () => {
    it("throws BookStackError on 404", async () => {
      mockFetch(jsonResponse({ error: { message: "Not found" } }, 404));
      const client = makeClient();
      await assert.rejects(
        () => client.getBook(99999),
        (err: unknown) => {
          return err instanceof BookStackError && (err as BookStackError).status === 404;
        }
      );
    });

    it("throws BookStackError on 401", async () => {
      mockFetch(jsonResponse({ error: { message: "Unauthorized" } }, 401));
      const client = makeClient();
      await assert.rejects(
        () => client.getSystemInfo(),
        (err: unknown) => {
          return err instanceof BookStackError && (err as BookStackError).status === 401;
        }
      );
    });

    it("throws BookStackError on 422 validation error", async () => {
      mockFetch(jsonResponse({ error: { message: "Validation failed" } }, 422));
      const client = makeClient();
      await assert.rejects(
        () => client.createBook({ name: "" }),
        (err: unknown) => {
          return err instanceof BookStackError && (err as BookStackError).status === 422;
        }
      );
    });

    it("handles non-JSON error responses", async () => {
      mockFetch(textResponse("Internal Server Error", 500));
      const client = makeClient();
      await assert.rejects(
        () => client.listBooks(),
        (err: unknown) => err instanceof BookStackError && (err as BookStackError).status === 500
      );
    });
  });

  // ── Exports ────────────────────────────────────────────────────

  describe("Export", () => {
    it("exportPage returns markdown content", async () => {
      const markdown = "# Hello World\n\nThis is a test page.";
      const encoder = new TextEncoder();
      const bytes = encoder.encode(markdown);
      mockFetch(
        new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "attachment; filename*=UTF-8''export-page.md",
          },
        })
      );
      const client = makeClient();
      const result = await client.exportPage(1, "markdown");
      assert.equal(result.content, markdown);
      assert.equal(result.encoding, "utf8");
      assert.equal(result.mime_type, "text/markdown");
      assert.equal(result.byte_length, bytes.length);
    });

    it("exportBook with pdf returns base64", async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      mockFetch(
        new Response(pdfBytes, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "attachment; filename*=UTF-8''book.pdf",
          },
        })
      );
      const client = makeClient();
      const result = await client.exportBook(1, "pdf");
      assert.equal(result.encoding, "base64");
      assert.equal(result.mime_type, "application/pdf");
      assert.ok(result.content.length > 0);
    });

    it("exportPage throws on error", async () => {
      mockFetch(new Response("Not Found", { status: 404 }));
      const client = makeClient();
      await assert.rejects(
        () => client.exportPage(9999, "markdown"),
        (err: unknown) => err instanceof BookStackError && (err as BookStackError).status === 404
      );
    });
  });

  // ── Pagination & Query Params ──────────────────────────────────

  describe("Pagination", () => {
    it("listPages respects count and offset", async () => {
      mockFetch(jsonResponse({ data: [], total: 100 }));
      const client = makeClient();
      await client.listPages({ count: 25, offset: 50 });
      assert.ok(fetchCalls[0].url.includes("count=25"));
      assert.ok(fetchCalls[0].url.includes("offset=50"));
    });

    it("listBooks defaults when no params", async () => {
      mockFetch(jsonResponse({ data: [], total: 0 }));
      const client = makeClient();
      await client.listBooks();
      assert.ok(fetchCalls[0].url.includes("/books"));
      assert.ok(!fetchCalls[0].url.includes("count="));
    });
  });

  // ── Auth Header ────────────────────────────────────────────────

  describe("Authentication", () => {
    it("sends Authorization header", async () => {
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = ((url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return Promise.resolve(jsonResponse({ data: [], total: 0 }));
      }) as typeof fetch;

      const client = makeClient();
      await client.listBooks();
      assert.ok(capturedHeaders["Authorization"]?.includes("Token"));
      assert.ok(capturedHeaders["Authorization"]?.includes(TOKEN));
    });
  });

  // ── Timeout ────────────────────────────────────────────────────

  describe("Timeout", () => {
    it("aborts after timeout", async () => {
      globalThis.fetch = (() => {
        return new Promise((_, reject) => {
          const err = new DOMException("The operation was aborted", "AbortError");
          reject(err);
        });
      }) as typeof fetch;

      const client = new BookStackClient({ baseUrl: BASE_URL, apiToken: TOKEN, timeout: 10 });
      await assert.rejects(() => client.listBooks());
    });
  });
});
