"""Inline rename edge cases:
- empty value → no change, exits edit mode
- same name → no-op (no live announcement)
- rapid Enter then Esc → Enter commits, Esc is ignored after exit
- Esc during typing → discards changes
- Enter on whitespace-only value → treated as empty
Run: python3 tests/e2e/mindmap_rename_edges.py
"""
import asyncio
from playwright.async_api import async_playwright


async def title_of_selected(page) -> str:
    return await page.evaluate(
        "() => document.querySelector('[role=treeitem][aria-selected=true]')?.textContent?.trim().split('\\n')[0] || ''"
    )


async def live(page) -> str:
    return (await page.locator('[data-testid="mindmap-live"]').text_content()) or ""


async def open_rename(page, tree):
    await tree.focus()
    await page.keyboard.press("F2")
    inp = page.locator('input[aria-label="Düğüm başlığını düzenle"]')
    await inp.wait_for(state="visible", timeout=2000)
    return inp


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
        await page.wait_for_timeout(900)

        tree = page.locator('[role=tree][aria-label=Mindmap]')
        await tree.wait_for(state="attached")
        await tree.focus()
        await page.keyboard.press("Home")
        await page.wait_for_timeout(150)

        # Make a fresh test node so we don't depend on seed titles
        await page.keyboard.press("n")
        await page.wait_for_timeout(300)
        inp = page.locator('input[aria-label="Düğüm başlığını düzenle"]')
        await inp.wait_for(state="visible")
        await inp.fill("Edge Test")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        # Capture this node's id so we can reliably target it later
        target_id = await page.locator('[role=treeitem][aria-selected="true"]').first.get_attribute("data-node-id")
        assert target_id, "no selected id after create"
        original = await title_of_selected(page)
        assert original == "Edge Test", f"setup failed: {original!r}"
        print(f"✓ setup: created {original!r} id={target_id}")

        async def select_target():
            await page.locator(f'[data-node-id="{target_id}"]').click()
            await page.wait_for_timeout(200)
            await tree.focus()

        # Case 1: empty value → reverts, no NEW rename announcement
        before_msg = await live(page)
        inp = await open_rename(page, tree)
        await inp.fill("")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        assert await title_of_selected(page) == "Edge Test"
        after_msg = await live(page)
        assert after_msg == before_msg, f"live message should not change: {before_msg!r} → {after_msg!r}"
        print("✓ empty value: no rename, no new announcement")

        # Case 2: whitespace-only value → same as empty
        inp = await open_rename(page, tree)
        await inp.fill("    ")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        assert await title_of_selected(page) == "Edge Test"
        print("✓ whitespace-only: no rename")

        # Case 3: same name → no NEW announcement
        # Selection has stayed on target node through all prior cases.
        assert await title_of_selected(page) == "Edge Test", "lost target between cases"
        before_msg = await live(page)
        inp = await open_rename(page, tree)
        await inp.fill("Edge Test")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        after_msg = await live(page)
        assert after_msg == before_msg, f"same-name should not announce: {before_msg!r} → {after_msg!r}"
        print("✓ same name: no new announcement")

        # Case 4: Esc during typing discards
        inp = await open_rename(page, tree)
        await inp.fill("DISCARD ME")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        assert await title_of_selected(page) == "Edge Test"
        print("✓ Esc discards typed changes")

        # Case 5: rapid Enter then Esc — Enter wins, Esc no-op (input already gone)
        inp = await open_rename(page, tree)
        await inp.fill("Hızlı")
        await page.keyboard.press("Enter")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(300)
        title = await title_of_selected(page)
        assert title == "Hızlı", f"rapid Enter+Esc: {title!r}"
        print("✓ rapid Enter+Esc: Enter committed")

        # Case 6: input not visible while not editing
        assert await page.locator('input[aria-label="Düğüm başlığını düzenle"]').count() == 0
        print("✓ rename input removed after commit")

        await browser.close()
    print("\nPASS: rename edge cases")


asyncio.run(main())
