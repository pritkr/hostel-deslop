import { createFileRoute } from "@tanstack/react-router";

import { getServerEnv } from "#/lib/server-env";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { createAuth } = await import("#/lib/auth");
        const auth = await createAuth(await getServerEnv());

        return await auth.handler(request);
      },
      POST: async ({ request }) => {
        const { createAuth } = await import("#/lib/auth");
        const auth = await createAuth(await getServerEnv());

        return await auth.handler(request);
      },
    },
  },
});

