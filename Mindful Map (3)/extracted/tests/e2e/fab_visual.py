"""Visual regression baselines for the FAB region across viewports
and states. Crops the bottom strip of the viewport (where every FAB
lives) and pixel-diffs against committed baselines with a tight
threshold so any geometry change shows up in CI.

States captured (matrix of viewport × scenario):
  idle, wrench_open, ai_menu, child_selected, wrench_and_child

Run:  python3 tests/e2e/fab_visual.py
      UPDATE_BASELINE=1 python3 tests/e2e/fab_visual.py   # refresh
"""
import asyncio
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import Page, async_playwright

ROOT = Path(__file__).parent
BASE = ROOT / "baselines" / "fab_visual"
OUT = ROOT / "screenshots" / "fab_visual"
BASE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("iphone13", 390, 844),
    ("pixel7", 412, 915),
    ("ipad", 768, 1024),
    ("desktop", 1280, 800),
]
CROP_HEIGHT = 360  # bottom strip that holds every FAB stack
DIFF_THRESHOLD = 0.03  # ≤3% pixels may differ (font hinting, AA)
BASE_URL = "http://localhost:8080"


def pixel_diff_ratio(a: Path, b: Path, diff_out: Path) -> float:
    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return 1.0
    diff = ImageChops.difference(ia, ib)
    if not diff.getbbox():
        return 0.0
    total = ia.size[0] * ia.size[1]
    changed = sum(1 for px in diff.getdata() if px != (0, 0, 0))
    amp = Image.eval(diff, lambda v: min(255, v * 8))
    amp.save(diff_out)
    return changed / total


async def dismiss(page: Page) -> None:
    for _ in range(4):
        await page.evaluate(
            """() => {
              const scrim = document.querySelector('.fixed.inset-0.z-40');
              if (scrim) scrim.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
            }"""
        )
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(150)
        if not await page.locator(".fixed.inset-0.z-40").count():
            return


async def snapshot(page: Page, w: int, h: int, name: str) -> Path:
    await page.wait_for_timeout(250)
    path = OUT / f"{name}.png"
    await page.screenshot(
        path=str(path),
        clip={"x": 0, "y": max(0, h - CROP_HEIGHT), "width": w, "height": min(CROP_HEIGHT, h)},
    )
    return path


async def main() -> None:
    update = os.environ.get("UPDATE_BASELINE") == "1"
    failures: list[tuple[str, float]] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for vw, w, h in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            await page.goto(BASE_URL, wait_until="domcontentloaded")
            await page.wait_for_selector("[data-node-id]", timeout=15_000)
            await page.wait_for_selector('[data-fab-id="ai-launcher"]', timeout=10_000)
            await dismiss(page)

            scenarios: list[tuple[str, callable]] = []

            async def go(state: str) -> None:
                shot = await snapshot(page, w, h, f"{vw}_{state}")
                baseline = BASE / f"{vw}_{state}.png"
                if update or not baseline.exists():
                    baseline.write_bytes(shot.read_bytes())
                    print(f"  [{vw}/{state}] baseline {'updated' if update else 'created'}")
                    return
                diff_path = OUT / f"{vw}_{state}.diff.png"
                ratio = pixel_diff_ratio(baseline, shot, diff_path)
                flag = "PASS" if ratio <= DIFF_THRESHOLD else "FAIL"
                print(f"  [{vw}/{state}] diff={ratio:.4f} thr={DIFF_THRESHOLD} → {flag}")
                if ratio > DIFF_THRESHOLD:
                    failures.append((f"{vw}/{state}", ratio))

            # idle
            await go("idle")

            # wrench open
            await page.get_by_test_id("toolbar-toggle").click()
            await page.wait_for_timeout(300)
            await go("wrench_open")
            await page.get_by_test_id("toolbar-toggle").click()
            await page.wait_for_timeout(200)

            # AI menu open
            await page.get_by_test_id("fab-ai").click()
            await page.wait_for_timeout(300)
            await go("ai_menu")
            await dismiss(page)

            # Child selected (+ optional wrench combo)
            nodes = page.locator("[data-node-id]")
            if await nodes.count() >= 2:
                await nodes.nth(1).click()
                await dismiss(page)
                await go("child_selected")
                await page.get_by_test_id("toolbar-toggle").click()
                await page.wait_for_timeout(300)
                await go("wrench_and_child")
                await page.get_by_test_id("toolbar-toggle").click()

            await ctx.close()
        await browser.close()

    if failures:
        print("\nFAIL:")
        for name, ratio in failures:
            print(f"  {name}: diff={ratio:.4f}")
        print("\nIf this is an intentional layout change, run:")
        print("  UPDATE_BASELINE=1 python3 tests/e2e/fab_visual.py")
        sys.exit(1)
    print("\nPASS: FAB visual baselines match")


asyncio.run(main())
