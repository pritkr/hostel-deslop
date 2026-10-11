import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { Toaster } from "../components/motion";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "GEC Hostel — Repair Bulletin" },
      { name: "description", content: "GEC Sheikhpura hostel repair bulletin — report a fault, track repair, staff shift slate." },
      { name: "theme-color", content: "#0f4c3a" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Toaster wraps the app so any screen can raise a receipt. */}
        <Toaster>
          <div className="min-h-[100dvh] bg-[#efe9d8]">{children}</div>
        </Toaster>
        <Scripts />
      </body>
    </html>
  );
}
