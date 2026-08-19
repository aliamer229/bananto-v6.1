import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/bundle/$bundleId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/bundles/$bundleId",
      params: { bundleId: params.bundleId },
    });
  },
  component: () => null,
});
