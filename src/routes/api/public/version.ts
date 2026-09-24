import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD } from "@/lib/pwa";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { build: APP_BUILD },
          { headers: { "Cache-Control": "no-store, max-age=0" } },
        ),
    },
  },
});
