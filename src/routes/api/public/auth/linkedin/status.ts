import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/push.server";
import { linkedinConfig } from "@/lib/linkedin.server";

export const Route = createFileRoute("/api/public/auth/linkedin/status")({
  server: {
    handlers: {
      GET: async () => json({ configured: !!linkedinConfig() }),
    },
  },
});
