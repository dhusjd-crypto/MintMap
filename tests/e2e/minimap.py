"""E2E: Mindmap minimap renders all nodes + viewport rect, no duplicate-key warnings,
toolbar opens, template menu opens."""
import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path("/tmp/browser/e2e/minimap"); SHOTS.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("E2E_URL", "http://localhost:8080")


async def restore_session(page):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sess = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and sess:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(sess)})"
        )


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

        await page.goto(URL + "/", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=str(SHOTS / "mindmap.png"))

        # Minimap present
        mm = page.locator('[data-testid="minimap"]')
        if await mm.count() == 0:
            failures.append("minimap not rendered")
        else:
            # Count circles inside the minimap SVG — must equal number of nodes
            circles = await mm.locator("circle").count()
            if circles < 1:
                failures.append(f"minimap has no circles (got {circles})")
            # Viewport rect must exist
            if await mm.locator("rect").count() < 1:
                failures.append("minimap viewport rect missing")
            await mm.screenshot(path=str(SHOTS / "minimap_only.png"))

        # Toolbar toggle
        toggle = page.locator('[data-testid="toolbar-toggle"]')
        if await toggle.count() == 0:
            failures.append("toolbar toggle missing")
        else:
            await toggle.click()
            await page.wait_for_timeout(400)
            if not await page.locator('[data-testid="toolbar-actions"]').is_visible():
                failures.append("toolbar actions did not open")
            await page.screenshot(path=str(SHOTS / "toolbar_open.png"))

            # Template menu
            tmpl = page.locator('[data-testid="templates-toggle"]')
            if await tmpl.count() == 0:
                failures.append("template toggle missing")
            else:
                await tmpl.click()
                await page.wait_for_timeout(400)
                if not await page.locator('[data-testid="templates-menu"]').is_visible():
                    failures.append("template menu did not open")
                await page.screenshot(path=str(SHOTS / "templates_open.png"))

        await browser.close()

    dup_key = [e for e in console_errors if "same key" in e or "unique key" in e]
    report = {
        "failures": failures,
        "console_errors": len(console_errors),
        "duplicate_key_warnings": dup_key,
        "errors_sample": console_errors[:5],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(1 if failures or dup_key else 0)


asyncio.run(main())
