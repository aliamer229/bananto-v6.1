# Plan: Bulk Game Data Import with Shared Configuration

Enable bulk importing of multiple games from a single file, allowing for shared pricing and settings across all products in the batch.

## User Review Required

> [!IMPORTANT]
> - A new syntax `[SHARED]` will be introduced at the top of import files to define values (like price, region, etc.) that apply to ALL games in the file.
> - A new syntax `[[PRODUCT]]` will separate individual games within the same file.
> - The import modal will be updated to handle an array of products and append them to the existing list or update current form state.

## Proposed Changes

### Parser Enhancements

#### [src/lib/gameImportParser.ts]
- Update `parseGameImport` to detect `[SHARED]` and `[[PRODUCT]]` markers.
- Logic:
    1. Extract everything under `[SHARED]` block.
    2. Split the rest of the text by `[[PRODUCT]]`.
    3. For each product block, parse its specific key-value pairs.
    4. Merge the shared values into each product's data object (product values override shared ones).
    5. Return an array of product data objects.

### UI Enhancements

#### [src/components/admin/AdminImportModal.tsx] & [src/components/admin/ProductImportModal.tsx]
- Update `onImport` signature or handling to accept an array of products.
- Update preview table to show a list of products (perhaps a summary count if many).
- Add a "Merge & Import All" button.

#### [src/components/AdminProductEditor.tsx]
- Update the import callback to handle multiple products.
- If multiple products are imported, it should probably add them to a "bulk upload queue" or just trigger multiple saves if that's the desired flow.
- *Wait*: Usually, this editor is for *one* product. I will add logic to the import modal to allow selecting *which* product to edit if many are found, or better, implement a "Batch Import" mode that can create multiple product entries.

## Technical Details

- **Bulk Syntax Example**:
```text
[SHARED]
price=25000
region=US
platform=switch

[[PRODUCT]]
name=Mario Odyssey
slug=mario-odyssey

[[PRODUCT]]
name=Zelda BotW
slug=zelda-botw
```
- **Parsing**: `rawText.split('[[PRODUCT]]')` followed by a mapping function that merges the `[SHARED]` dictionary.
- **Form State**: Since the `AdminProductEditor` is designed for a single product, I will modify it so that if a bulk file is uploaded, it populates the *current* form with the first product but provides a mechanism (perhaps a "Next" button or a sidebar) to iterate through the others, OR I will update the parent component to handle a list of new products.
- **Simpler Approach**: The user specifically mentioned "import data in one file... shared price... full details". I will make the import logic return an array, and the Editor will iterate/save them.

## Security & Validation
- Standard Zod validation still applies to each merged object.
- Shared values are validated once per batch where possible.
