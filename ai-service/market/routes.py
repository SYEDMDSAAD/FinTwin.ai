from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

from market import data

router = APIRouter(prefix="/discover")


@router.get("/funds/search")
async def funds_search(q: str = Query(..., min_length=2, max_length=80), limit: int = Query(20, ge=1, le=50)):
    return await run_in_threadpool(data.search_funds, q, limit)


_DATE = r"^\d{4}-\d{2}-\d{2}$"


@router.get("/funds/{code}/nav-on")
async def fund_nav_on(code: str, date: str = Query(..., pattern=_DATE)):
    if not code.isdigit():
        raise HTTPException(status_code=400, detail="Scheme code must be numeric")
    result = await run_in_threadpool(data.fund_nav_on, code, date)
    if result is None:
        raise HTTPException(status_code=404, detail="No NAV found for that fund around that date")
    return result


@router.get("/funds/{code}/latest")
async def fund_latest(code: str):
    """Today's NAV only — no return history, so it stays fast."""
    if not code.isdigit():
        raise HTTPException(status_code=400, detail="Scheme code must be numeric")
    funds = await run_in_threadpool(data._load_funds)
    fund = funds.get(code)
    if fund is None:
        raise HTTPException(status_code=404, detail="Unknown scheme code")
    return {"code": fund.code, "name": fund.name, "nav": fund.nav, "date": fund.nav_date}


@router.get("/stocks/price-on")
async def stock_price_on(symbol: str = Query(..., min_length=1, max_length=40), date: str = Query(..., pattern=_DATE)):
    result = await run_in_threadpool(data.stock_price_on, symbol, date)
    if result is None:
        raise HTTPException(status_code=404, detail="No price found for that stock around that date")
    return result


@router.get("/funds/{code}")
async def fund(code: str):
    if not code.isdigit():
        raise HTTPException(status_code=400, detail="Scheme code must be numeric")
    result = await run_in_threadpool(data.fund_details, code)
    if result is None:
        raise HTTPException(status_code=404, detail="Unknown scheme code")
    return result


@router.get("/stocks/search")
async def stocks_search(q: str = Query(..., min_length=2, max_length=60), limit: int = Query(10, ge=1, le=25)):
    return await run_in_threadpool(data.search_stocks, q, limit)


@router.get("/stocks/quotes")
async def stock_quotes(symbols: str = Query(..., max_length=1000)):
    return await run_in_threadpool(data.quotes, [s for s in symbols.split(",") if s.strip()])
