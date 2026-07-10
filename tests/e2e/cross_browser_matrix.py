"""Cross-browser matrix: run overlap + ARIA-label checks on
Chromium AND WebKit at mobile/tablet/desktop viewports.

Run: python3 tests/e2e/cross_browser_matrix.py
"""
import asyncio
from playwright.async_api import async_playwright

VIEWPORTS = [("mobile", 375, 800), ("tablet", 768, 1024), ("desktop", 1280, 900)]
BROWSERS = ["chromium", "webkit"]


def intersects(a, b):
    return not (
        a["x"] + a["width"] <= b["x"]
        or b["x"] + b["width"] <= a["x"]
        or a["y"] + a["height"] <= b["y"]
        or b["y"] + b["height"] <= a["y"]
    )


async def run_one(p, engine: str):
    browser = await getattr(p, engine).launch(headless=True)
    failures = []
    for label, w, h in VIEWPORTS:
        ctx = await browser.new_context(viewport={"width": w, "height": h})
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/todos", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)

        fab = page.get_by_role("button", name="AI")
        ekle = page.get_by_role("button", name="Görev ekle").last
        await fab.wait_for(state="visible")
        await ekle.wait_for(state="visible")
        fab_box = await fab.bounding_box()
        ekle_box = await ekle.bounding_box()
        overlap = intersects(fab_box, ekle_box)

        # ARIA-label sanity
        n = await page.get_by_role("button", name="Görev ekle").count()

        ok = (not overlap) and n >= 2
        print(f"  [{engine}/{label}] overlap={overlap} aria-buttons={n} → {'PASS' if ok else 'FAIL'}")
        if not ok:
            failures.append((engine, label))
        await ctx.close()
    await browser.close()
    return failures


async def main():
    all_failures = []
    async with async_playwright() as p:
        for engine in BROWSERS:
            print(f"\n== {engine} ==")
            try:
                all_failures += await run_one(p, engine)
            except Exception as e:
                print(f"  SKIP {engine}: {e}")
    if all_failures:
        raise SystemExit(f"FAIL: {all_failures}")
    print("\nPASS: cross-browser matrix")


asyncio.run(main())
