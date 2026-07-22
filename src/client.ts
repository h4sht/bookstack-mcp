/**
 * Simple BookStack API client.
 *
 * Handles authentication and JSON requests to the BookStack REST API.
 * Uses the native `fetch` API (Node 18+) to keep dependencies minimal.
 */
import type {
  Book,
  BookWithContents,
  Bookshelf,
  BookshelfWithBooks,
  Chapter,
  ChapterWithPages,
  CreateBookParams,
  CreateChapterParams,
  CreatePageParams,
  CreateShelfParams,
  ExportFormat,
  ExportResult,
  ListResponse,
  Page,
  PageWithContent,
  SearchParams,
  SearchResult,
  SystemInfo,
  UpdateBookParams,
  UpdateChapterParams,
  UpdatePageParams,
  UpdateShelfParams,
} from "./types.js";

/** Error thrown when the BookStack API returns an error response. */
export class BookStackError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
    this.name = "BookStackError";
  }
}

/** Configuration for the BookStack API client. */
export interface ClientConfig {
  baseUrl: string;
  apiToken: string;
  timeout: number;
}

/**
 * Lightweight BookStack API client.
 *
 * Uses native `fetch` (Node 18+) for zero-dependency HTTP.
 * All methods return typed promises matching BookStack's API shapes.
 */
export class BookStackClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeout = config.timeout;
    this.headers = {
      Authorization: `Token ${config.apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "@h4sht/bookstack-mcp/1.0.0",
    };
  }

  // ── Core HTTP ──────────────────────────────────────────────────

  /** Perform a JSON request to the BookStack API. */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      // 204 No Content → return undefined for void-typed deletes
      if (response.status === 204) return undefined as T;

      // Try JSON, fall back to text for non-JSON error bodies
      let data: unknown;
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errObj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
        const innerErr = errObj?.error;
        const errMsg =
          (innerErr && typeof innerErr === "object" ? (innerErr as Record<string, unknown>).message : undefined) ??
          errObj?.message ??
          `HTTP ${response.status}`;
        throw new BookStackError(String(errMsg), response.status, data);
      }

      return data as T;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Export any resource type. Shared by books, chapters, pages. */
  private async exportResource(
    resource: "books" | "chapters" | "pages",
    id: number,
    format: ExportFormat,
  ): Promise<ExportResult> {
    const url = `${this.baseUrl}/${resource}/${id}/export/${format}`;
    const response = await fetch(url, {
      headers: { Authorization: this.headers.Authorization, Accept: "*/*" },
    });

    if (!response.ok) {
      throw new BookStackError(
        `Export failed: HTTP ${response.status}`,
        response.status,
        await response.text().catch(() => ""),
      );
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const isBinary = format === "pdf";
    const content = isBinary
      ? Buffer.from(bytes).toString("base64")
      : new TextDecoder().decode(bytes);

    const disp = response.headers.get("content-disposition") || "";
    const fnMatch = disp.match(/filename\*?=(?:UTF-8''|")([^";]+)/);
    const filename = fnMatch?.[1] || `${resource.slice(0, -1)}-${id}.${fmtExt(format)}`;

    return {
      content,
      filename,
      mime_type: fmtMime(format),
      encoding: isBinary ? "base64" : "utf8",
      byte_length: bytes.length,
    };
  }

  // ── Books ──────────────────────────────────────────────────────

  listBooks(params?: { count?: number; offset?: number; sort?: string }) {
    return this.request<ListResponse<Book>>("GET", "/books", undefined, params);
  }
  getBook(id: number) { return this.request<BookWithContents>("GET", `/books/${id}`); }
  createBook(params: CreateBookParams) { return this.request<Book>("POST", "/books", params); }
  updateBook(id: number, params: UpdateBookParams) { return this.request<Book>("PUT", `/books/${id}`, params); }
  deleteBook(id: number) { return this.request<void>("DELETE", `/books/${id}`); }
  exportBook(id: number, fmt: ExportFormat) { return this.exportResource("books", id, fmt); }

  // ── Chapters ───────────────────────────────────────────────────

  listChapters(params?: { count?: number; offset?: number; sort?: string }) {
    return this.request<ListResponse<Chapter>>("GET", "/chapters", undefined, params);
  }
  getChapter(id: number) { return this.request<ChapterWithPages>("GET", `/chapters/${id}`); }
  createChapter(params: CreateChapterParams) { return this.request<Chapter>("POST", "/chapters", params); }
  updateChapter(id: number, params: UpdateChapterParams) { return this.request<Chapter>("PUT", `/chapters/${id}`, params); }
  deleteChapter(id: number) { return this.request<void>("DELETE", `/chapters/${id}`); }
  exportChapter(id: number, fmt: ExportFormat) { return this.exportResource("chapters", id, fmt); }

  // ── Pages ──────────────────────────────────────────────────────

  listPages(params?: { count?: number; offset?: number; sort?: string }) {
    return this.request<ListResponse<Page>>("GET", "/pages", undefined, params);
  }
  getPage(id: number) { return this.request<PageWithContent>("GET", `/pages/${id}`); }
  createPage(params: CreatePageParams) { return this.request<Page>("POST", "/pages", params); }
  updatePage(id: number, params: UpdatePageParams) { return this.request<Page>("PUT", `/pages/${id}`, params); }
  deletePage(id: number) { return this.request<void>("DELETE", `/pages/${id}`); }
  exportPage(id: number, fmt: ExportFormat) { return this.exportResource("pages", id, fmt); }

  // ── Shelves ────────────────────────────────────────────────────

  listShelves(params?: { count?: number; offset?: number; sort?: string }) {
    return this.request<ListResponse<Bookshelf>>("GET", "/shelves", undefined, params);
  }
  getShelf(id: number) { return this.request<BookshelfWithBooks>("GET", `/shelves/${id}`); }
  createShelf(params: CreateShelfParams) { return this.request<Bookshelf>("POST", "/shelves", params); }
  updateShelf(id: number, params: UpdateShelfParams) { return this.request<Bookshelf>("PUT", `/shelves/${id}`, params); }
  deleteShelf(id: number) { return this.request<void>("DELETE", `/shelves/${id}`); }

  // ── Search & System ────────────────────────────────────────────

  search(params: SearchParams) {
    return this.request<ListResponse<SearchResult>>("GET", "/search", undefined, {
      query: params.query, page: params.page, count: params.count,
    });
  }
  getSystemInfo() { return this.request<SystemInfo>("GET", "/system"); }
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmtMime(f: ExportFormat): string {
  return { html: "text/html", pdf: "application/pdf", plaintext: "text/plain", markdown: "text/markdown" }[f];
}
function fmtExt(f: ExportFormat): string {
  return { html: "html", pdf: "pdf", plaintext: "txt", markdown: "md" }[f];
}
