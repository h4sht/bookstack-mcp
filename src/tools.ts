/**
 * MCP tool definitions for BookStack operations.
 *
 * Each tool maps to a BookStack API endpoint. All handlers receive the
 * BookStackClient instance via closure over the client parameter.
 */
import type { BookStackClient } from "./client.js";
import type { ExportFormat } from "./types.js";

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

// ── Reusable schema fragments ───────────────────────────────────────

const TAG_ITEM = {
  type: "object",
  properties: {
    name: { type: "string", description: "Tag name" },
    value: { type: "string", description: "Tag value" },
    order: { type: "integer", description: "Tag ordering (use 0 for default)", default: 0 },
  },
  required: ["name", "value"],
};

const TAGS_ARRAY = {
  type: "array",
  description: "Tags to assign to the entity",
  items: TAG_ITEM,
};

const PAGINATION = {
  count: { type: "integer", description: "Number of items to return (max 100)", minimum: 1, maximum: 100 },
  offset: { type: "integer", description: "Number of items to skip for pagination", minimum: 0 },
  sort: { type: "string", description: "Sort expression. Prefix with '-' for descending. Examples: '-created_at', 'name'" },
};

// ── Helpers ─────────────────────────────────────────────────────────

function rejectBoth(args: Record<string, unknown>): void {
  if (args.markdown && args.html) {
    throw new Error(
      "Provide either 'markdown' OR 'html' for page content, not both. Markdown is recommended since BookStack converts it to HTML automatically."
    );
  }
}

function cleanTags(tags: unknown): { name: string; value: string; order: number }[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  return tags.map((t: Record<string, unknown>) => ({
    name: String(t.name || ""),
    value: String(t.value || ""),
    order: typeof t.order === "number" ? t.order : 0,
  }));
}

// ── Tool factory ────────────────────────────────────────────────────

export function createTools(client: BookStackClient): MCPTool[] {
  return [
    // ═══ Books ═══════════════════════════════════════════════════
    {
      name: "bookstack_list_books",
      description: "List all books in BookStack with pagination and sorting.",
      inputSchema: { type: "object", properties: { ...PAGINATION } },
      handler: async (args) => client.listBooks({
        count: args.count as number | undefined,
        offset: args.offset as number | undefined,
        sort: args.sort as string | undefined,
      }),
    },
    {
      name: "bookstack_get_book",
      description: "Get a book by ID with its full table of contents (chapters and pages).",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The book ID" } },
        required: ["id"],
      },
      handler: async (args) => client.getBook(args.id as number),
    },
    {
      name: "bookstack_create_book",
      description: "Create a new book in BookStack.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Book name/title", minLength: 1 },
          description: { type: "string", description: "Book description (HTML or plain text)" },
          tags: TAGS_ARRAY,
        },
        required: ["name"],
      },
      handler: async (args) => client.createBook({
        name: args.name as string,
        description: args.description as string | undefined,
        tags: cleanTags(args.tags),
      }),
    },
    {
      name: "bookstack_update_book",
      description: "Update an existing book's metadata.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The book ID to update" },
          name: { type: "string", description: "New name", minLength: 1 },
          description: { type: "string", description: "New description" },
          tags: TAGS_ARRAY,
        },
        required: ["id"],
      },
      handler: async (args) => client.updateBook(args.id as number, {
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        tags: cleanTags(args.tags),
      }),
    },
    {
      name: "bookstack_delete_book",
      description: "Delete a book permanently. This removes all chapters and pages inside it.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The book ID to delete" } },
        required: ["id"],
      },
      handler: async (args) => {
        await client.deleteBook(args.id as number);
        return { success: true, deleted_id: args.id };
      },
    },
    {
      name: "bookstack_export_book",
      description: "Export a book in html, pdf, plaintext, or markdown. Use markdown for AI processing.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The book ID" },
          format: { type: "string", enum: ["html", "pdf", "plaintext", "markdown"], description: "Export format" },
        },
        required: ["id", "format"],
      },
      handler: async (args) => client.exportBook(args.id as number, (args.format as ExportFormat) || "markdown"),
    },

    // ═══ Chapters ════════════════════════════════════════════════
    {
      name: "bookstack_list_chapters",
      description: "List all chapters in BookStack.",
      inputSchema: { type: "object", properties: { ...PAGINATION } },
      handler: async (args) => client.listChapters({
        count: args.count as number | undefined,
        offset: args.offset as number | undefined,
        sort: args.sort as string | undefined,
      }),
    },
    {
      name: "bookstack_get_chapter",
      description: "Get a chapter by ID with its nested pages.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The chapter ID" } },
        required: ["id"],
      },
      handler: async (args) => client.getChapter(args.id as number),
    },
    {
      name: "bookstack_create_chapter",
      description: "Create a new chapter inside a book.",
      inputSchema: {
        type: "object",
        properties: {
          book_id: { type: "integer", description: "The book ID to place the chapter in" },
          name: { type: "string", description: "Chapter name/title", minLength: 1 },
          description: { type: "string", description: "Chapter description (HTML or plain text)" },
          tags: TAGS_ARRAY,
          priority: { type: "integer", description: "Sort order within the book (lower = first)" },
        },
        required: ["book_id", "name"],
      },
      handler: async (args) => client.createChapter({
        book_id: args.book_id as number,
        name: args.name as string,
        description: args.description as string | undefined,
        tags: cleanTags(args.tags),
        priority: args.priority as number | undefined,
      }),
    },
    {
      name: "bookstack_update_chapter",
      description: "Update an existing chapter.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The chapter ID to update" },
          book_id: { type: "integer", description: "Move chapter to a different book" },
          name: { type: "string", description: "New name", minLength: 1 },
          description: { type: "string", description: "New description" },
          tags: TAGS_ARRAY,
          priority: { type: "integer", description: "New sort order" },
        },
        required: ["id"],
      },
      handler: async (args) => client.updateChapter(args.id as number, {
        book_id: args.book_id as number | undefined,
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        tags: cleanTags(args.tags),
        priority: args.priority as number | undefined,
      }),
    },
    {
      name: "bookstack_delete_chapter",
      description: "Delete a chapter permanently. This also deletes all pages inside it.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The chapter ID to delete" } },
        required: ["id"],
      },
      handler: async (args) => {
        await client.deleteChapter(args.id as number);
        return { success: true, deleted_id: args.id };
      },
    },
    {
      name: "bookstack_export_chapter",
      description: "Export a chapter in html, pdf, plaintext, or markdown.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The chapter ID" },
          format: { type: "string", enum: ["html", "pdf", "plaintext", "markdown"], description: "Export format" },
        },
        required: ["id", "format"],
      },
      handler: async (args) => client.exportChapter(args.id as number, (args.format as ExportFormat) || "markdown"),
    },

    // ═══ Pages ═══════════════════════════════════════════════════
    {
      name: "bookstack_list_pages",
      description: "List all pages in BookStack.",
      inputSchema: { type: "object", properties: { ...PAGINATION } },
      handler: async (args) => client.listPages({
        count: args.count as number | undefined,
        offset: args.offset as number | undefined,
        sort: args.sort as string | undefined,
      }),
    },
    {
      name: "bookstack_get_page",
      description: "Get a page by ID with its full content (HTML and markdown fields).",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The page ID" } },
        required: ["id"],
      },
      handler: async (args) => client.getPage(args.id as number),
    },
    {
      name: "bookstack_create_page",
      description:
        "Create a new page. Provide content in markdown (recommended) OR html, not both. " +
        "BookStack automatically converts markdown to HTML internally.",
      inputSchema: {
        type: "object",
        properties: {
          book_id: { type: "integer", description: "The book ID to create the page in" },
          chapter_id: { type: "integer", description: "Optional: chapter ID to nest the page inside" },
          name: { type: "string", description: "Page title", minLength: 1 },
          markdown: { type: "string", description: "Page content in Markdown (recommended). Do NOT use with 'html'." },
          html: { type: "string", description: "Page content in HTML. Do NOT use with 'markdown'." },
          tags: TAGS_ARRAY,
          priority: { type: "integer", description: "Sort order (lower = first)" },
        },
        required: ["book_id", "name"],
      },
      handler: async (args) => {
        rejectBoth(args);
        const md = args.markdown as string | undefined;
        const rawHtml = args.html as string | undefined;
        return client.createPage({
          book_id: args.book_id as number,
          chapter_id: args.chapter_id as number | undefined,
          name: args.name as string,
          markdown: md,
          html: md ? undefined : rawHtml,
          tags: cleanTags(args.tags),
          priority: args.priority as number | undefined,
        });
      },
    },
    {
      name: "bookstack_update_page",
      description:
        "Update a page's content or metadata. Provide markdown (recommended) OR html, not both. " +
        "Content REPLACES the existing page content entirely.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The page ID to update" },
          book_id: { type: "integer", description: "Move page to a different book" },
          chapter_id: { type: "integer", description: "Move page to a different chapter (0 = book root)" },
          name: { type: "string", description: "New page title", minLength: 1 },
          markdown: { type: "string", description: "New content in Markdown (recommended). Do NOT use with 'html'." },
          html: { type: "string", description: "New content in HTML. Do NOT use with 'markdown'." },
          tags: TAGS_ARRAY,
          priority: { type: "integer", description: "New sort order" },
        },
        required: ["id"],
      },
      handler: async (args) => {
        rejectBoth(args);
        const md = args.markdown as string | undefined;
        const rawHtml = args.html as string | undefined;
        return client.updatePage(args.id as number, {
          book_id: args.book_id as number | undefined,
          chapter_id: args.chapter_id as number | undefined,
          name: args.name as string | undefined,
          markdown: md,
          html: md ? undefined : rawHtml,
          tags: cleanTags(args.tags),
          priority: args.priority as number | undefined,
        });
      },
    },
    {
      name: "bookstack_delete_page",
      description: "Delete a page permanently.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The page ID to delete" } },
        required: ["id"],
      },
      handler: async (args) => {
        await client.deletePage(args.id as number);
        return { success: true, deleted_id: args.id };
      },
    },
    {
      name: "bookstack_export_page",
      description: "Export a page in html, pdf, plaintext, or markdown. Use markdown to get editable AI-compatible content.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The page ID" },
          format: { type: "string", enum: ["html", "pdf", "plaintext", "markdown"], description: "Export format" },
        },
        required: ["id", "format"],
      },
      handler: async (args) => client.exportPage(args.id as number, (args.format as ExportFormat) || "markdown"),
    },

    // ═══ Shelves ═════════════════════════════════════════════════
    {
      name: "bookstack_list_shelves",
      description: "List all bookshelves in BookStack.",
      inputSchema: { type: "object", properties: { ...PAGINATION } },
      handler: async (args) => client.listShelves({
        count: args.count as number | undefined,
        offset: args.offset as number | undefined,
        sort: args.sort as string | undefined,
      }),
    },
    {
      name: "bookstack_get_shelf",
      description: "Get a bookshelf by ID with its contained books.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The shelf ID" } },
        required: ["id"],
      },
      handler: async (args) => client.getShelf(args.id as number),
    },
    {
      name: "bookstack_create_shelf",
      description: "Create a new bookshelf to organize books.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Shelf name", minLength: 1 },
          description: { type: "string", description: "Shelf description" },
          tags: TAGS_ARRAY,
          books: { type: "array", description: "Initial book IDs for the shelf", items: { type: "integer" } },
        },
        required: ["name"],
      },
      handler: async (args) => client.createShelf({
        name: args.name as string,
        description: args.description as string | undefined,
        tags: cleanTags(args.tags),
        books: args.books as number[] | undefined,
      }),
    },
    {
      name: "bookstack_update_shelf",
      description: "Update a bookshelf's properties or book assignments.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "integer", description: "The shelf ID to update" },
          name: { type: "string", description: "New name", minLength: 1 },
          description: { type: "string", description: "New description" },
          tags: TAGS_ARRAY,
          books: { type: "array", description: "Complete list of book IDs (replaces existing)", items: { type: "integer" } },
        },
        required: ["id"],
      },
      handler: async (args) => client.updateShelf(args.id as number, {
        name: args.name as string | undefined,
        description: args.description as string | undefined,
        tags: cleanTags(args.tags),
        books: args.books as number[] | undefined,
      }),
    },
    {
      name: "bookstack_delete_shelf",
      description: "Delete a bookshelf. Books inside are NOT deleted, just removed from the shelf.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "The shelf ID to delete" } },
        required: ["id"],
      },
      handler: async (args) => {
        await client.deleteShelf(args.id as number);
        return { success: true, deleted_id: args.id };
      },
    },

    // ═══ Search & System ═════════════════════════════════════════
    {
      name: "bookstack_search",
      description: "Search across all BookStack content (books, chapters, pages, shelves). Returns matching items with previews.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query text", minLength: 1 },
          page: { type: "integer", description: "Page number for paginated results", minimum: 1 },
          count: { type: "integer", description: "Results per page (max 100)", minimum: 1, maximum: 100 },
        },
        required: ["query"],
      },
      handler: async (args) => {
        const result = await client.search({
          query: args.query as string,
          page: args.page as number | undefined,
          count: args.count as number | undefined,
        });
        return {
          total: result.total,
          query: args.query,
          results: result.data.map((item) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            url: item.url,
            preview: item.preview_html?.content?.substring(0, 500) || "",
            book: item.book?.name,
            chapter: item.chapter?.name,
            tags: item.tags?.map((t) => `${t.name}: ${t.value}`) || [],
          })),
        };
      },
    },
    {
      name: "bookstack_system_info",
      description: "Get information about the connected BookStack instance (version, instance ID, app name).",
      inputSchema: { type: "object", properties: {} },
      handler: async () => client.getSystemInfo(),
    },
  ];
}
