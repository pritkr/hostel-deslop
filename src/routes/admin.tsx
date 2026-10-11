import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/auth-functions";
import { AdminPage as AdminConsole } from "../components/AdminConsole";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const s = await getSession();

    if (!s) throw redirect({ to: "/login" });

    if (s.user.role !== "admin") throw redirect({ to: "/dashboard" });

    return { me: s.user };
  },
  loader: async () => {
    const { adminStats } = await import("../lib/admin-functions");

    return adminStats({ data: {} });
  },
  // The console takes its stats as a prop rather than importing this route
  // back — a component reaching into its own route creates an import cycle
  // that can leave the route unresolved.
  component: AdminConsoleRoute,
});

function AdminConsoleRoute() {
  const stats = Route.useLoaderData();

  return <AdminConsole stats={stats} />;
}
