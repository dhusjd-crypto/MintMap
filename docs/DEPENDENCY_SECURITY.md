# Dependency Security Baseline

`npm audit --json` on 2026-08-14 reports 6 high-severity advisories and no critical advisories. No blind upgrade or `npm audit fix` was run in Phase 2.

| Package | Path | Exposure assessment |
|---|---|---|
| `pdfjs-dist@6.1.200` | direct dependency | Runtime PDF parsing; highest relevance because user files are opened. Upgrade requires compatibility review and PDF fixture testing. |
| `postcss@8.5.16` | Vite/build dependency | Build-time path; not part of browser runtime, but update with Vite compatibility review. |
| `js-yaml@4.3.0` | TanStack/ESLint transitive | Mostly build/tooling path; update through parent packages when stable. |
| `brace-expansion@1.1.16`, `5.0.7` | ESLint/minimatch transitive | Tooling path; update through ESLint/typescript-eslint. |
| `undici@7.28.0` | jsdom test dependency | Test/dev path; not shipped as app runtime. |
| `nanoid@3.3.15` | Vite transitive; direct app uses v5 | Build tooling path; direct ID generation is v5. |

The advisories are primarily DoS/parser/build-chain issues for this private personal app, but `pdfjs-dist` deserves priority because it processes user PDFs. Next security work should update one dependency family at a time, run typecheck/unit/build/E2E and PDF regression fixtures, then review lockfile changes.
