import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/auth-functions";

// Legacy route: staff/warden triage board now lives at /queue and /attention.
export const Route = createFileRoute("/warden")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    if (!["warden", "admin", "staff"].includes(s.user.role)) throw redirect({ to: "/bulletin" });

    if (s.user.role === "staff") throw redirect({ to: "/queue" });
    throw redirect({ to: "/attention" });
  },
});
