"""Keyboard navigation: Tab/Shift+Tab focus order through composer,
plus Enter/Space activation on Plus and Ekle buttons.

Run: python3 tests/e2e/a11y_keyboard.py
"""
import asyncio
from playwright.async_api import async_playwright


async def active_label(page) -> str:
    return await page.evaluate(
        """() => {
          const el = document.activeElement;
          if (!el) return '';
          return el.getAttribute('aria-label')
            || el.getAttribute('placeholder')
            || el.textContent?.trim()
            || el.tagName;
        }"""
    )


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/todos", wait_until="domcontentloaded")
        await page.wait_for_timeout(700)

        # Buttons are disabled when draft is empty — fill first so they're focusable.
        await page.get_by_placeholder("Görev ekle", exact=False).fill("tab sırası")
        plus = page.get_by_role("button", name="Görev ekle").first
        await plus.focus()
        seq = [await active_label(page)]
        for _ in range(2):
            await page.keyboard.press("Tab")
            seq.append(await active_label(page))
        print("Tab order:", seq)
        assert seq[0] == "Görev ekle", f"start: {seq[0]!r}"
        assert "Görev ekle" in seq[1], f"after Tab #1 (input): {seq[1]!r}"
        assert seq[2] == "Görev ekle", f"after Tab #2 (Ekle): {seq[2]!r}"

        await page.keyboard.press("Shift+Tab")
        back = await active_label(page)
        print("Shift+Tab →", back)
        assert "Görev ekle" in back

        # Enter activation on focused Ekle button
        await page.get_by_placeholder("Görev ekle", exact=False).fill("enter aktivasyon")
        ekle = page.get_by_role("button", name="Görev ekle").last
        await ekle.focus()
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        added_enter = await page.get_by_text("enter aktivasyon").count()
        assert added_enter >= 1, "Enter did not activate Ekle button"
        print("✓ Enter activated Ekle button")

        # Space activation on focused Plus button
        await page.get_by_placeholder("Görev ekle", exact=False).fill("space aktivasyon")
        plus = page.get_by_role("button", name="Görev ekle").first
        await plus.focus()
        await page.keyboard.press("Space")
        await page.wait_for_timeout(300)
        added_space = await page.get_by_text("space aktivasyon").count()
        assert added_space >= 1, "Space did not activate Plus button"
        print("✓ Space activated Plus button")

        await browser.close()
    print("\nPASS: keyboard focus order + Enter/Space activation")


asyncio.run(main())
