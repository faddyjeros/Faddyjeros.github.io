import json
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from services.finance_data import (
    calculate_investable_amount,
    get_accounts,
    get_budget_status,
    get_net_worth_history,
    get_portfolio_holdings,
    get_salary_history,
    get_transaction_summary,
)
from services.market_data import (
    get_company_facts,
    get_financial_statements,
    get_fundamentals,
    get_history,
    get_quote,
    get_sec_filing,
    search_ticker,
    set_portfolio_tickers,
    start_background_refresh,
    stop_background_refresh,
)

router = APIRouter()

MAX_ROUNDS = 5
MAX_TOOL_CALLS = 15

TOOL_DEFINITIONS = [
    {
        "name": "get_portfolio_holdings",
        "description": "Get current investment portfolio holdings with allocation percentages. Returns dynamic (ticker-based) and flat (manual) holdings with their values in EUR.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_stock_quote",
        "description": "Get a real-time stock quote including price, daily change, and market cap.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol (e.g., AAPL, MSFT, IWDA.AS)"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_stock_history",
        "description": "Get historical price data for a stock. Useful for performance analysis and charting.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol"},
                "period": {
                    "type": "string",
                    "description": "Time period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max",
                    "default": "1y",
                },
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_stock_fundamentals",
        "description": "Get fundamental data for a stock: P/E ratio, EPS, dividend yield, market cap, sector, debt/equity, ROE. Requires FMP API key.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol"},
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_financial_statements",
        "description": "Get financial statements (income statement, balance sheet, or cash flow) for the last 5 years. Falls back to SEC EDGAR XBRL data if FMP is unavailable.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol"},
                "statement_type": {
                    "type": "string",
                    "enum": ["income", "balance", "cash"],
                    "description": "Type of financial statement",
                    "default": "income",
                },
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_sec_filing",
        "description": "Get SEC EDGAR filing links (10-K annual reports or 10-Q quarterly reports) for a US-listed company.",
        "input_schema": {
            "type": "object",
            "properties": {
                "ticker": {"type": "string", "description": "Stock ticker symbol"},
                "filing_type": {
                    "type": "string",
                    "enum": ["10-K", "10-Q"],
                    "description": "Type of SEC filing",
                    "default": "10-K",
                },
                "count": {
                    "type": "integer",
                    "description": "Number of recent filings to return (max 5)",
                    "default": 3,
                },
            },
            "required": ["ticker"],
        },
    },
    {
        "name": "get_transaction_summary",
        "description": "Get spending and income summary from bank transactions. Shows totals by category and monthly breakdown.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Filter to a specific spending category (optional)",
                },
                "months": {
                    "type": "integer",
                    "description": "Number of months to look back (default: 6)",
                    "default": 6,
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_budget_status",
        "description": "Get current month's budget vs actual spending for each category. Shows which categories are on track or over budget.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_net_worth_history",
        "description": "Get historical net worth data points over time, tracked manually in the accounting spreadsheet.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_salary_history",
        "description": "Get salary history including gross, net, overtime, bonuses, and employer details.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "calculate_investable_amount",
        "description": "Calculate how much money is available to invest this month based on salary, spending so far, loan payments, and budget targets.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
]


async def _execute_tool(name: str, input_data: dict, db: Session) -> str:
    try:
        if name == "get_portfolio_holdings":
            result = get_portfolio_holdings(db)
        elif name == "get_stock_quote":
            result = await get_quote(input_data["ticker"])
        elif name == "get_stock_history":
            result = await get_history(input_data["ticker"], input_data.get("period", "1y"))
        elif name == "get_stock_fundamentals":
            result = await get_fundamentals(input_data["ticker"])
        elif name == "get_financial_statements":
            result = await get_financial_statements(input_data["ticker"], input_data.get("statement_type", "income"))
        elif name == "get_sec_filing":
            result = await get_sec_filing(
                input_data["ticker"],
                input_data.get("filing_type", "10-K"),
                min(input_data.get("count", 3), 5),
            )
        elif name == "get_transaction_summary":
            result = get_transaction_summary(db, input_data.get("category"), input_data.get("months", 6))
        elif name == "get_budget_status":
            result = get_budget_status(db)
        elif name == "get_net_worth_history":
            result = get_net_worth_history(db)
        elif name == "get_salary_history":
            result = get_salary_history(db)
        elif name == "calculate_investable_amount":
            result = calculate_investable_amount(db)
        else:
            result = {"error": f"Unknown tool: {name}"}
        return json.dumps(result, default=str)
    except Exception as e:
        return json.dumps({"error": str(e)})


@router.get("/overview")
async def get_overview(db: Session = Depends(get_db)):
    holdings = get_portfolio_holdings(db)
    accounts = get_accounts(db)
    net_worth = get_net_worth_history(db)
    salary = get_salary_history(db)
    budget = get_budget_status(db)
    investable = calculate_investable_amount(db)

    tickers = [h["ticker"] for h in holdings.get("dynamic", []) if h.get("ticker")]
    if tickers:
        set_portfolio_tickers(tickers)

    import asyncio

    live_prices = {}
    if tickers:
        async def _safe_quote(t):
            try:
                return t, await asyncio.wait_for(get_quote(t), timeout=8)
            except Exception:
                return t, None

        results = await asyncio.gather(*[_safe_quote(t) for t in tickers])
        for t, quote in results:
            if quote and "error" not in quote:
                live_prices[t] = quote

    for h in holdings.get("dynamic", []):
        ticker = h.get("ticker")
        if ticker and ticker in live_prices:
            q = live_prices[ticker]
            h["live_price"] = q.get("price")
            h["change"] = q.get("change")
            h["change_percent"] = q.get("changePercent")
            if q.get("price") and h.get("volume"):
                h["live_value"] = round(q["price"] * h["volume"], 2)

    total_portfolio = holdings.get("total_eur", 0)
    total_cash = sum(a.get("amount_eur", 0) for a in accounts)
    latest_nw = net_worth[-1]["value"] if net_worth else 0
    latest_salary = salary[-1]["net"] if salary else 0

    savings_rate = 0
    if latest_salary > 0:
        savings_rate = round((latest_salary - budget["total_spent"]) / latest_salary * 100, 1)

    return {
        "summary": {
            "net_worth": latest_nw,
            "portfolio_value": total_portfolio,
            "cash": round(total_cash, 2),
            "savings_rate": savings_rate,
            "investable_now": investable["investable_now"],
        },
        "holdings": holdings,
        "accounts": accounts,
        "net_worth_history": net_worth[-24:],
        "budget": budget,
        "live_prices": live_prices,
    }


SYSTEM_PROMPT = """You are a personal financial analyst. You have access to the user's complete financial data: bank transactions, budget targets, salary history, net worth tracking, and investment portfolio with live market prices.

Your role:
- Answer questions about spending patterns, budget adherence, and savings
- Analyze investment portfolio performance and allocation
- Research stocks using fundamentals, financial statements, and SEC filings
- Calculate how much is available to invest
- Compare holdings against benchmarks
- Provide data-driven observations, not generic financial advice

Style:
- Be direct and specific with numbers
- Use tables for comparisons when helpful
- When showing chart data, use a fenced ```chart block with JSON: {"type": "line"|"bar"|"pie", "data": [...], "xKey": "...", "yKey": "...", "title": "..."}
- Reference actual data from tools, don't make assumptions
- If data is stale or unavailable, say so clearly"""


ANALYSIS_SYSTEM_PROMPT = """You are a senior equity research analyst. You've been given comprehensive financial data for a company. Produce a structured fundamental analysis report.

Structure your report as:

## Company Overview
Brief description, sector, industry, market positioning.

## Key Metrics
Present a table with: Market Cap, P/E Ratio, EPS, Dividend Yield, Price-to-Book, Debt/Equity, ROE.

## Financial Performance (3-5 Year Trend)
Analyze revenue, net income, and operating income trends. Use a chart block to visualize revenue/income growth. Note growth rates and inflection points.

## Balance Sheet Health
Assess total assets vs liabilities, stockholders' equity trend, debt levels.

## Cash Flow Analysis
If available, assess operating cash flow, free cash flow generation, capex trends.

## Valuation Assessment
Is the stock fairly valued, overvalued, or undervalued based on P/E vs sector average, earnings growth, and price-to-book?

## Risk Factors
Top 3-5 risks based on the financial data (high leverage, declining margins, concentration, etc.).

## Summary & Outlook
2-3 sentence conclusion with a directional view (bullish/neutral/bearish) supported by the data.

Style:
- Be direct with specific numbers
- Use tables and ```chart blocks for data visualization
- If data is missing or unavailable, note it and work with what's available
- Compare to sector averages where possible
- Don't hedge everything — take a position based on the data"""


@router.post("/analyze/{ticker}")
async def analyze_stock(ticker: str):
    """Run a full fundamental analysis on a given ticker. Pre-fetches all data then sends to Claude for structured analysis."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed")

    ticker = ticker.upper().strip()

    # Pre-fetch all available data in parallel
    import asyncio
    quote_task = get_quote(ticker)
    fundamentals_task = get_fundamentals(ticker)
    history_task = get_history(ticker, "2y")
    income_task = get_financial_statements(ticker, "income")
    balance_task = get_financial_statements(ticker, "balance")
    cash_task = get_financial_statements(ticker, "cash")
    facts_task = get_company_facts(ticker)
    filings_task = get_sec_filing(ticker, "10-K", 3)

    results = await asyncio.gather(
        quote_task, fundamentals_task, history_task,
        income_task, balance_task, cash_task,
        facts_task, filings_task,
        return_exceptions=True,
    )

    quote = results[0] if not isinstance(results[0], Exception) else {}
    fundamentals = results[1] if not isinstance(results[1], Exception) else {}
    history = results[2] if not isinstance(results[2], Exception) else []
    income_stmt = results[3] if not isinstance(results[3], Exception) else []
    balance_stmt = results[4] if not isinstance(results[4], Exception) else []
    cash_stmt = results[5] if not isinstance(results[5], Exception) else []
    facts = results[6] if not isinstance(results[6], Exception) else {}
    filings = results[7] if not isinstance(results[7], Exception) else []

    # Build the data package for Claude
    data_sections = [f"# Financial Data for {ticker}\n"]

    if quote and "error" not in quote:
        data_sections.append(f"## Current Quote\n```json\n{json.dumps(quote, indent=2)}\n```\n")

    if fundamentals and "error" not in fundamentals:
        data_sections.append(f"## Fundamentals\n```json\n{json.dumps(fundamentals, indent=2)}\n```\n")

    if income_stmt:
        # Limit to avoid token overflow
        data_sections.append(f"## Income Statements (Annual)\n```json\n{json.dumps(income_stmt[:5], indent=2, default=str)}\n```\n")

    if balance_stmt:
        data_sections.append(f"## Balance Sheets (Annual)\n```json\n{json.dumps(balance_stmt[:5], indent=2, default=str)}\n```\n")

    if cash_stmt:
        data_sections.append(f"## Cash Flow Statements (Annual)\n```json\n{json.dumps(cash_stmt[:5], indent=2, default=str)}\n```\n")

    if facts and "facts" in facts:
        data_sections.append(f"## SEC EDGAR XBRL Data\n```json\n{json.dumps(facts['facts'], indent=2, default=str)}\n```\n")

    if filings:
        data_sections.append(f"## Recent 10-K Filings\n```json\n{json.dumps(filings, indent=2)}\n```\n")

    if history and len(history) > 0:
        # Just send quarterly samples to avoid token overflow
        sampled = history[::60] if len(history) > 20 else history
        data_sections.append(f"## Price History (sampled)\n```json\n{json.dumps(sampled, indent=2)}\n```\n")

    data_package = "\n".join(data_sections)

    if len(data_sections) <= 1:
        raise HTTPException(status_code=404, detail=f"No financial data found for ticker: {ticker}")

    client = AsyncAnthropic(api_key=api_key)

    async def event_stream():
        response = await client.messages.create(
            model="claude-sonnet-4-5-20250514",
            max_tokens=6000,
            system=ANALYSIS_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Run a full fundamental analysis on {ticker} using this data:\n\n{data_package}",
            }],
            stream=True,
        )

        async for event in response:
            if event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    yield f"data: {json.dumps({'type': 'text', 'content': event.delta.text})}\n\n"
            elif event.type == "message_delta":
                if event.delta.stop_reason == "end_turn":
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat")
async def chat(request: Request, db: Session = Depends(get_db)):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    body = await request.json()
    messages = body.get("messages", [])
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    try:
        from anthropic import AsyncAnthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed")

    client = AsyncAnthropic(api_key=api_key)

    async def event_stream():
        current_messages = list(messages)
        rounds = 0
        total_tool_calls = 0

        while rounds < MAX_ROUNDS:
            rounds += 1

            response = await client.messages.create(
                model="claude-sonnet-4-5-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=TOOL_DEFINITIONS,
                messages=current_messages,
                stream=True,
            )

            tool_uses = []
            text_chunks = []

            async for event in response:
                if event.type == "content_block_start":
                    if event.content_block.type == "text":
                        pass
                    elif event.content_block.type == "tool_use":
                        tool_uses.append({
                            "id": event.content_block.id,
                            "name": event.content_block.name,
                            "input_json": "",
                        })
                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        text_chunks.append(event.delta.text)
                        yield f"data: {json.dumps({'type': 'text', 'content': event.delta.text})}\n\n"
                    elif event.delta.type == "input_json_delta":
                        if tool_uses:
                            tool_uses[-1]["input_json"] += event.delta.partial_json
                elif event.type == "message_delta":
                    if event.delta.stop_reason == "end_turn":
                        yield f"data: {json.dumps({'type': 'done'})}\n\n"
                        return
                    elif event.delta.stop_reason == "tool_use":
                        pass

            if not tool_uses:
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            if total_tool_calls + len(tool_uses) > MAX_TOOL_CALLS:
                limit_msg = "\n\n*[Reached tool call limit — returning partial analysis]*"
                yield f"data: {json.dumps({'type': 'text', 'content': limit_msg})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            assistant_content = []
            if text_chunks:
                assistant_content.append({"type": "text", "text": "".join(text_chunks)})
            for tu in tool_uses:
                try:
                    tool_input = json.loads(tu["input_json"]) if tu["input_json"] else {}
                except json.JSONDecodeError:
                    tool_input = {}
                assistant_content.append({
                    "type": "tool_use",
                    "id": tu["id"],
                    "name": tu["name"],
                    "input": tool_input,
                })

            current_messages.append({"role": "assistant", "content": assistant_content})

            tool_results = []
            for tu in tool_uses:
                total_tool_calls += 1
                try:
                    tool_input = json.loads(tu["input_json"]) if tu["input_json"] else {}
                except json.JSONDecodeError:
                    tool_input = {}

                yield f"data: {json.dumps({'type': 'tool_call', 'name': tu['name'], 'input': tool_input})}\n\n"

                result_str = await _execute_tool(tu["name"], tool_input, db)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tu["id"],
                    "content": result_str,
                })

            current_messages.append({"role": "user", "content": tool_results})

        rounds_msg = "\n\n*[Reached maximum analysis rounds]*"
        yield f"data: {json.dumps({'type': 'text', 'content': rounds_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
