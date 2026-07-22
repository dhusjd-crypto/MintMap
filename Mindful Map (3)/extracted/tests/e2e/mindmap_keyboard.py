"""Mindmap keyboard navigation + inline edit + add/delete.

Run: python3 tests/e2e/mindmap_keyboard.py
"""
import asyncio
from playwright.async_api import async_playwright


async def selected_label(page) -> str:
    return await page.evaluate(
        """() => document.querySelector('[role=treeitem][aria-selected=true]')?.getAttribute('aria-label') || ''"""
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        # Auto-confirm window.confirm for the Delete test
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)

        tree = page.locator('[role=tree][aria-label=Mindmap]')
        await tree.wait_for(state="attached", timeout=10000)
        await tree.focus()
        # Pick the root explicitly via Home so initial selection is deterministic
        await page.keyboard.press("Home")
        await page.wait_for_timeout(200)
        root_label = await selected_label(page)
        print(f"✓ root selected: {root_label!r}")
        assert root_label, "no root selection after Home"

        # Arrow navigation — try all 4 directions until one moves selection
        moved = False
        for k in ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]:
            await page.keyboard.press(k)
            await page.wait_for_timeout(150)
            cur = await selected_label(page)
            if cur and cur != root_label:
                print(f"✓ {k} moved selection: {cur!r}")
                moved = True
                break
        assert moved, "arrow keys did not move selection"

        # Live region updated
        live = await page.locator('[data-testid="mindmap-live"]').text_content()
        print(f"✓ live region: {live!r}")
        assert "seçildi" in (live or "")

        # Return to root, add a child with "n"
        await page.keyboard.press("Home")
        await page.wait_for_timeout(150)
        before_count = await page.locator('[role="treeitem"]').count()
        await page.keyboard.press("n")
        await page.wait_for_timeout(300)
        after_count = await page.locator('[role="treeitem"]').count()
        assert after_count == before_count + 1, f"node count {before_count}→{after_count}"
        print(f"✓ 'n' added child: {before_count}→{after_count}")

        # Inline edit input should be focused on the new node
        edit_input = page.locator('input[aria-label="Düğüm başlığını düzenle"]')
        await edit_input.wait_for(state="visible", timeout=2000)
        await edit_input.fill("Klavye Testi")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        assert await page.get_by_text("Klavye Testi").count() >= 1
        print("✓ inline rename via Enter committed")

        # F2 → rename again, Escape cancels
        await tree.focus()
        await page.keyboard.press("F2")
        await page.wait_for_timeout(200)
        edit2 = page.locator('input[aria-label="Düğüm başlığını düzenle"]')
        await edit2.wait_for(state="visible", timeout=2000)
        await edit2.fill("İPTAL EDİLECEK")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        assert await page.get_by_text("İPTAL EDİLECEK").count() == 0
        print("✓ Escape cancels rename")

        # Delete current (the "Klavye Testi" node we just made) — dialog auto-accepted
        await tree.focus()
        cnt_before_del = await page.locator('[role="treeitem"]').count()
        await page.keyboard.press("Delete")
        await page.wait_for_timeout(400)
        cnt_after_del = await page.locator('[role="treeitem"]').count()
        assert cnt_after_del == cnt_before_del - 1, f"delete count {cnt_before_del}→{cnt_after_del}"
        print(f"✓ Delete removed node: {cnt_before_del}→{cnt_after_del}")

        # ? toggles help dialog
        await tree.focus()
        await page.keyboard.press("?")
        await page.wait_for_timeout(200)
        await page.locator('[data-testid="mindmap-help"]').wait_for(state="visible")
        print("✓ '?' opened help dialog")

        await browser.close()
    print("\nPASS: mindmap keyboard navigation")


asyncio.run(main())
