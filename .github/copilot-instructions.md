# Copilot instructions

Follow these rules strictly.


## General
- Use English for code and comments
- Dev server runs at http://localhost:5000/ — use it for manual testing


## Naming

- Use PascalCase for classes
- Variables and functions: camelCase (e.g., `renderMoonPhase`, `getCookie`)
- Constants: UPPER_SNAKE_CASE (e.g., `SYNODIC_MONTH`, `MOON_PHASES`)
- DOM elements: camelCase with descriptive suffixes (e.g., `fxPriceEl`, `vfdDisplay`)
- CSS classes: kebab-case (e.g., `moon-icon`, `vfd-display`)


## Style

- Prefer readability over cleverness
- Avoid deeply nested blocks
- Be explicit rather than implicit
- No unnecessary abstractions
- Prefer pure functions
- Prefer arrow functions for callbacks and simple utilities; use traditional functions for methods and when "this" binding matters


## Comments

- Use JSDoc for exported functions
- Avoid obvious comments
- Explain WHY, not WHAT
- Mark added comments with @YYYY-MM-DD (e.g., @2026-02-04)
- Existing comments (possibly edited by the user) must NOT be changed.


## JavaScript

- Prefer `const`, use `let` only when required
- Never use `var`
- Prefer `async/await` over raw promises
- Use early returns to reduce nesting
- Keep functions small and focused


## HTML / CSS

- Semantic tags preferred
- Avoid inline styles
- Keep markup simple and accessible
