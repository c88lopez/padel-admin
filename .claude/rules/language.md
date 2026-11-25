# Language

_Applies to: `src/components/**/*.tsx`, `src/routes/**/*.tsx`, `src/lib/**/*.ts`_

- The app is Spanish only. There is no translation layer: write user-facing text directly in Spanish where it's shown.
- Stored values stay in English (roles, stock categories, default space names like "Court 3"); map them to Spanish labels at display time (`roleLabel`, `stockCategoryLabel`, `spaceDisplayName`).
- Surface server errors via `AppError(code, message)` + `errorMessage` rather than raw strings.
- Tests assert the Spanish copy.
