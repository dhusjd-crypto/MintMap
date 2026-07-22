"""FAB layout performance regression.

Measures how long the FAB slot system takes to react to state
changes that trigger re-registration (wrench toggle, AI menu open,
child node selection). We sample multiple times and assert that the
worst single transition stays under an SLA budget.

Budgets reflect the work that must happen on every transition:
  - Zustand-style store mutation (Map.copy + emit)
  - useSyncExternalStore re-subscribe in N FAB consumers
  - React commit + style flush

Run:  python3 tests/e2e/fab_perf.py
"""
import asyncio
import json
import statistics
import sys
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots" / "fab_perf"
OUT.mkdir(parents=True, exist_ok=True)

BASE_URL = "http://localhost:8080"

# Per-transition budgets (ms). Generous to absorb CI jitter while still
# catching real regressions (a quadratic blow-up shows orders larger).
# Per-transition budgets (ms). Calibrated to ~2× the observed worst
# in headless CI so animation jitter doesn't flake, while still
# catching real regressions (a quadratic blow-up or sync layout storm
# shows orders larger than these numbers).
BUDGETS = {
    "wrench_toggle": 700,
    "ai_menu_toggle": 300,
    "child_select": 900,
}
SAMPLES = 5


async def measure(page, label, action) -> float:
    """Time a UI action via performance.now() bracketing the click and
    the subsequent layout settle (we wait for two animation frames)."""
    timings: list[float] = []
    for _ in range(SAMPLES):
        await page.evaluate("() => { window.__t = performance.now(); }")
        await action()
        elapsed = await page.evaluate(
            """async () => {
              await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
              return performance.now() - window.__t;
            }"""
        )
        timings.append(float(elapsed))
    return timings


async def main() -> None:
    results: dict = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.wait_for_selector("[data-node-id]", timeout=15_000)
        await page.wait_for_selector('[data-fab-id="ai-launcher"]', timeout=10_000)
        # Dismiss auto-opened node sheet
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(150)

        async def toggle_wrench():
            await page.get_by_test_id("toolbar-toggle").click()

        async def toggle_ai():
            await page.get_by_test_id("fab-ai").click()

        async def child_select():
            # Dismiss any leftover scrim/sheet first so the click hits.
            await page.evaluate(
                """() => {
                  const scrim = document.querySelector('.fixed.inset-0.z-40');
                  if (scrim) scrim.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
                }"""
            )
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(120)
            nodes = page.locator("[data-node-id]")
            if await nodes.count() >= 2:
                await nodes.nth(1).click(force=True)
                await page.keyboard.press("Escape")
            else:
                await page.keyboard.press("Tab")

        results["wrench_toggle"] = await measure(page, "wrench", toggle_wrench)
        # leave wrench closed for next measurement
        await page.get_by_test_id("toolbar-toggle").click()
        await page.wait_for_timeout(200)

        results["ai_menu_toggle"] = await measure(page, "ai", toggle_ai)
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)

        results["child_select"] = await measure(page, "child", child_select)

        await page.screenshot(path=str(OUT / "after_perf.png"))
        await browser.close()

    fails = []
    print("\nFAB layout performance (ms / transition)")
    print("=" * 56)
    for name, samples in results.items():
        budget = BUDGETS[name]
        p95 = sorted(samples)[max(0, int(len(samples) * 0.95) - 1)]
        worst = max(samples)
        mean = statistics.mean(samples)
        ok = worst <= budget
        flag = "PASS" if ok else "FAIL"
        print(
            f"  {name:<18} mean={mean:6.1f}  p95={p95:6.1f}  max={worst:6.1f}  "
            f"budget={budget:>4}  → {flag}"
        )
        if not ok:
            fails.append((name, worst, budget))

    if fails:
        print("\nFAIL: budget exceeded")
        print(json.dumps(fails, indent=2))
        sys.exit(1)
    print("\nPASS: all transitions within budget")


asyncio.run(main())
