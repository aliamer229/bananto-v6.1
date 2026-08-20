---
title: Animated Slideshow Banner for Category Page
description: Replace the static category header with an auto-playing slideshow of game banner images.
---

## User Request
The user wants the top banner on the category page (which currently shows "cat_nintendo" and "Browse latest products") to feature game banner images that rotate automatically.

## Proposed Changes

### Frontend
- **src/routes/category.$categoryId.tsx**
  - Extract all unique banner images from the filtered `products` list.
  - Implement an `AnimatePresence` based slideshow in the header section.
  - Use `useEffect` to cycle through the banners every 5 seconds.
  - Fall back to the current gradient background if no banners are available.
  - Ensure the text ("cat_nintendo", etc.) remains legible over the images using a dark overlay.

## Technical Details
- The current `getCategoryInfo` returns a `bgColor`. We will keep this as a base, but layer the images on top.
- We will collect `p.banner` or `p.bannerImage` from the loaded products.
- Using Framer Motion (`motion/react`) for smooth cross-fade transitions.

## Security Considerations
- No new security risks; all data is fetched from the existing `api.store` endpoint.
