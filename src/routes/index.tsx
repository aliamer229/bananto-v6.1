import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";

import AppShell from "@/components/AppShell";
import HomeView from "@/components/HomeView";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "بنانا ستور — ألعاب وحسابات ننتندو سويتش" },
      {
        name: "description",
        content:
          "متجر بنانا لألعاب وحسابات ننتندو سويتش والأجهزة والملحقات، مع تسليم فوري للحسابات ودعم مباشر عبر المحادثة.",
      },
      { property: "og:title", content: "بنانا ستور — ألعاب وحسابات ننتندو سويتش" },
      {
        property: "og:description",
        content:
          "متجر بنانا لألعاب وحسابات ننتندو سويتش والأجهزة والملحقات، مع تسليم فوري للحسابات ودعم مباشر عبر المحادثة.",
      },
    ],
  }),
  component: HomePage,
});

export function HomePage() {
  const navigate = useNavigate();

  useEffect(() => {
    // We removed the auto-trigger on every home page visit to focus on
    // the extraction triggered from the admin dashboard or this specific session.
    // The user wants the extraction to happen "inside the prompt" logic.
  }, []);

  return (
    <AppShell currentView="home">
      <HomeView
        onGameClick={(game: { id?: string | number }) => {
          if (game?.id !== undefined) {
            void navigate({ to: "/product/$productId", params: { productId: String(game.id) } });
          }
        }}
      />
    </AppShell>
  );
}
