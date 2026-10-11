import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { isStaffRole } from "#/lib/auth-fields";

export const Route = createFileRoute("/api/photos/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        // A photo is private to the reporter and authorised staff — the same
        // rule getComplaint applies before it hands out photo URLs. Hiding the
        // <img> in the UI is not access control: the URL alone would otherwise
        // serve any resident's room photo to anyone who guesses the id.
        const { getSession } = await import("#/lib/auth-functions");
        const session = await getSession();

        if (!session) return new Response("Unauthorized", { status: 401 });

        const { getServerEnv } = await import("#/lib/server-env");
        const { getDb } = await import("#/db/index");
        const env = await getServerEnv();
        const db = await getDb(env);
        const s = await import("#/db/schema");

        const rows = await db
          .select()
          .from(s.complaintPhotos)
          .where(eq(s.complaintPhotos.id, id))
          .limit(1);

        const ph = rows[0];

        if (!ph) return new Response("Not found", { status: 404 });

        const owners = await db
          .select()
          .from(s.complaints)
          .where(eq(s.complaints.id, ph.complaintId))
          .limit(1);

        const complaint = owners[0];

        if (!complaint) return new Response("Not found", { status: 404 });

        // Same visibility rule as getComplaint: the reporter and staff see
        // photos, except that a confidential report narrows staff to the wardens
        // of that hostel, the admin, and whoever already holds the job.
        const viewer = session.user;
        const isReporter = complaint.studentId === viewer.id;
        const isAdmin = viewer.role === "admin";

        const isHostelWarden =
          viewer.role === "warden" && complaint.hostelId === viewer.hostelId;

        const isAssignee = complaint.assigneeId === viewer.id;
        const isStaff = isStaffRole(viewer.role);

        const maySee = complaint.confidential
          ? isReporter || isAdmin || isHostelWarden || isAssignee
          : isReporter || isStaff;

        if (!maySee) return new Response("Forbidden", { status: 403 });

        const bucket = env.PHOTOS ?? null;

        if (bucket) {
          const obj = await bucket.get(ph.r2Key);

          if (!obj) return new Response("Not found", { status: 404 });

          return new Response(obj.body, {
            headers: {
              "Content-Type":
                obj.httpMetadata?.contentType ?? ph.mimeType ?? "image/jpeg",
              "Cache-Control": "private, max-age=3600",
            },
          });
        }

        try {
          const fs = await import("node:fs");
          const path = await import("node:path");

          const file = path.join(
            process.cwd(),
            ".data",
            "uploads",
            ph.r2Key.replace(/\//g, "_"),
          );

          const buf = fs.readFileSync(file);

          return new Response(new Uint8Array(buf), {
            headers: {
              "Content-Type": ph.mimeType ?? "image/jpeg",
              "Cache-Control": "private, max-age=3600",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
