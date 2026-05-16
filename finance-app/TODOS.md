# TODOs

## V2: Structured logging and cost monitoring for Claude API
**Priority:** P2
**What:** Log each analyst chat query's tool count, approximate token usage, and response time. Surface cumulative cost in a simple admin view or log file.
**Why:** Sonnet costs $3-15 per heavy chat session. Without per-query cost tracking, spending accumulates invisibly. The Anthropic account dashboard shows total usage but not per-feature attribution. Structured logs also make debugging yfinance failures easier (currently silent).
**Context:** The analyst chat endpoint (POST /api/analyst/chat) processes tool-use loops. After each query completes, log: timestamp, query length, number of tool calls, total input/output tokens (from Claude response metadata), estimated cost, and any yfinance errors encountered. Write to a JSONL file or SQLite table. A future admin page could show daily/weekly cost trends.
**Depends on:** V1 analyst panel complete.
