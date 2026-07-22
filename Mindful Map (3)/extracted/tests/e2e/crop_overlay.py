"""E2E: Upload a small image via the dropzone, open crop overlay, switch ratios, apply.

Verifies CropOverlay (extracted module) renders, ratio chips are clickable,
and Kırp button commits without throwing.
"""
import asyncio, base64, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright

SHOTS = Path("/tmp/browser/e2e/crop"); SHOTS.mkdir(parents=True, exist_ok=True)
URL = os.environ.get("E2E_URL", "http://localhost:8080")

# 4x4 red PNG
PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mP8z8BQz0AEYBxVCAB"
    "5pgRRBy3vdAAAAABJRU5ErkJggg=="
)


async def restore_session(page):
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sess = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and sess:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(key)}, {json.dumps(sess)})"
        )


async def main():
    failures = []
    tmp = Path("/tmp/browser/e2e/crop/red.png")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(base64.b64decode(PNG_B64))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        console_errors = []
        page.on("console", lambda m: m.type == "error" and console_errors.append(m.text))
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        await page.goto(URL, wait_until="domcontentloaded")
        await restore_session(page)

        await page.goto(URL + "/todos", wait_until="networkidle")
        await page.wait_for_timeout(800)
        # Open a list with image panel
        list_btn = page.locator("button").filter(has_text="Hafta planı").first
        if await list_btn.count() > 0:
            await list_btn.click()
            await page.wait_for_timeout(600)

        dz = page.locator('[data-testid="image-dropzone"]').first
        try:
            await dz.wait_for(state="visible", timeout=3000)
        except Exception:
            failures.append("dropzone not visible — cannot start crop flow")
            print(json.dumps({"failures": failures}, indent=2))
            await browser.close()
            sys.exit(1)

        # Locate the hidden file input adjacent to the dropzone (the panel uses
        # an <input type=file hidden> that the dropzone click forwards to).
        await page.set_input_files('input[type="file"]', str(tmp))
        # wait for compression + commit
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "after_upload.png"))

        # Open crop mode — button has aria-label "Kırp" / icon
        crop_btn = page.get_by_role("button", name="Kırp").first
        if await crop_btn.count() == 0:
            # try icon-only by title attribute
            crop_btn = page.locator('button[aria-label*="Kırp" i]').first
        if await crop_btn.count() == 0:
            failures.append("could not find Kırp button after upload")
        else:
            await crop_btn.click()
            await page.wait_for_timeout(500)
            await page.screenshot(path=str(SHOTS / "crop_open.png"))

            # Verify ratio chips rendered (CropOverlay)
            for label in ["Serbest", "1:1", "16:9"]:
                chip = page.get_by_role("button", name=label).first
                if await chip.count() == 0:
                    failures.append(f"crop ratio chip missing: {label}")
            # Click 1:1, then 16:9
            try:
                await page.get_by_role("button", name="1:1").first.click(timeout=2000)
                await page.wait_for_timeout(200)
                await page.get_by_role("button", name="16:9").first.click(timeout=2000)
                await page.wait_for_timeout(200)
                await page.screenshot(path=str(SHOTS / "crop_ratio_switched.png"))
            except Exception as e:
                failures.append(f"clicking ratio chips failed: {e}")

            # Apply crop
            try:
                apply = page.get_by_role("button", name="Kırp").last
                await apply.click(timeout=2000)
                await page.wait_for_timeout(800)
                await page.screenshot(path=str(SHOTS / "crop_applied.png"))
            except Exception as e:
                failures.append(f"apply crop failed: {e}")

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
