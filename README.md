# @h4sht/bookstack-mcp

> MCP server for BookStack — connect Claude Code, Codex, OpenCode and any AI assistant to your BookStack wiki. **One command, zero config files, instant setup.**

[![GitHub repo](https://img.shields.io/badge/github-h4sht%2Fbookstack--mcp-blue?logo=github)](https://github.com/h4sht/bookstack-mcp)
[![license MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-32%2F32-brightgreen)]()
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?logo=node.js)](https://nodejs.org)

---

## 🚀 One-command install

```bash
claude mcp add bookstack -- npx @h4sht/bookstack-mcp
```

Claude Code will prompt you for:
- `BOOKSTACK_BASE_URL` — your BookStack API URL (e.g. `https://wiki.example.com/api`)
- `BOOKSTACK_API_TOKEN` — your API token (`token_id:token_secret`)

Or pass them directly:

```bash
claude mcp add bookstack \
  --env BOOKSTACK_BASE_URL=https://wiki.example.com/api \
  --env BOOKSTACK_API_TOKEN=token_id:token_secret \
  -- npx @h4sht/bookstack-mcp
```

Then use `/mcp` inside Claude Code to verify it's connected ✔

---

## 🛠️ What you get (25 tools)

| Category | Tools |
|----------|-------|
| 📚 **Books** (6) | list, get, create, update, delete, export |
| 📑 **Chapters** (6) | list, get, create, update, delete, export |
| 📄 **Pages** (6) | list, get, create, update, delete, export |
| 📚 **Shelves** (5) | list, get, create, update, delete |
| 🔍 **Search** (1) | search across all content |
| ⚙️ **System** (1) | instance info |

All `export_*` tools support `markdown`, `html`, `pdf`, `plaintext`.

---

## ✍️ Markdown-powered

BookStack stores pages as HTML but accepts **Markdown input** through its API. This means Claude can create and edit wiki pages in its native format:

```
"Create a page about async Python in book 3"

→ bookstack_create_page({
    book_id: 3,
    name: "Async Python Guide",
    markdown: "# Async Python\n\n`asyncio` is Python's standard library..."
  })
```

Pages are also exported as Markdown, so Claude can read, analyze, and improve existing content.

---

## 📦 Also works with

- **Codex** (OpenAI)
- **OpenCode**
- **Cline**
- Any MCP-compatible assistant with stdio transport

Just use `npx @h4sht/bookstack-mcp` as the server command.

---

## 🔧 Config reference

| Variable | Required | Description |
|----------|----------|-------------|
| `BOOKSTACK_BASE_URL` | Yes | Full URL including `/api` |
| `BOOKSTACK_API_TOKEN` | Yes | Format: `token_id:token_secret` |
| `BOOKSTACK_TIMEOUT` | No | Request timeout ms (default: `30000`) |

---

## 🔒 Security

- **4 auditable files** — read the whole source in 10 minutes
- **One dependency** — only `@modelcontextprotocol/sdk` (official Anthropic)
- **Native fetch()** — no HTTP libraries, no hidden requests
- **Stdio only** — no open ports, no network surface
- **Zero telemetry** — no analytics, no tracking, no calls home
- **Stderr logging** — never writes to stdout (MCP protocol integrity)

---

## 🧪 Tests

```bash
npm test   # 32 tests, all passing ✅
```

---

## 📁 Structure

```
@h4sht/bookstack-mcp/
├── src/
│   ├── index.ts      # MCP server, stdio transport, config
│   ├── client.ts     # BookStack REST client (native fetch)
│   ├── tools.ts      # 25 MCP tool definitions + handlers
│   └── types.ts      # TypeScript types
├── dist/             # Compiled JS (ready to run)
├── tests/            # 32 unit + integration tests
├── package.json
└── README.md
```

---

## 📝 License

MIT © [h4sht](https://github.com/h4sht)
