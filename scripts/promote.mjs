// Usage: npm run promote -- user@email.com warden BH1
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const [email, role = "admin", hostelId = "BH1"] = process.argv.slice(2);

if (!email) {
  console.error("Usage: npm run promote -- email role hostelId");
  process.exit(1);
}

const base = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

let updated = false;

if (fs.existsSync(base)) {
  for (const f of fs.readdirSync(base)) {
    if (!f.endsWith(".sqlite")) continue;
    const db = new Database(path.join(base, f));

    try {
      const row = db
        .prepare("SELECT id, email, role FROM user WHERE email = ?")
        .get(email);

      if (row) {
        db.prepare(
          "UPDATE user SET role = ?, hostelId = ?, updatedAt = ? WHERE email = ?",
        ).run(role, hostelId, Date.now(), email);
        console.log(`Updated ${email} -> ${role} ${hostelId}`);
        updated = true;
      }
    } catch {
      /* not the app db file */
    }

    db.close();
  }
}

if (!updated) {
  console.error("User not found in local D1 state. Sign up first via the UI.");
  process.exit(1);
}
