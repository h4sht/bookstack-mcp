/**
 * Simple BookStack API client.
 *
 * Handles authentication and JSON requests to the BookStack REST API.
 * Uses the native `fetch` API (Node 18+) to keep dependencies minimal.
 */
import type { Book, BookWithContents, Bookshelf, BookshelfWithBooks, Chapter, ChapterWithPages, CreateBookParams, CreateChapterParams, CreatePageParams, CreateShelfParams, ExportFormat, ExportResult, ListResponse, Page, PageWithContent, SearchParams, SearchResult, SystemInfo, UpdateBookParams, UpdateChapterParams, UpdatePageParams, UpdateShelfParams } from "./types.js";
/** Error thrown when the BookStack API returns an error response. */
export declare class BookStackError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown);
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
export declare class BookStackClient {
    private baseUrl;
    private headers;
    private timeout;
    constructor(config: ClientConfig);
    /** Perform a JSON request to the BookStack API. */
    private request;
    /** Export any resource type. Shared by books, chapters, pages. */
    private exportResource;
    listBooks(params?: {
        count?: number;
        offset?: number;
        sort?: string;
    }): Promise<ListResponse<Book>>;
    getBook(id: number): Promise<BookWithContents>;
    createBook(params: CreateBookParams): Promise<Book>;
    updateBook(id: number, params: UpdateBookParams): Promise<Book>;
    deleteBook(id: number): Promise<void>;
    exportBook(id: number, fmt: ExportFormat): Promise<ExportResult>;
    listChapters(params?: {
        count?: number;
        offset?: number;
        sort?: string;
    }): Promise<ListResponse<Chapter>>;
    getChapter(id: number): Promise<ChapterWithPages>;
    createChapter(params: CreateChapterParams): Promise<Chapter>;
    updateChapter(id: number, params: UpdateChapterParams): Promise<Chapter>;
    deleteChapter(id: number): Promise<void>;
    exportChapter(id: number, fmt: ExportFormat): Promise<ExportResult>;
    listPages(params?: {
        count?: number;
        offset?: number;
        sort?: string;
    }): Promise<ListResponse<Page>>;
    getPage(id: number): Promise<PageWithContent>;
    createPage(params: CreatePageParams): Promise<Page>;
    updatePage(id: number, params: UpdatePageParams): Promise<Page>;
    deletePage(id: number): Promise<void>;
    exportPage(id: number, fmt: ExportFormat): Promise<ExportResult>;
    listShelves(params?: {
        count?: number;
        offset?: number;
        sort?: string;
    }): Promise<ListResponse<Bookshelf>>;
    getShelf(id: number): Promise<BookshelfWithBooks>;
    createShelf(params: CreateShelfParams): Promise<Bookshelf>;
    updateShelf(id: number, params: UpdateShelfParams): Promise<Bookshelf>;
    deleteShelf(id: number): Promise<void>;
    search(params: SearchParams): Promise<ListResponse<SearchResult>>;
    getSystemInfo(): Promise<SystemInfo>;
}
//# sourceMappingURL=client.d.ts.map