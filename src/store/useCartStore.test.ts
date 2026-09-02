import { beforeEach, describe, expect, it } from "vitest";

import { lineKey, useCartStore } from "./useCartStore";

describe("cart line identity", () => {
  beforeEach(() => {
    useCartStore.setState({ lines: [] });
  });

  it("keeps different offers for the same product as separate lines", () => {
    const add = useCartStore.getState().add;
    add({ productId: "game-1", title: "Game", price: 10, optionId: "offline" });
    add({ productId: "game-1", title: "Game", price: 12, optionId: "online" });

    expect(useCartStore.getState().lines).toHaveLength(2);
    expect(useCartStore.getState().lines.map(lineKey)).toEqual([
      "game-1::::offline::::",
      "game-1::::online::::",
    ]);
  });

  it("supports both the legacy quantity argument and an inline quantity", () => {
    const add = useCartStore.getState().add;
    add({ productId: "game-1", title: "Game", price: 10 }, 2);
    add({ productId: "game-1", title: "Game", price: 10, quantity: 3 });

    expect(useCartStore.getState().lines[0]?.quantity).toBe(5);
  });

  it("updates and removes only the selected combination", () => {
    const { add } = useCartStore.getState();
    add({ productId: "game-1", title: "Game", price: 10, optionId: "offline" });
    add({ productId: "game-1", title: "Game", price: 12, optionId: "online" });

    useCartStore.getState().setQuantity("game-1", 4, undefined, "online");
    useCartStore.getState().remove("game-1", undefined, "offline");

    expect(useCartStore.getState().lines).toEqual([
      expect.objectContaining({ optionId: "online", quantity: 4 }),
    ]);
  });
});
