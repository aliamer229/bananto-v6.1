# Plan to Fix Reported Issues

There are several issues identified across the application, ranging from runtime errors and UI glitches to backend integration problems and data import bugs.

## Identified Issues

1.  **"This page didn't load" Error:** Some users see a global error boundary. This usually indicates a crash during rendering or a failed critical fetch.
2.  **Missing Logo and Background in `/auth`:** The logo and background pattern on the login/signup page are reported missing.
3.  **Telegram Verification Failure:** The verification process via Telegram is currently non-functional despite working previously.
4.  **Nintendo Switch Games Import Data Corruption (`[object Object]`):** Data imported for specific sections (Overview, Extra Overview, Verdict, Series, Requirements) appears as `[object Object]` instead of strings.
5.  **Missing Sources Section:** The "Sources" section for extracted data is not appearing in the Game Hub.

---

## Technical Details

### 1. Global Error Recovery ("This page didn't load")
- **Cause:** Likely a runtime JavaScript error or a failed network request that isn't handled gracefully.
- **Fix:** Improve error reporting to capture the actual error message and stack trace. Check `src/routes/__root.tsx`'s `ErrorComponent` for better debugging.

### 2. Missing Assets in `/auth`
- **Cause:** Incorrect asset paths or broken asset JSON pointers.
- **Files:** `src/routes/auth.tsx`.
- **Fix:** Verify `mascot` and `pattern` imports. Ensure the `.asset.json` files exist and point to valid URLs.

### 3. Telegram Verification Issues
- **Cause:** The Mini App launch payload validation (HMAC signature) was failing because the WebCrypto API required the "verify" usage, but only "sign" was provided.
- **File:** `src/lib/telegram.server.ts`.
- **Fix:** Update `verifyTelegramInitData` to include `['sign', 'verify']` in `crypto.subtle.importKey`. (Note: This seems to have been addressed in code, but needs verification against the reported "it used to work").

### 4. Data Import Bug (`[object Object]`)
- **Cause:** The `getTextValue` helper in `src/lib/utils.ts` and `src/lib/hub.ts` might be returning the whole object instead of the string value when parsing complex structures like `fitFor`, `notFitFor`, `features`, `verdictPros`, `verdictCons`, `seriesEntries`, and `setupNeeds`.
- **Files:** `src/lib/gameImportParser.ts`, `src/lib/utils.ts`, `src/lib/hub.ts`, `src/hub/data/fromProduct.ts`.
- **Fix:** Enhance `getTextValue` to properly extract string values from nested objects. Update the import parser to ensure it stores strings where strings are expected.

### 5. Missing Sources
- **Cause:** The `GameHub` component and its data mapper `fromProduct.ts` might not be correctly identifying or passing the `sources` array.
- **Files:** `src/hub/data/fromProduct.ts`, `src/hub/gamehub/Nintendo.tsx`.
- **Fix:** Ensure `dataSources` is correctly mapped from the product record to the hub game model.

---

## Steps to Execute

### Phase 1: Fixing the Import Bug and [object Object] Issues
- Update `getTextValue` in `src/lib/utils.ts` and `src/lib/hub.ts` to be more robust.
- Adjust `fromProduct.ts` mappers for `overview`, `features`, `verdict`, `series`, and `setup` to handle both string and object inputs safely.

### Phase 2: Restoring Auth Assets
- Inspect `src/routes/auth.tsx` and ensure the background and logo URLs are correct.
- Verify the existence of `src/assets/login_bg.webp.asset.json` and `src/assets/bananto_logo.webp.asset.json`.

### Phase 3: Telegram Verification
- Re-check the `verifyTelegramInitData` implementation in `src/lib/telegram.server.ts`.
- Ensure the webhook in `src/routes/api/public/telegram/webhook.ts` is correctly handling the `/start` token.

### Phase 4: Enabling Sources
- Verify `sources` mapping in `fromProduct.ts`.
- Ensure the `SourcesSection` in `GameHub` has the necessary data to render.

### Phase 5: Error Reporting
- Add more context to the `ErrorComponent` in `src/routes/__root.tsx` to help diagnose why the page fails to load for some users.
