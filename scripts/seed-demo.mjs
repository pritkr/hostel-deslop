import Database from "better-sqlite3";
import fs from "node:fs"; import path from "node:path";

const BASE = "http://localhost:3000";

const users = [
  { name: "Aashish Kumar", email: "student@gec.edu", password: "student123", rollNo: "23-CSE-042", dept: "CSE", year: 3, phone: "9876543210", hostelId: "BH1", roomId: "BH1-204", role: "student", image: null },
  { name: "Gaurav", email: "gaurav@gec.edu", password: "staff12345", rollNo: "STAFF-G", dept: "Electrician", year: 1, phone: "9876500002", hostelId: "BH1", roomId: null, role: "staff", image: null },
  { name: "Kanhaiya", email: "kanhaiya@gec.edu", password: "staff12345", rollNo: "STAFF-K", dept: "Caretaker", year: 1, phone: "9876500001", hostelId: "BH1", roomId: null, role: "staff", image: null },
  { name: "Kamal Kant", email: "kamal@gec.edu", password: "warden12345", rollNo: "W-KK", dept: "Warden", year: 1, phone: "9876500003", hostelId: "BH1", roomId: null, role: "warden", image: "/people/kamal-kant.jpg" },
  { name: "Zaki Sujeet", email: "zaki@gec.edu", password: "warden12345", rollNo: "W-ZS", dept: "Warden", year: 1, phone: "9876500004", hostelId: "BH2", roomId: null, role: "warden", image: "/people/zaki-sujeet.jpg" },
  { name: "Chitranjan", email: "chitranjan@gec.edu", password: "admin12345", rollNo: "CW-01", dept: "Chief Warden", year: 1, phone: "9876500005", hostelId: "BH1", roomId: null, role: "admin", image: "/people/chitranjan.jpg" },
];

for (const u of users) {
  const r = await fetch(`${BASE}/api/auth/sign-up/email`, { method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name: u.name, email: u.email, password: u.password, rollNo: u.rollNo, dept: u.dept, year: u.year, phone: u.phone, hostelId: u.hostelId, roomId: u.roomId }) });

  console.log("signup", u.email, r.status);
}

// Promote roles + attach portraits. Signup cannot set role (admin plugin guards it).
const base = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";

for (const f of fs.readdirSync(base)) {
  if (!f.endsWith(".sqlite")) continue;
  const db = new Database(path.join(base, f));

  try {
    const has = db.prepare("SELECT count(*) c FROM user WHERE email = ?").get("student@gec.edu");

    if (!has || !has.c) { db.close(); continue; }

    const up = db.prepare("UPDATE user SET role=?, hostelId=?, roomId=COALESCE(roomId,?), phone=COALESCE(phone,?), dept=COALESCE(dept,?), image=COALESCE(image,?), updatedAt=? WHERE email=?");

    for (const u of users) up.run(u.role, u.hostelId, u.roomId, u.phone, u.dept, u.image, Date.now(), u.email);
    console.log("promoted in", f.slice(0, 8));
    console.log(db.prepare("SELECT email, role, hostelId, roomId, image FROM user ORDER BY role").all());
  } catch (e) { console.log("skip", f.slice(0,8), String(e).slice(0,60)); }

  db.close();
}
