import { createFileRoute } from "@tanstack/react-router";
import { admin } from "@/lib/push.server";
import { appError, linkedinConfig, randomToken, redirect, safeReturn } from "@/lib/linkedin.server";

export const Route = createFileRoute("/api/public/auth/linkedin/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ret = safeReturn(url.searchParams.get("return"));
        const cfg = linkedinConfig();
        if (!cfg) return appError("config", ret);
        const state = randomToken();
        const nonce = randomToken();
        const db = await admin();
        const { error } = await db.from("oauth_states").insert({ state, nonce, return_path: ret });
        if (error) return appError("failed", ret);
        const auth = new URL("https://www.linkedin.com/oauth/v2/authorization");
        auth.searchParams.set("response_type", "code");
        auth.searchParams.set("client_id", cfg.clientId);
        auth.searchParams.set("redirect_uri", cfg.redirectUri);
        auth.searchParams.set("state", state);
        auth.searchParams.set("nonce", nonce);
        auth.searchParams.set("scope", "openid profile email");
        return redirect(auth.toString());
      },
    },
  },
});
