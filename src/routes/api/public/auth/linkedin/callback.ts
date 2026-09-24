import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { admin } from "@/lib/push.server";
import { appError, consumeState, decodeJwtPayload, linkedinConfig, redirect, clearStateCookie, readStateCookie, safeEqual, withCookie } from "@/lib/linkedin.server";

const userinfoSchema = z.object({
  sub: z.string().min(1).max(200),
  name: z.string().max(200).optional(),
  given_name: z.string().max(100).optional(),
  family_name: z.string().max(100).optional(),
  picture: z.string().url().max(2000).optional(),
  email: z.string().email().max(320).optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
});

export const Route = createFileRoute("/api/public/auth/linkedin/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => withCookie(await handle(request), clearStateCookie()),
    },
  },
});

async function handle(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code");
        const err = url.searchParams.get("error");

        const cookieState = readStateCookie(request);
        if (!state || !cookieState || !safeEqual(state, cookieState)) return appError("state");
        const claimed = state.length <= 100 ? await consumeState(state) : null;
        if (claimed && "replay" in claimed) {
          return claimed.replay ? redirect(claimed.replay) : appError("failed", claimed.return_path);
        }
        const st = claimed;
        const ret = st?.return_path ?? "/";
        if (err) return done(appError("cancelled", ret));
        if (!st) return appError("state");
        if (!code || code.length > 2000) return appError("failed", ret);

        const cfg = linkedinConfig();
        if (!cfg) return appError("config", ret);

        // Code gegen Token tauschen (Token wird nicht gespeichert)
        let tokens: { access_token?: string; id_token?: string };
        try {
          const r = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: cfg.redirectUri,
              client_id: cfg.clientId,
              client_secret: cfg.clientSecret,
            }),
          });
          if (!r.ok) {
            console.error("LinkedIn token", r.status, await r.text());
            return appError(r.status >= 500 ? "unreachable" : "failed", ret);
          }
          tokens = await r.json();
        } catch (e) {
          console.error("LinkedIn token fetch", e);
          return appError("unreachable", ret);
        }
        if (!tokens.access_token) return appError("failed", ret);
        if (tokens.id_token) {
          const p = decodeJwtPayload(tokens.id_token);
          if (p && p["nonce"] && p["nonce"] !== st.nonce) return appError("state", ret);
        }

        let info: z.infer<typeof userinfoSchema>;
        try {
          const r = await fetch("https://api.linkedin.com/v2/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (!r.ok) {
            console.error("LinkedIn userinfo", r.status, await r.text());
            return appError(r.status >= 500 ? "unreachable" : "failed", ret);
          }
          const parsed = userinfoSchema.safeParse(await r.json());
          if (!parsed.success) return appError("failed", ret);
          info = parsed.data;
        } catch (e) {
          console.error("LinkedIn userinfo fetch", e);
          return appError("unreachable", ret);
        }

        const verified = info.email_verified === true || info.email_verified === "true";
        if (!info.email || !verified) return appError("noemail", ret);

        const name = (info.name || [info.given_name, info.family_name].filter(Boolean).join(" ") || "").slice(0, 80);
        const db = await admin();

        // 1) über linkedin_sub, 2) per E-Mail, 3) neu anlegen
        let email = info.email.toLowerCase();
        const { data: bySub } = await db.from("profiles").select("id").eq("linkedin_sub", info.sub).maybeSingle();
        if (bySub) {
          const { data: u } = await db.auth.admin.getUserById(bySub.id);
          if (u?.user?.email) email = u.user.email;
        } else {
          const { error: cErr } = await db.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: { full_name: name, provider: "linkedin" },
          });
          if (cErr && !/already|registered|exists/i.test(cErr.message)) {
            console.error("createUser", cErr);
            return appError("failed", ret);
          }
        }

        const { data: link, error: lErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
        if (lErr || !link?.properties?.hashed_token || !link.user) {
          console.error("generateLink", lErr);
          return appError("failed", ret);
        }
        const userId = link.user.id;

        const { data: existing } = await db.from("profiles").select("id, display_name").eq("id", userId).maybeSingle();
        if (existing) {
          await db
            .from("profiles")
            .update({
              linkedin_sub: info.sub,
              avatar_url: info.picture ?? null,
              display_name: existing.display_name || name,
            })
            .eq("id", userId);
        } else {
          await db.from("profiles").insert({
            id: userId,
            linkedin_sub: info.sub,
            display_name: name,
            avatar_url: info.picture ?? null,
          });
        }

        return redirect(`${ret}#li_token=${encodeURIComponent(link.properties.hashed_token)}`);
}
