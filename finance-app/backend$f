import asyncio
import logging
import os
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

_cache: dict[str, dict[str, Any]] = {}

PRICE_TTL = 60
FUNDAMENTALS_TTL = 86400
FILING_TTL = 604800  # 7 days

FMP_BASE = "https://financialmodelingprep.com/api/v3"
EDGAR_BASE = "https://data.sec.gov"
EDGAR_HEADERS = {"User-Agent": "PersonalFinanceApp/1.0 (contact@faddyjeros.com)"}

_refresh_task: asyncio.Task | None = None
_portfolio_tickers: list[str] = []


def _cache_get(key: str, ttl: int) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < ttl:
        return entry["data"]
    return None


def _cache_get_stale(key: str) -> tuple[Any | None, bool]:
    entry = _cache.get(key)
    if not entry:
        return None, False
    expired = (time.time() - entry["ts"]) >= PRICE_TTL
    return entry["data"], expired


def _cache_set(key: str, data: Any):
    _cache[key] = {"data": data, "ts": time.time()}


# ---------------------------------------------------------------------------
# yfinance adapter
# ---------------------------------------------------------------------------

def _yf_get_quote(ticker: str) -> dict | None:
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        info = t.info
        if not info or "regularMarketPrice" not in info:
            return None
        return {
            "ticker": ticker,
            "price": info.get("regularMarketPrice"),
            "previousClose": info.get("previousClose"),
            "change": info.get("regularMarketChange"),
            "changePercent": info.get("regularMarketChangePercent"),
            "currency": info.get("currency", "USD"),
            "name": info.get("shortName", ticker),
            "marketCap": info.get("marketCap"),
            "source": "yfinance",
        }
    except Exception as e:
        logger.warning("yfinance quote failed for %s: %s", ticker, e)
        return None


def _yf_get_history(ticker: str, period: str = "1y") -> list[dict] | None:
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        df = t.history(period=period)
        if df.empty:
            return None
        records = []
        for dt, row in df.iterrows():
            records.append({
                "date": dt.strftime("%Y-%m-%d"),
                "open": round(row["Open"], 2),
                "high": round(row["High"], 2),
                "low": round(row["Low"], 2),
                "close": round(row["Close"], 2),
                "volume": int(row["Volume"]),
            })
        return records
    except Exception as e:
        logger.warning("yfinance history failed for %s: %s", ticker, e)
        return None


# ---------------------------------------------------------------------------
# FMP adapter
# ---------------------------------------------------------------------------

def _fmp_api_key() -> str | None:
    return os.environ.get("FMP_API_KEY")


def _fmp_get(endpoint: str, params: dict | None = None) -> Any | None:
    key = _fmp_api_key()
    if not key:
        return None
    try:
        import urllib.request
        import json
        p = params or {}
        p["apikey"] = key
        qs = "&".join(f"{k}={v}" for k, v in p.items())
        url = f"{FMP_BASE}/{endpoint}?{qs}"
        req = urllib.request.Request(url, headers={"User-Agent": "PersonalFinanceApp/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        logger.warning("FMP request failed for %s: %s", endpoint, e)
        return None


def _fmp_get_quote(ticker: str) -> dict | None:
    data = _fmp_get(f"quote/{ticker}")
    if not data or not isinstance(data, list) or len(data) == 0:
        return None
    q = data[0]
    return {
        "ticker": ticker,
        "price": q.get("price"),
        "previousClose": q.get("previousClose"),
        "change": q.get("change"),
        "changePercent": q.get("changesPercentage"),
        "currency": "USD",
        "name": q.get("name", ticker),
        "marketCap": q.get("marketCap"),
        "source": "fmp",
    }


def _fmp_get_fundamentals(ticker: str) -> dict | None:
    profile = _fmp_get(f"profile/{ticker}")
    if not profile or not isinstance(profile, list):
        return None
    p = profile[0]
    ratios = _fmp_get(f"ratios-ttm/{ticker}")
    r = ratios[0] if ratios and isinstance(ratios, list) and len(ratios) > 0 else {}
    return {
        "ticker": ticker,
        "name": p.get("companyName"),
        "sector": p.get("sector"),
        "industry": p.get("industry"),
        "marketCap": p.get("mktCap"),
        "pe": r.get("peRatioTTM"),
        "eps": p.get("eps") if "eps" in p else r.get("netIncomePerShareTTM"),
        "dividendYield": r.get("dividendYieldPercentageTTM"),
        "priceToBook": r.get("priceToBookRatioTTM"),
        "debtToEquity": r.get("debtEquityRatioTTM"),
        "roe": r.get("returnOnEquityTTM"),
        "revenueGrowth": r.get("revenuePerShareTTM"),
        "description": p.get("description", "")[:500],
        "source": "fmp",
    }


def _fmp_get_financial_statements(ticker: str, statement_type: str = "income") -> list[dict] | None:
    endpoint_map = {
        "income": f"income-statement/{ticker}",
        "balance": f"balance-sheet-statement/{ticker}",
        "cash": f"cash-flow-statement/{ticker}",
    }
    endpoint = endpoint_map.get(statement_type)
    if not endpoint:
        return None
    data = _fmp_get(endpoint, {"limit": 5})
    if not data or not isinstance(data, list):
        return None
    return data


# ---------------------------------------------------------------------------
# SEC EDGAR adapter
# ---------------------------------------------------------------------------

def _edgar_get(url: str) -> Any | None:
    try:
        import urllib.request
        import json
        req = urllib.request.Request(url, headers=EDGAR_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        logger.warning("EDGAR request failed for %s: %s", url, e)
        return None


def _edgar_cik_lookup(ticker: str) -> str | None:
    data = _edgar_get(f"{EDGAR_BASE}/submissions/CIK{ticker.upper().zfill(10)}.json")
    if data and "cik" in data:
        return str(data["cik"]).zfill(10)
    tickers_url = "https://www.sec.gov/files/company_tickers.json"
    tickers_data = _edgar_get(tickers_url)
    if not tickers_data:
        return None
    for entry in tickers_data.values():
        if entry.get("ticker", "").upper() == ticker.upper():
            return str(entry["cik_str"]).zfill(10)
    return None


def _edgar_get_filings(ticker: str, filing_type: str = "10-K", count: int = 5) -> list[dict] | None:
    cik = _edgar_cik_lookup(ticker)
    if not cik:
        return None
    data = _edgar_get(f"{EDGAR_BASE}/submissions/CIK{cik}.json")
    if not data or "filings" not in data:
        return None
    recent = data["filings"]["recent"]
    results = []
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    primary_docs = recent.get("primaryDocument", [])

    for i, form in enumerate(forms):
        if form == filing_type and len(results) < count:
            acc = accessions[i].replace("-", "")
            results.append({
                "type": filing_type,
                "date": dates[i],
                "accessionNumber": accessions[i],
                "url": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc}/{primary_docs[i]}",
            })
    return results if results else None


def _edgar_get_company_facts(ticker: str) -> dict | None:
    cik = _edgar_cik_lookup(ticker)
    if not cik:
        return None
    data = _edgar_get(f"{EDGAR_BASE}/api/xbrl/companyfacts/CIK{cik}.json")
    if not data or "facts" not in data:
        return None

    us_gaap = data["facts"].get("us-gaap", {})
    extracted = {}
    key_metrics = {
        "Revenues": "revenue",
        "NetIncomeLoss": "netIncome",
        "Assets": "totalAssets",
        "Liabilities": "totalLiabilities",
        "StockholdersEquity": "stockholdersEquity",
        "EarningsPerShareBasic": "epsBasic",
        "OperatingIncomeLoss": "operatingIncome",
    }
    for xbrl_key, label in key_metrics.items():
        concept = us_gaap.get(xbrl_key)
        if not concept:
            continue
        units = concept.get("units", {})
        values = units.get("USD", units.get("USD/shares", []))
        if not values:
            continue
        annual = [v for v in values if v.get("form") in ("10-K", "10-K/A")]
        annual.sort(key=lambda x: x.get("end", ""), reverse=True)
        extracted[label] = [
            {"period": v.get("end"), "value": v.get("val"), "form": v.get("form")}
            for v in annual[:5]
        ]

    return {"ticker": ticker, "source": "edgar", "facts": extracted} if extracted else None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_quote(ticker: str) -> dict:
    cached = _cache_get(f"quote:{ticker}", PRICE_TTL)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _yf_get_quote, ticker)

    if not result:
        result = await loop.run_in_executor(None, _fmp_get_quote, ticker)

    if not result:
        stale, is_stale = _cache_get_stale(f"quote:{ticker}")
        if stale:
            stale["stale"] = True
            return stale
        return {"ticker": ticker, "error": "No data available", "stale": True}

    _cache_set(f"quote:{ticker}", result)
    return result


async def get_history(ticker: str, period: str = "1y") -> list[dict]:
    cache_key = f"history:{ticker}:{period}"
    cached = _cache_get(cache_key, FUNDAMENTALS_TTL)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _yf_get_history, ticker, period)

    if not result:
        return []

    _cache_set(cache_key, result)
    return result


async def get_fundamentals(ticker: str) -> dict:
    cache_key = f"fundamentals:{ticker}"
    cached = _cache_get(cache_key, FUNDAMENTALS_TTL)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _fmp_get_fundamentals, ticker)

    if not result:
        return {"ticker": ticker, "error": "No fundamentals available"}

    _cache_set(cache_key, result)
    return result


async def get_financial_statements(ticker: str, statement_type: str = "income") -> list[dict]:
    cache_key = f"statements:{ticker}:{statement_type}"
    cached = _cache_get(cache_key, FUNDAMENTALS_TTL)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _fmp_get_financial_statements, ticker, statement_type)

    if not result:
        facts = await get_company_facts(ticker)
        if facts and "facts" in facts:
            return [{"source": "edgar_xbrl", "facts": facts["facts"]}]
        return []

    _cache_set(cache_key, result)
    return result


async def get_sec_filing(ticker: str, filing_type: str = "10-K", count: int = 3) -> list[dict]:
    cache_key = f"filing:{ticker}:{filing_type}"
    cached = _cache_get(cache_key, FILING_TTL)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _edgar_get_filings, ticker, filing_type, count)

    if not result:
        return []

    _cache_set(cache_key, result)
    return result


async def get_company_facts(ticker: str) -> dict | None:
    cache_key = f"facts:{ticker}"
    cached = _cache_get(cache_key, FUNDAMENTALS_TTL)
    if cached:
        return cached

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _edgar_get_company_facts, ticker)

    if result:
        _cache_set(cache_key, result)
    return result


async def search_ticker(query: str) -> list[dict]:
    result = _fmp_get("search", {"query": query, "limit": 10})
    if result and isinstance(result, list):
        return [{"ticker": r.get("symbol"), "name": r.get("name"), "exchange": r.get("exchangeShortName")} for r in result]
    return []


# ---------------------------------------------------------------------------
# Background refresh
# ---------------------------------------------------------------------------

def set_portfolio_tickers(tickers: list[str]):
    global _portfolio_tickers
    _portfolio_tickers = list(set(tickers))


async def _refresh_portfolio_prices():
    if not _portfolio_tickers:
        return
    loop = asyncio.get_event_loop()
    tasks = [loop.run_in_executor(None, _yf_get_quote, t) for t in _portfolio_tickers]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for ticker, result in zip(_portfolio_tickers, results):
        if isinstance(result, dict) and result:
            _cache_set(f"quote:{ticker}", result)


async def _background_refresh_loop():
    while True:
        try:
            await _refresh_portfolio_prices()
        except Exception as e:
            logger.error("Background refresh failed: %s", e)
        await asyncio.sleep(60)


async def start_background_refresh():
    global _refresh_task
    if _refresh_task is None:
        await _refresh_portfolio_prices()
        _refresh_task = asyncio.create_task(_background_refresh_loop())


async def stop_background_refresh():
    global _refresh_task
    if _refresh_task:
        _refresh_task.cancel()
        try:
            await _refresh_task
        except asyncio.CancelledError:
            pass
        _refresh_task = None
