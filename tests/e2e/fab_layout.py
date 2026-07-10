"""FAB layout regression: no overlaps and every FAB is independently
clickable across viewports and app states.

Covers AILauncher, Pomodoro, Wrench toolbar and the Mindmap context
cluster (Plus / Görev / Sil). Each FAB exposes a stable
`data-fab-id` attribute defined in `src/lib/fab-slots.ts`.

States exercised:
  1. idle
  2. wrench toolbar open
  3. AI quick-actions menu open
  4. mindmap child node selected (Sil + Görev appear)
  5. wrench open AND child selected (worst case)

Run:
  python3 tests/e2e/fab_layout.py
"""
import asyncio
import json
import sys
from pathlib import Path

from playwright.async_api import Page, async_playwright

OUT = Path(__file__).parent / "screenshots" / "fab_layout"
OUT.mkdir(parents=True, exist_ok=True)

# (label, width, height) — covers phone, large phone, tablet, desktop.
VIEWPORTS = [
    ("iphone13", 390, 844),
    ("pixel7", 412, 915),
    ("ipad", 768, 1024),
    ("desktop", 1280, 800),
]

BASE_URL = "http://localhost:8080"


def aabb_overlap(a: dict, b: dict) -> bool:
    return (
        a["x"][1] > b["x"][0]
        and b["x"][1] > a["x"][0]
        and a["y"][1] > b["y"][0]
        and b["y"][1] > a["y"][0]
    )


async def read_fabs(page: Page) -> list[dict]:
    return await page.evaluate(
        """() => {
          const els = [...document.querySelectorAll('[data-fab-id]')];
          return els.map(el => {
            const r = el.getBoundingClientRect();
            return {
              id: el.dataset.fabId,
              x: [Math.round(r.left), Math.round(r.right)],
              y: [Math.round(r.top), Math.round(r.bottom)],
            };
          }).filter(b => b.x[1] > b.x[0] && b.y[1] > b.y[0]);
        }"""
    )


def find_collisions(boxes: list[dict]) -> list[str]:
    out = []
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            if aabb_overlap(boxes[i], boxes[j]):
                out.append(f"{boxes[i]['id']}↔{boxes[j]['id']}")
    return out


async def assert_clickable(page: Page, ids: list[str]) -> list[str]:
    """Return list of FAB ids whose center is NOT hit by themselves."""
    failures: list[str] = []
    for fab_id in ids:
        info = await page.evaluate(
            """(id) => {
              const el = document.querySelector(`[data-fab-id="${id}"]`);
              if (!el) return { ok: false, reason: 'missing' };
              const r = el.getBoundingClientRect();
              const cx = Math.round(r.left + r.width / 2);
              const cy = Math.round(r.top + r.height / 2);
              const top = document.elementFromPoint(cx, cy);
              const ok = !!top && (el === top || el.contains(top));
              return { ok, reason: ok ? 'ok' : `blocked by ${top ? top.tagName : 'nothing'}` };
            }""",
            fab_id,
        )
        if not info["ok"]:
            failures.append(f"{fab_id} ({info['reason']})")
    return failures


async def wait_for_fabs(page: Page, ids: list[str]) -> None:
    for fab_id in ids:
        await page.wait_for_selector(f'[data-fab-id="{fab_id}"]', timeout=10_000)


async def run_state(page: Page, label: str, vw: str, state: str, expected: list[str]) -> dict:
    """Capture a screenshot, detect collisions, and verify click hit-test."""
    fabs = await read_fabs(page)
    collisions = find_collisions(fabs)
    unclickable = await assert_clickable(page, expected)
    shot = OUT / f"{vw}_{state}.png"
    await page.screenshot(path=str(shot))
    return {
        "viewport": vw,
        "state": state,
        "fabs": fabs,
        "collisions": collisions,
        "unclickable": unclickable,
        "screenshot": str(shot.relative_to(Path(__file__).parent)),
        "label": label,
    }


async def open_wrench(page: Page) -> None:
    await page.get_by_test_id("toolbar-toggle").click()
    await page.wait_for_timeout(350)


async def close_wrench(page: Page) -> None:
    await page.get_by_test_id("toolbar-toggle").click()
    await page.wait_for_timeout(250)


async def dismiss_overlays(page: Page) -> None:
    """Close any open sheet/popover. Calls click() directly on the
    NodeSheet backdrop via JS (Playwright's click can be intercepted
    by sibling elements in stacking contexts) and presses Escape for
    keyboard-driven popovers (AI menu)."""
    for _ in range(6):
        await page.evaluate(
            """() => {
              // NodeSheet backdrop: invoke its react onClick by
              // dispatching a real click event at its top-left.
              const scrim = document.querySelector('.fixed.inset-0.z-40');
              if (scrim) {
                scrim.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }
            }"""
        )
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        scrim = await page.locator(".fixed.inset-0.z-40").count()
        sheet = await page.locator(".fixed.inset-x-0.bottom-0.z-50").count()
        if scrim == 0 and sheet == 0:
            return





async def select_child_node(page: Page) -> bool:
    """Click the second mindmap node and dismiss the auto-opened
    detail sheet. The selection survives the dismissal, exposing the
    Sil + Görev context FABs."""
    count = await page.locator("[data-node-id]").count()
    if count < 2:
        return False
    await page.locator("[data-node-id]").nth(1).click()
    await page.wait_for_timeout(300)
    # Tap opens the NodeSheet detail panel; close it so it does not
    # cover the FABs we want to measure.
    await dismiss_overlays(page)
    return True



async def main() -> None:
    results: list[dict] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for vw, w, h in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": w, "height": h})
            page = await ctx.new_page()
            await page.goto(BASE_URL, wait_until="domcontentloaded")
            # Wait until the mindmap canvas has hydrated — the "Mindmap
            # yükleniyor…" placeholder hides the wrench toolbar and
            # context FAB cluster until then.
            await page.wait_for_selector("[data-node-id]", timeout=15_000)
            await wait_for_fabs(
                page,
                ["wrench-toolbar", "mindmap-context", "ai-launcher", "pomodoro"],
            )
            # Dismiss any auto-opened sheet (e.g. node detail) so it
            # cannot intercept clicks on FABs.
            await dismiss_overlays(page)
            # Re-wait — dismiss may have triggered a re-render that
            # briefly detaches a FAB.
            await page.wait_for_selector('[data-fab-id="mindmap-context"]', timeout=5_000)
            all_ids = ["wrench-toolbar", "mindmap-context", "ai-launcher", "pomodoro"]



            # 1. Idle
            results.append(await run_state(page, "idle", vw, "idle", all_ids))

            # 2. Wrench toolbar open
            await open_wrench(page)
            results.append(
                await run_state(
                    page, "wrench-open", vw, "wrench_open",
                    ["ai-launcher", "pomodoro", "mindmap-context"],
                )
            )
            await close_wrench(page)

            # 3. AI menu open (popover above AI button on desktop,
            #    bottom sheet on mobile — either way layout-only).
            await page.get_by_test_id("fab-ai").click()
            await page.wait_for_timeout(300)
            results.append(
                await run_state(
                    page, "ai-menu", vw, "ai_menu",
                    ["pomodoro", "wrench-toolbar", "mindmap-context"],
                )
            )
            await dismiss_overlays(page)

            # 4. Child node selected
            had_child = await select_child_node(page)
            if had_child:
                results.append(await run_state(page, "child-selected", vw, "child_selected", all_ids))

                # 5. Wrench open + child selected
                await open_wrench(page)
                results.append(
                    await run_state(
                        page, "wrench+child", vw, "wrench_and_child",
                        ["ai-launcher", "pomodoro", "mindmap-context"],
                    )
                )
                await close_wrench(page)
            else:
                print(f"[{vw}] skip child-selected variants (only one mindmap node)")


            await ctx.close()
        await browser.close()

    # Report
    fails = [r for r in results if r["collisions"] or r["unclickable"]]
    for r in results:
        flag = "PASS" if not (r["collisions"] or r["unclickable"]) else "FAIL"
        extras = []
        if r["collisions"]:
            extras.append(f"collisions={r['collisions']}")
        if r["unclickable"]:
            extras.append(f"unclickable={r['unclickable']}")
        extras_str = f"  {' '.join(extras)}" if extras else ""
        print(f"[{r['viewport']} / {r['state']}] {flag}{extras_str}")

    if fails:
        print("\nFAILED scenarios:")
        for r in fails:
            print(json.dumps(r, indent=2, ensure_ascii=False))
        sys.exit(1)

    print(f"\nPASS: {len(results)} scenarios across {len(VIEWPORTS)} viewports — no collisions, all FABs clickable")


asyncio.run(main())
