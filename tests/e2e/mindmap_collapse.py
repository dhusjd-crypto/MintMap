"""Mindmap collapse/expand keyboard shortcuts.

Run: python3 tests/e2e/mindmap_collapse.py
"""
import asyncio
from playwright.async_api import async_playwright


async def visible_treeitems(page) -> int:
    return await page.locator('[role=treeitem]').count()


async def aria_expanded(page, node_id: str):
    return await page.locator(f'[data-node-id="{node_id}"]').get_attribute("aria-expanded")


async def selected_id(page) -> str:
    el = page.locator('[role=treeitem][aria-selected="true"]').first
    if await el.count() == 0:
        return ""
    return await el.get_attribute("data-node-id") or ""


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

        root_id = await selected_id(page)
        assert root_id, "no root selected"
        before = await visible_treeitems(page)
        exp_before = await aria_expanded(page, root_id)
        print(f"root={root_id} visible={before} aria-expanded={exp_before}")
        assert exp_before == "true", f"root should start expanded: {exp_before}"
        assert before >= 2, "expected root + at least one child"

        # 'c' collapses
        await page.keyboard.press("c")
        await page.wait_for_timeout(300)
        mid = await visible_treeitems(page)
        exp_mid = await aria_expanded(page, root_id)
        assert mid < before, f"collapse should hide children: {before}→{mid}"
        assert exp_mid == "false", f"aria-expanded should be false: {exp_mid}"
        live = await page.locator('[data-testid="mindmap-live"]').text_content()
        assert "daraltıldı" in (live or ""), f"live: {live!r}"
        print(f"✓ 'c' collapsed: {before}→{mid}, aria-expanded={exp_mid}")

        # ArrowRight expands (WAI-ARIA tree)
        await page.keyboard.press("ArrowRight")
        await page.wait_for_timeout(300)
        after = await visible_treeitems(page)
        exp_after = await aria_expanded(page, root_id)
        assert after == before, f"expand should restore: {after} vs {before}"
        assert exp_after == "true"
        print(f"✓ ArrowRight expanded: {mid}→{after}, aria-expanded={exp_after}")

        # ArrowLeft collapses again
        await page.keyboard.press("ArrowLeft")
        await page.wait_for_timeout(300)
        assert await aria_expanded(page, root_id) == "false"
        print("✓ ArrowLeft collapsed")

        # Chevron sub-button: Enter activates
        toggle = page.locator(f'[data-testid="mindnode-toggle-{root_id}"]')
        await toggle.wait_for(state="visible")
        await toggle.focus()
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        assert await aria_expanded(page, root_id) == "true"
        print("✓ Enter on chevron expanded")

        # Space on chevron collapses
        await toggle.focus()
        await page.keyboard.press(" ")
        await page.wait_for_timeout(300)
        assert await aria_expanded(page, root_id) == "false"
        print("✓ Space on chevron collapsed")

        # Arrows do not jump to hidden descendants — only currently visible treeitems
        await tree.focus()
        await page.keyboard.press("Home")
        await page.wait_for_timeout(150)
        await page.keyboard.press("ArrowDown")
        await page.wait_for_timeout(150)
        sel = await selected_id(page)
        visible_ids = await page.locator('[role=treeitem]').evaluate_all(
            "els => els.map(e => e.getAttribute('data-node-id'))"
        )
        assert sel in visible_ids, f"selection {sel!r} not in visible {visible_ids!r}"
        print(f"✓ arrows stay within visible nodes ({len(visible_ids)} visible)")

        await browser.close()
    print("\nPASS: mindmap collapse/expand")


asyncio.run(main())
