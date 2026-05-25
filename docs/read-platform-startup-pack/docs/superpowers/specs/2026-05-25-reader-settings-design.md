# Design Doc: Reader Settings Support in ReaderEngine

## Goal
Add support for reader settings (font family, font size, line height, theme) to the `ReaderEngine` to allow the UI to manage user preferences.

## Approach
Add a private `settings` property to `ReaderEngine` with default values and provide `getSettings()` and `updateSettings()` methods.

## Design
### ReaderEngine
- `private settings: ReaderSettings`
- `getSettings(): ReaderSettings`
- `updateSettings(newSettings: Partial<ReaderSettings>): void`

## Verification
- Unit tests in `engine.test.ts` to verify default settings and updates.
