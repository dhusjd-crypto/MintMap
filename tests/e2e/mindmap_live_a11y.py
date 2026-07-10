"""Verify aria-live announcements actually surface in the
accessibility tree for select / add / delete / rename events.

Run: python3 tests/e2e/mindmap_live_a11y.py
"""
import asyncio
from playwright.async_api import async_playwright


async def find_in_a11y(page, substr: str) -> str:
    """Search the entire accessibility tree for a node whose name/value/desc
    contains substr. Returns the matching text, or ''."""
    snap = await page.accessibility.snapshot(interesting_only=False)

    def walk(n):
        if not n:
            return ""
        for field in ("name", "value", "description"):
            v = n.get(field)
            if isinstance(v, str) and substr in v:
                return v
        for c in n.get("children") or []:
            r = walk(c)
            if r:
                return r
        return ""
    return walk(snap)


async def wait_for_status(page, substr: str, timeout_ms: int = 4000) -> str:
    import time
    deadline = time.time() + timeout_ms / 1000
    last = ""
    while time.time() < deadline:
        last = await find_in_a11y(page, substr)
        if last:
            # Also assert the role=status DOM node carries the same text so we
            # know the announcement comes from the live region, not some other label.
            dom = (await page.locator('[data-testid="mindmap-live"]').text_content()) or ""
            assert substr in dom, f"live region DOM mismatch: {dom!r}"
            return last
        await page.wait_for_timeout(120)
    raise AssertionError(f"a11y tree never exposed {substr!r}; last={last!r}")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))
        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)

        tree = page.locator('[role=tree][aria-label=Mindmap]')
        await tree.wait_for(state="attached")
        await tree.focus()

        # SELECT — Home picks root, then ArrowDown announces selection
        await page.keyboard.press("Home")
        sel1 = await wait_for_status(page, "seçildi")
        print(f"✓ select announces in a11y tree: {sel1!r}")

        # ADD — 'n' announces "Yeni dal eklendi"
        await page.keyboard.press("Home")
        await page.wait_for_timeout(100)
        await page.keyboard.press("n")
        add_msg = await wait_for_status(page, "Yeni dal eklendi")
        print(f"✓ add announces: {add_msg!r}")

        # RENAME — type a title and Enter; announcement = "Yeniden adlandırıldı: …"
        edit = page.locator('input[aria-label="Düğüm başlığını düzenle"]')
        await edit.wait_for(state="visible")
        await edit.fill("Duyuru Testi")
        await page.keyboard.press("Enter")
        rn = await wait_for_status(page, "Yeniden adlandırıldı: Duyuru Testi")
        print(f"✓ rename announces: {rn!r}")

        # DELETE — confirm dialog auto-accepted
        await tree.focus()
        await page.keyboard.press("Delete")
        del_msg = await wait_for_status(page, "Düğüm silindi")
        print(f"✓ delete announces: {del_msg!r}")

        await browser.close()
    print("\nPASS: aria-live surfaces in accessibility tree")


asyncio.run(main())
