import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/auth-functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });
    const r = s.user.role;

    if (r === "staff") throw redirect({ to: "/queue" });

    if (r === "warden" || r === "admin") throw redirect({ to: "/attention" });
    throw redirect({ to: "/bulletin" });
  },
});
