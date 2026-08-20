# Plan: Switch Box 3D Visibility and Animation Control

Adjust the game case rendering logic to prioritize the 3D model and respect the "Reduced Motion" setting.

## User Review Required

> [!IMPORTANT]
>
> - The 3D model will now load immediately by default.
> - The static 2D case will only be shown if "Reduced Motion" is enabled in settings OR if the device doesn't support 3D.

## Proposed Changes

### Logic Refinement

#### [src/hub/gamehub/CaseStage.tsx]

- Update `CaseStage` component to:
  - Check the `bananto_motion` cookie (via `readPrefs` from `src/lib/prefs.ts`).
  - If `motion === 'lite'` (Reduced Motion enabled):
    - Show only the static `GameCase3D` (CSS/Image version).
    - Disable loading of the 3D model.
  - If `motion === 'full'` (default):
    - Hide the static `GameCase3D` entirely (not just opacity 0).
    - Load the `SwitchBox3D` (3D model) immediately without the previous delays (`requestIdleCallback`/`setTimeout`).
  - Ensure a proper loading state or transition if the model takes a moment to initialize.

#### [src/SwitchBox3D.tsx]

- (Optional) Verification of existing opacity settings:
  - Confirm `plastic.opacity` is set to `0.8` (as requested in previous turns and reinforced here).

## Technical Details

- **Motion Detection**: I will use `readPrefs()` from `@/lib/prefs.ts` to get the current motion setting.
- **Immediate Loading**: Remove the `enable3D` state deferral logic in `CaseStage.tsx`.
- **Conditional Rendering**: Use a simple ternary or `if` statement to decide which version to mount based on the `motion` preference.

```typescript
const { motion } = readPrefs();
const isReduced = motion === 'lite';

if (isReduced) {
  return <GameCase3D {...props} />;
}

return (
  <Canvas>
    <SwitchBox3D ... />
  </Canvas>
);
```
