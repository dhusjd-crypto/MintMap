"""Keyboard activation when buttons are dynamically enabled.
When draft is empty both Plus and Ekle are disabled and unfocusable;
as soon as the user types a character they MUST become focusable and
respond to Enter (Ekle) and Space (Plus) immediately.

Run: python3 tests/e2e/a11y_keyboard_dynamic.py
"""
import asyncio
from playwright.async_api import async_playwright


async def is_focusable(page, locator) -> bool:
    await locator.focus()
    return await locator.evaluate("(el) => document.activeElement === el && !el.disabled")


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/todos", wait_until="domcontentloaded")
        await page.wait_for_timeout(700)

        plus = page.get_by_role("button", name="Görev ekle").first
        ekle = page.get_by_role("button", name="Görev ekle").last
        inp = page.get_by_placeholder("Görev ekle", exact=False)

        # Empty draft → both disabled, focus moves nowhere
        await inp.fill("")
        assert await plus.is_disabled(), "Plus should be disabled when draft empty"
        assert await ekle.is_disabled(), "Ekle should be disabled when draft empty"
        print("✓ both buttons disabled with empty draft")

        # Type a single character → buttons must be enabled and focusable instantly
        await inp.click()
        await page.keyboard.type("k")
        assert not await plus.is_disabled(), "Plus must enable after first char"
        assert not await ekle.is_disabled(), "Ekle must enable after first char"
        assert await is_focusable(page, plus), "Plus not focusable after enable"
        assert await is_focusable(page, ekle), "Ekle not focusable after enable"
        print("✓ both buttons focusable after typing")

        # Enter on Ekle commits the task
        await inp.fill("dinamik enter")
        await ekle.focus()
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        assert await page.get_by_text("dinamik enter").count() >= 1
        print("✓ Enter on Ekle added task")

        # Space on Plus commits
        await inp.fill("dinamik space")
        await plus.focus()
        await page.keyboard.press("Space")
        await page.wait_for_timeout(300)
        assert await page.get_by_text("dinamik space").count() >= 1
        print("✓ Space on Plus added task")

        # After submit, draft is cleared → buttons return to disabled
        await page.wait_for_timeout(200)
        assert await plus.is_disabled() and await ekle.is_disabled(), \
            "Buttons should re-disable after submit clears draft"
        print("✓ buttons re-disabled after draft cleared")

        await browser.close()
    print("\nPASS: dynamic focus + activation")


asyncio.run(main())
