# E2E Tests (Playwright)

These are smoke / regression scripts run directly against the running
dev server (http://localhost:8080). They are not wired into vitest —
run them manually with:

```bash
python3 tests/e2e/dropzone.py
python3 tests/e2e/crop_overlay.py
python3 tests/e2e/minimap.py
```

Each script:

- launches headless Chromium
- restores the Supabase session from `LOVABLE_BROWSER_SUPABASE_*`
  env vars (when present) before navigating to authenticated routes
- writes screenshots to `/tmp/browser/e2e/<script>/`
- prints a JSON report; exit code is non-zero on failure

Selectors rely on stable `data-testid` and `aria-label` attributes:

| Test ID | Component |
|---|---|
| `minimap` | `<Minimap>` wrapper div |
| `toolbar-toggle` | Mindmap tools FAB |
| `toolbar-actions` | Expanded toolbar action column |
| `templates-toggle` | TemplateMenu FAB |
| `templates-menu` | TemplateMenu popover |
| `image-dropzone` | NodeImagePanel dropzone |
