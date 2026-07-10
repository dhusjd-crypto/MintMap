"""aria-live region announces task additions to screen readers.

Run: python3 tests/e2e/a11y_live_region.py
"""
import asyncio
from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/todos", wait_until="domcontentloaded")
        await page.wait_for_timeout(700)

        live = page.locator('[data-testid="todos-live"]')
        await live.wait_for(state="attached")

        # Verify ARIA attrs
        role = await live.get_attribute("role")
        aria_live = await live.get_attribute("aria-live")
        aria_atomic = await live.get_attribute("aria-atomic")
        assert role == "status", f"role={role!r}"
        assert aria_live == "polite", f"aria-live={aria_live!r}"
        assert aria_atomic == "true", f"aria-atomic={aria_atomic!r}"
        print(f"✓ role={role} aria-live={aria_live} aria-atomic={aria_atomic}")

        # Region is in the a11y tree (sr-only is visually hidden but exposed)
        snap = await page.accessibility.snapshot(interesting_only=False)

        def find_status(node):
            if not node:
                return None
            if node.get("role") == "status":
                return node
            for c in node.get("children") or []:
                r = find_status(c)
                if r:
                    return r
            return None
        status_node = find_status(snap)
        assert status_node is not None, "status node missing from a11y tree"
        print("✓ status region present in accessibility tree")

        # Empty before submit
        before = (await live.text_content()) or ""
        assert before.strip() == "", f"expected empty, got {before!r}"

        # Add a task → live region must update with the task text
        await page.get_by_placeholder("Görev ekle", exact=False).fill("süt al")
        await page.get_by_role("button", name="Görev ekle").last.click()
        # Wait for live-region update
        await page.wait_for_function(
            "() => (document.querySelector('[data-testid=todos-live]')?.textContent || '').includes('süt al')",
            timeout=2000,
        )
        after = (await live.text_content()) or ""
        print(f"✓ live announcement: {after!r}")
        assert "Görev eklendi" in after and "süt al" in after

        await browser.close()
    print("\nPASS: aria-live announcement")


asyncio.run(main())
