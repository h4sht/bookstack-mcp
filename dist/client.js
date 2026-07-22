/** Error thrown when the BookStack API returns an error response. */
export class BookStackError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = "BookStackError";
    }
}
/**
 * Lightweight BookStack API client.
 *
 * Uses native `fetch` (Node 18+) for zero-dependency HTTP.
 * All methods return typed promises matching BookStack's API shapes.
 */
export class BookStackClient {
    baseUrl;
    headers;
    timeout;
    constructor(config) {
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
    async request(method, path, body, query) {
        const url = new URL(`${this.baseUrl}${path}`);
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value !== undefined)
                    url.searchParams.set(key, String(value));
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
            if (response.status === 204)
                return undefined;
            // Try JSON, fall back to text for non-JSON error bodies
            let data;
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                data = await response.json();
            }
            else {
                data = await response.text();
            }
            if (!response.ok) {
                const errObj = data && typeof data === "object" ? data : null;
                const innerErr = errObj?.error;
                const errMsg = (innerErr && typeof innerErr === "object" ? innerErr.message : undefined) ??
                    errObj?.message ??
                    `HTTP ${response.status}`;
                throw new BookStackError(String(errMsg), response.status, data);
            }
            return data;
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Export any resource type. Shared by books, chapters, pages. */
    async exportResource(resource, id, format) {
        const url = `${this.baseUrl}/${resource}/${id}/export/${format}`;
        const response = await fetch(url, {
            headers: { Authorization: this.headers.Authorization, Accept: "*/*" },
        });
        if (!response.ok) {
            throw new BookStackError(`Export failed: HTTP ${response.status}`, response.status, await response.text().catch(() => ""));
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
    listBooks(params) {
        return this.request("GET", "/books", undefined, params);
    }
    getBook(id) { return this.request("GET", `/books/${id}`); }
    createBook(params) { return this.request("POST", "/books", params); }
    updateBook(id, params) { return this.request("PUT", `/books/${id}`, params); }
    deleteBook(id) { return this.request("DELETE", `/books/${id}`); }
    exportBook(id, fmt) { return this.exportResource("books", id, fmt); }
    // ── Chapters ───────────────────────────────────────────────────
    listChapters(params) {
        return this.request("GET", "/chapters", undefined, params);
    }
    getChapter(id) { return this.request("GET", `/chapters/${id}`); }
    createChapter(params) { return this.request("POST", "/chapters", params); }
    updateChapter(id, params) { return this.request("PUT", `/chapters/${id}`, params); }
    deleteChapter(id) { return this.request("DELETE", `/chapters/${id}`); }
    exportChapter(id, fmt) { return this.exportResource("chapters", id, fmt); }
    // ── Pages ──────────────────────────────────────────────────────
    listPages(params) {
        return this.request("GET", "/pages", undefined, params);
    }
    getPage(id) { return this.request("GET", `/pages/${id}`); }
    createPage(params) { return this.request("POST", "/pages", params); }
    updatePage(id, params) { return this.request("PUT", `/pages/${id}`, params); }
    deletePage(id) { return this.request("DELETE", `/pages/${id}`); }
    exportPage(id, fmt) { return this.exportResource("pages", id, fmt); }
    // ── Shelves ────────────────────────────────────────────────────
    listShelves(params) {
        return this.request("GET", "/shelves", undefined, params);
    }
    getShelf(id) { return this.request("GET", `/shelves/${id}`); }
    createShelf(params) { return this.request("POST", "/shelves", params); }
    updateShelf(id, params) { return this.request("PUT", `/shelves/${id}`, params); }
    deleteShelf(id) { return this.request("DELETE", `/shelves/${id}`); }
    // ── Search & System ────────────────────────────────────────────
    search(params) {
        return this.request("GET", "/search", undefined, {
            query: params.query, page: params.page, count: params.count,
        });
    }
    getSystemInfo() { return this.request("GET", "/system"); }
}
// ── Helpers ─────────────────────────────────────────────────────────
function fmtMime(f) {
    return { html: "text/html", pdf: "application/pdf", plaintext: "text/plain", markdown: "text/markdown" }[f];
}
function fmtExt(f) {
    return { html: "html", pdf: "pdf", plaintext: "txt", markdown: "md" }[f];
}
//# sourceMappingURL=client.js.map