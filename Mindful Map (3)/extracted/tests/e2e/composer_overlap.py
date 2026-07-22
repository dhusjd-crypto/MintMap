"""Visual regression: AI FAB must never overlap the composer Ekle button
across mobile / tablet / desktop widths on /todos.

Run: python3 tests/e2e/composer_overlap.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots" / "composer_overlap"
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("mobile", 375, 800),
    ("tablet", 768, 1024),
    ("desktop", 1280, 900),
]


def intersects(a, b) -> bool:
    return not (
        a["x"] + a["width"] <= b["x"]
        or b["x"] + b["width"] <= a["x"]
        or a["y"] + a["height"] <= b["y"]
        or b["y"] + b["height"] <= a["y"]
    )


async def main():
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for label, w, h in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            await page.goto("http://localhost:8080/todos", wait_until="domcontentloaded")
            await page.wait_for_timeout(800)

            fab = page.get_by_role("button", name="AI")
            ekle = page.get_by_role("button", name="Görev ekle").last
            await fab.wait_for(state="visible")
            await ekle.wait_for(state="visible")

            fab_box = await fab.bounding_box()
            ekle_box = await ekle.bounding_box()
            await page.screenshot(path=str(OUT / f"{label}.png"))

            overlap = intersects(fab_box, ekle_box)
            print(f"[{label} {w}x{h}] FAB={fab_box} Ekle={ekle_box} overlap={overlap}")
            if overlap:
                failures.append(label)
            await ctx.close()
        await browser.close()

    if failures:
        raise SystemExit(f"FAIL: overlap on {failures}")
    print("PASS: no overlap on any viewport")


asyncio.run(main())
