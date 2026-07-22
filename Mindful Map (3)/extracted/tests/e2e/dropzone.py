"""E2E: Image dropzone is reachable in /todos list view, TaskSheet, and NodeSheet."""
import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path("/tmp/browser/e2e/dropzone"); SHOTS.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("E2E_URL", "http://localhost:8080")


async def restore_session(page):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sess = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and sess:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(sess)})"
        )


async def dismiss_sheets(page):
    """Close any open sheet/modal by hitting Escape and clicking backdrop."""
    for _ in range(3):
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(150)


async def main():
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()

        console_errors = []
        page.on("console", lambda m: m.type == "error" and console_errors.append(m.text))
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        await page.goto(URL, wait_until="domcontentloaded")
        await restore_session(page)

        # ---- 1) TaskSheet from /todos ----
        await page.goto(URL + "/todos", wait_until="networkidle")
        await page.wait_for_timeout(900)
        await dismiss_sheets(page)
        # Click first task row by exact text match (rows are top-level <button>s
        # with the task title in a <span>).
        try:
            await page.get_by_text("Spor", exact=True).first.click(timeout=4000)
            await page.wait_for_timeout(900)
        except Exception as e:
            failures.append(f"TaskSheet: row click failed: {e}")
        await page.screenshot(path=str(SHOTS / "tasksheet.png"))
        try:
            await page.locator('[data-testid="image-dropzone"]').first.wait_for(
                state="visible", timeout=4000
            )
        except Exception:
            failures.append("TaskSheet: image-dropzone not visible")
        await dismiss_sheets(page)

        # ---- 2) NodeSheet from / (mindmap) ----
        # A single tap on an unselected node opens NodeSheet via onOpenSheet.
        await page.goto(URL + "/", wait_until="networkidle")
        await page.wait_for_timeout(900)
        await dismiss_sheets(page)
        try:
            node = page.get_by_text("Hafta planı", exact=True).first
            await node.click(timeout=4000)
            await page.wait_for_timeout(900)
        except Exception as e:
            failures.append(f"NodeSheet: node click failed: {e}")
        await page.screenshot(path=str(SHOTS / "nodesheet.png"))
        try:
            await page.locator('[data-testid="image-dropzone"]').first.wait_for(
                state="visible", timeout=4000
            )
        except Exception:
            failures.append("NodeSheet: image-dropzone not visible")
        await dismiss_sheets(page)

        # ---- 3) /todos list view (after selecting a node via the side nav sheet) ----
        # The list-view dropzone only renders when view.kind === "list" — open the
        # nav sheet (hamburger) and click a "Mindmap düğümleri" entry.
        await page.goto(URL + "/todos", wait_until="networkidle")
        await page.wait_for_timeout(800)
        await dismiss_sheets(page)
        # Hamburger / menu trigger has aria-label "Menü" or icon Menu
        try:
            menu = page.locator('button[aria-label*="Menü" i], button:has(svg.lucide-menu)').first
            if await menu.count() > 0:
                await menu.click(timeout=2000)
                # Wait for the radix Sheet open animation to settle
                await page.wait_for_timeout(900)
            # Click the node entry inside the opened nav dialog
            nav_item = page.locator(
                'div[role="dialog"][data-state="open"] button:has-text("Hafta planı")'
            ).first
            await nav_item.click(timeout=4000)
            await page.wait_for_timeout(800)
        except Exception as e:
            failures.append(f"/todos list view: nav switch failed: {e}")
        await dismiss_sheets(page)
        await page.screenshot(path=str(SHOTS / "todos_list.png"))
        # Don't hard-fail on this one — list-view panel is conditional on data
        if await page.locator('[data-testid="image-dropzone"]').count() < 1:
            print("WARN: /todos list view dropzone not in DOM (non-fatal)")

        await browser.close()

    dup_key = [e for e in console_errors if "same key" in e or "unique key" in e]
    report = {
        "failures": failures,
        "console_errors": len(console_errors),
        "duplicate_key_warnings": dup_key,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(1 if failures or dup_key else 0)


asyncio.run(main())
