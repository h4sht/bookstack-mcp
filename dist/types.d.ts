/**
 * TypeScript types for the BookStack MCP stdio server.
 *
 * These types mirror the BookStack REST API response shapes.
 * BookStack documentation: https://demo.bookstackapp.com/api/docs
 */
export interface ListResponse<T> {
    data: T[];
    total: number;
}
export interface Tag {
    name: string;
    value: string;
    order: number;
}
export interface Book {
    id: number;
    name: string;
    slug: string;
    description: string;
    created_at: string;
    updated_at: string;
    created_by: number;
    updated_by: number;
    owned_by: number;
    image_id?: number;
    tags?: Tag[];
}
export interface BookWithContents extends Book {
    contents: Array<{
        type: "chapter";
        id: number;
        name: string;
        slug: string;
        priority: number;
        pages: Array<{
            id: number;
            name: string;
            slug: string;
            priority: number;
            draft: boolean;
            template: boolean;
        }>;
    } | {
        type: "page";
        id: number;
        name: string;
        slug: string;
        priority: number;
        draft: boolean;
        template: boolean;
    }>;
}
export interface Chapter {
    id: number;
    book_id: number;
    name: string;
    slug: string;
    description: string;
    priority: number;
    created_at: string;
    updated_at: string;
    created_by: number;
    updated_by: number;
    owned_by: number;
    tags?: Tag[];
}
export interface ChapterWithPages extends Chapter {
    pages: Page[];
}
export interface Page {
    id: number;
    book_id: number;
    chapter_id: number | null;
    name: string;
    slug: string;
    priority: number;
    draft: boolean;
    template: boolean;
    created_at: string;
    updated_at: string;
    created_by: number;
    updated_by: number;
    owned_by: number;
    revision_count: number;
    editor: string;
    tags?: Tag[];
}
export interface PageWithContent extends Page {
    html: string;
    raw_html: string;
    markdown?: string;
}
export interface Bookshelf {
    id: number;
    name: string;
    slug: string;
    description: string;
    created_at: string;
    updated_at: string;
    created_by: number;
    updated_by: number;
    owned_by: number;
    image_id?: number;
    tags?: Tag[];
}
export interface BookshelfWithBooks extends Bookshelf {
    books: Book[];
}
export interface SearchResult {
    id: number;
    name: string;
    slug: string;
    type: "bookshelf" | "book" | "chapter" | "page";
    url: string;
    preview_html: {
        name: string;
        content: string;
    };
    tags: Tag[];
    book?: Book;
    chapter?: Chapter;
}
export interface SystemInfo {
    version: string;
    instance_id: string;
    app_name: string;
    app_logo: string;
    base_url: string;
}
export interface CreateBookParams {
    name: string;
    description?: string;
    tags?: Tag[];
}
export interface UpdateBookParams {
    name?: string;
    description?: string;
    tags?: Tag[];
}
export interface CreateChapterParams {
    book_id: number;
    name: string;
    description?: string;
    tags?: Tag[];
    priority?: number;
}
export interface UpdateChapterParams {
    book_id?: number;
    name?: string;
    description?: string;
    tags?: Tag[];
    priority?: number;
}
export interface CreatePageParams {
    book_id: number;
    chapter_id?: number;
    name: string;
    markdown?: string;
    html?: string;
    tags?: Tag[];
    priority?: number;
}
export interface UpdatePageParams {
    book_id?: number;
    chapter_id?: number;
    name?: string;
    markdown?: string;
    html?: string;
    tags?: Tag[];
    priority?: number;
}
export interface CreateShelfParams {
    name: string;
    description?: string;
    tags?: Tag[];
    books?: number[];
}
export interface UpdateShelfParams {
    name?: string;
    description?: string;
    tags?: Tag[];
    books?: number[];
}
export interface SearchParams {
    query: string;
    page?: number;
    count?: number;
}
export type ExportFormat = "html" | "pdf" | "plaintext" | "markdown";
export interface ExportResult {
    content: string;
    filename: string;
    mime_type: string;
    encoding: "utf8" | "base64";
    byte_length: number;
}
//# sourceMappingURL=types.d.ts.map