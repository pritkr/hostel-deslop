import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/auth-functions";

// Legacy route: role-aware redirect into the mobile bulletin / shift slate.
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    if (s.user.role === "staff") throw redirect({ to: "/queue" });

    if (s.user.role === "warden" || s.user.role === "admin") throw redirect({ to: "/attention" });
    throw redirect({ to: "/bulletin" });
  },
});
