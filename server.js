require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./src/db");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET;
const RESUME_ENCRYPTION_KEY_HEX = process.env.RESUME_ENCRYPTION_KEY || "";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_ORIGIN = process.env.APP_ORIGIN;
const SESSION_COOKIE = "hs_session";
const SESSION_MAX_AGE = 2 * 60 * 60 * 1000;
const privateUploadDir = path.join(__dirname, "private_uploads");

if (!JWT_SECRET || Buffer.byteLength(JWT_SECRET) < 32) {
  console.error("Security configuration error: set JWT_SECRET in .env to a random value of at least 32 bytes.");
  process.exit(1);
}
if (!/^[a-fA-F0-9]{64}$/.test(RESUME_ENCRYPTION_KEY_HEX)) {
  console.error("Security configuration error: set RESUME_ENCRYPTION_KEY in .env to a separate 64-character hexadecimal key.");
  process.exit(1);
}
const RESUME_ENCRYPTION_KEY = Buffer.from(RESUME_ENCRYPTION_KEY_HEX, "hex");
if (IS_PRODUCTION && (!APP_ORIGIN || !APP_ORIGIN.startsWith("https://") || process.env.DB_SSL !== "true")) {
  console.error("Production configuration error: set APP_ORIGIN to your exact HTTPS origin and DB_SSL=true.");
  process.exit(1);
}
fs.mkdirSync(privateUploadDir, { recursive: true });

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "same-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null
    }
  }
}));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

// The browser app and API are same-origin. Reject cross-origin state changes.
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    const expectedOrigin = APP_ORIGIN || `${req.protocol}://${req.get("host")}`;
    if (!origin || origin !== expectedOrigin || req.get("x-requested-with") !== "XMLHttpRequest") {
      return res.status(403).json({ message: "Request origin could not be verified. Refresh the page and try again." });
    }
  }
  next();
});

app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 180, standardHeaders: "draft-7", legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "public"), { dotfiles: "deny", index: "index.html" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Please wait 15 minutes and try again." } });
// A practical classroom-demo limit: protects the endpoint without blocking a small
// team from testing candidate and employer accounts on the same campus network.
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "The registration limit for this network has been reached. Please wait before trying again." } });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false,
  message: { message: "Too many resume uploads. Please wait before trying again." } });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb([".pdf", ".doc", ".docx"].includes(ext) ? null : new Error("Only PDF, DOC and DOCX files are allowed."), [".pdf", ".doc", ".docx"].includes(ext));
  }
});

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "strict",
    maxAge: SESSION_MAX_AGE,
    path: "/"
  });
}
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: IS_PRODUCTION, sameSite: "strict", path: "/" });
}
function getSafeUploadExtension(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const b = file.buffer;
  const isPdf = ext === ".pdf" && b.subarray(0, 5).toString() === "%PDF-";
  const isDoc = ext === ".doc" && b.subarray(0, 8).equals(Buffer.from([0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1]));
  const isDocx = ext === ".docx" && b.length >= 4 && b.subarray(0, 4).equals(Buffer.from([0x50,0x4B,0x03,0x04]));
  return isPdf || isDoc || isDocx ? ext : null;
}
async function sendPrivateResume(res, storedName) {
  const safeName = path.basename(storedName || "");
  if (!safeName || safeName !== storedName) return res.status(404).json({ message: "Resume not found." });
  const fullPath = path.join(privateUploadDir, safeName);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "Resume file is no longer available." });
  try {
    const stored = await fs.promises.readFile(fullPath);
    if (stored.length < 32 || stored.subarray(0, 4).toString("ascii") !== "HSR1") {
      return res.status(500).json({ message: "The stored resume cannot be decrypted. Contact the platform administrator." });
    }
    const iv = stored.subarray(4, 16);
    const tag = stored.subarray(16, 32);
    const ciphertext = stored.subarray(32);
    const decipher = crypto.createDecipheriv("aes-256-gcm", RESUME_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="HireSphere_Resume${path.extname(safeName)}"`);
    return res.end(plaintext);
  } catch (error) {
    console.error("Resume decryption failed:", error.message);
    return res.status(500).json({ message: "The resume could not be opened. Verify the server encryption key." });
  }
}

function signToken(user) {
  return jwt.sign({ user_id: user.user_id, role: user.role }, JWT_SECRET, { expiresIn: "2h", issuer: "hiresphere", audience: "hiresphere-users" });
}
function auth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ message: "Please log in first." });
  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET, { issuer: "hiresphere", audience: "hiresphere-users" });
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
  pool.execute("SELECT role,is_active FROM users WHERE user_id=?", [claims.user_id])
    .then(([rows]) => {
      if (!rows.length || !rows[0].is_active || rows[0].role !== claims.role) {
        clearSessionCookie(res);
        return res.status(401).json({ message: "This account is inactive or its permissions changed. Please log in again." });
      }
      req.user = { ...claims, role: rows[0].role };
      next();
    })
    .catch(next);
}

function allow(...roles) {
  return (req, res, next) => roles.includes(req.user.role)
    ? next() : res.status(403).json({ message: "You do not have permission for this action." });
}
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get("/api/health", asyncRoute(async (_, res) => {
  await pool.query("SELECT 1 AS database_connected");
  res.json({ status: "ok", service: "HireSphere API", database: "connected" });
}));

app.post("/api/auth/register", registerLimiter, asyncRoute(async (req, res) => {
  const { full_name, email, password, role = "seeker", company_name } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ message: "Name, email and password are required." });
  if (req.body.privacy_consent !== "on") return res.status(400).json({ message: "Please read and accept the privacy notice to create an account." });
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ message: "Use a password between 12 and 72 UTF-8 bytes." });
  if (typeof full_name !== "string" || full_name.trim().length < 2 || full_name.trim().length > 100) return res.status(400).json({ message: "Enter a name between 2 and 100 characters." });
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ message: "Enter a valid email address." });
  if (!["seeker", "employer"].includes(role)) return res.status(400).json({ message: "Choose seeker or employer registration." });
  if (role === "employer" && (typeof company_name !== "string" || company_name.trim().length < 2 || company_name.trim().length > 150)) return res.status(400).json({ message: "Enter a company name between 2 and 150 characters." });
  const hash = await bcrypt.hash(password, 12);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      "INSERT INTO users(full_name,email,password_hash,role,privacy_consent_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)",
      [full_name.trim(), email.toLowerCase().trim(), hash, role]
    );
    if (role === "seeker") await conn.execute("INSERT INTO job_seekers(seeker_id) VALUES(?)", [result.insertId]);
    else await conn.execute("INSERT INTO employers(employer_id,company_name) VALUES(?,?)", [result.insertId, (company_name || full_name).trim()]);
    await conn.commit();
    const user = { user_id: result.insertId, full_name: full_name.trim(), email: email.toLowerCase().trim(), role };
    setSessionCookie(res, signToken(user));
    res.status(201).json({ message: "Account created successfully.", user });
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}));

app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string" || email.length > 254 || password.length > 256) return res.status(401).json({ message: "Incorrect email or password." });
  const [rows] = await pool.execute("SELECT * FROM users WHERE email=? AND is_active=1", [(email || "").toLowerCase().trim()]);
  if (!rows.length || !(await bcrypt.compare(password || "", rows[0].password_hash)))
    return res.status(401).json({ message: "Incorrect email or password." });
  const u = rows[0];
  const user = { user_id: u.user_id, full_name: u.full_name, email: u.email, role: u.role };
  setSessionCookie(res, signToken(user));
  res.json({ message: "Welcome back.", user });
}));

app.post("/api/auth/logout", (req, res) => { clearSessionCookie(res); res.json({ message: "You have logged out." }); });

app.get("/api/me", auth, asyncRoute(async (req, res) => {
  const [rows] = await pool.execute("SELECT user_id,full_name,email,role,created_at FROM users WHERE user_id=?", [req.user.user_id]);
  if (!rows.length) return res.status(404).json({ message: "User not found." });
  let profile = {};
  if (req.user.role === "seeker") {
    const [p] = await pool.execute("SELECT * FROM job_seekers WHERE seeker_id=?", [req.user.user_id]);
    profile = p[0] || {};
    profile = { ...profile, resume_available: Boolean(profile.resume_path) };
    delete profile.resume_path;
  } else if (req.user.role === "employer") {
    const [p] = await pool.execute("SELECT * FROM employers WHERE employer_id=?", [req.user.user_id]);
    profile = p[0] || {};
  }
  res.json({ user: rows[0], profile });
}));

app.put("/api/profile", auth, asyncRoute(async (req, res) => {
  const id = req.user.user_id;
  if (req.user.role === "seeker") {
    const { phone, location, headline, experience_years, bio } = req.body;
    await pool.execute(
      `UPDATE job_seekers SET phone=?,location=?,headline=?,experience_years=?,bio=? WHERE seeker_id=?`,
      [phone || null, location || null, headline || null, Number(experience_years || 0), bio || null, id]
    );
  } else if (req.user.role === "employer") {
    const { company_name, industry, location, website, description } = req.body;
    await pool.execute(
      `UPDATE employers SET company_name=?,industry=?,location=?,website=?,description=? WHERE employer_id=?`,
      [company_name, industry || null, location || null, website || null, description || null, id]
    );
  }
  res.json({ message: "Profile updated." });
}));

app.post("/api/profile/resume", auth, allow("seeker"), uploadLimiter, upload.single("resume"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Choose a PDF, DOC or DOCX file." });
  const extension = getSafeUploadExtension(req.file);
  if (!extension) return res.status(400).json({ message: "The file content does not match its extension. Upload a valid PDF, DOC or DOCX file." });
  const storedName = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(privateUploadDir, storedName);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", RESUME_ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(req.file.buffer), cipher.final()]);
  const encryptedFile = Buffer.concat([Buffer.from("HSR1"), iv, cipher.getAuthTag(), ciphertext]);
  await fs.promises.writeFile(fullPath, encryptedFile, { flag: "wx", mode: 0o600 });
  try {
    const [oldRows] = await pool.execute("SELECT resume_path FROM job_seekers WHERE seeker_id=?", [req.user.user_id]);
    await pool.execute("UPDATE job_seekers SET resume_path=? WHERE seeker_id=?", [storedName, req.user.user_id]);
    const oldName = oldRows[0]?.resume_path;
    if (oldName && path.basename(oldName) === oldName) {
      const [references] = await pool.execute("SELECT COUNT(*) AS total FROM applications WHERE resume_path=?", [oldName]);
      if (Number(references[0]?.total || 0) === 0) await fs.promises.unlink(path.join(privateUploadDir, oldName)).catch(() => {});
    }
  } catch (error) {
    await fs.promises.unlink(fullPath).catch(() => {});
    throw error;
  }
  res.json({ message: "Resume uploaded securely." });
}));

app.get("/api/profile/resume", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute("SELECT resume_path FROM job_seekers WHERE seeker_id=?", [req.user.user_id]);
  if (!rows[0]?.resume_path) return res.status(404).json({ message: "No resume has been uploaded." });
  return sendPrivateResume(res, rows[0].resume_path);
}));

app.get("/api/applications/:id/resume", auth, allow("employer", "admin"), asyncRoute(async (req, res) => {
  let sql = `SELECT a.resume_path FROM applications a JOIN jobs j ON j.job_id=a.job_id WHERE a.application_id=?`;
  const params = [req.params.id];
  if (req.user.role === "employer") { sql += " AND j.employer_id=?"; params.push(req.user.user_id); }
  const [rows] = await pool.execute(sql, params);
  if (!rows.length || !rows[0].resume_path) return res.status(404).json({ message: "Resume not found or you do not have permission to access it." });
  return sendPrivateResume(res, rows[0].resume_path);
}));

app.get("/api/categories", asyncRoute(async (_, res) => {
  const [rows] = await pool.execute("SELECT * FROM job_categories ORDER BY category_name");
  res.json(rows);
}));

app.get("/api/skills", asyncRoute(async (_, res) => {
  const [rows] = await pool.execute("SELECT * FROM skills ORDER BY skill_name");
  res.json(rows);
}));

// Qualification catalogue and candidate-owned qualification records.
app.get("/api/qualifications", asyncRoute(async (_, res) => {
  const [rows] = await pool.execute("SELECT qualification_id,qualification_name FROM qualifications ORDER BY qualification_name");
  res.json(rows);
}));

app.get("/api/my-qualifications", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT sq.qualification_id,q.qualification_name,sq.institution,
            sq.passing_year,sq.percentage
     FROM seeker_qualifications sq
     JOIN qualifications q ON q.qualification_id=sq.qualification_id
     WHERE sq.seeker_id=? ORDER BY sq.passing_year DESC,q.qualification_name`,
    [req.user.user_id]
  );
  res.json(rows);
}));

app.post("/api/my-qualifications", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const qualification_id = Number(req.body.qualification_id);
  const institution = typeof req.body.institution === "string" ? req.body.institution.trim() : "";
  const passing_year = req.body.passing_year ? Number(req.body.passing_year) : null;
  const percentage = req.body.percentage === "" || req.body.percentage == null ? null : Number(req.body.percentage);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(qualification_id) || qualification_id < 1) return res.status(400).json({ message: "Choose a valid qualification." });
  if (institution.length < 2 || institution.length > 150) return res.status(400).json({ message: "Enter an institution name between 2 and 150 characters." });
  if (passing_year !== null && (!Number.isInteger(passing_year) || passing_year < 1950 || passing_year > currentYear + 8)) return res.status(400).json({ message: "Enter a valid passing year." });
  if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) return res.status(400).json({ message: "Percentage must be between 0 and 100." });
  await pool.execute(
    "INSERT INTO seeker_qualifications(seeker_id,qualification_id,institution,passing_year,percentage) VALUES(?,?,?,?,?)",
    [req.user.user_id, qualification_id, institution, passing_year, percentage]
  );
  res.status(201).json({ message: "Qualification added successfully." });
}));

app.put("/api/my-qualifications/:qualification_id", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const qualification_id = Number(req.params.qualification_id);
  const oldInstitution = typeof req.body.old_institution === "string" ? req.body.old_institution.trim() : "";
  const institution = typeof req.body.institution === "string" ? req.body.institution.trim() : "";
  const passing_year = req.body.passing_year ? Number(req.body.passing_year) : null;
  const percentage = req.body.percentage === "" || req.body.percentage == null ? null : Number(req.body.percentage);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(qualification_id) || !oldInstitution || institution.length < 2 || institution.length > 150) return res.status(400).json({ message: "Enter valid qualification details." });
  if (passing_year !== null && (!Number.isInteger(passing_year) || passing_year < 1950 || passing_year > currentYear + 8)) return res.status(400).json({ message: "Enter a valid passing year." });
  if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) return res.status(400).json({ message: "Percentage must be between 0 and 100." });
  const [result] = await pool.execute(
    `UPDATE seeker_qualifications SET institution=?,passing_year=?,percentage=?
     WHERE seeker_id=? AND qualification_id=? AND institution=?`,
    [institution, passing_year, percentage, req.user.user_id, qualification_id, oldInstitution]
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Qualification record not found." });
  res.json({ message: "Qualification updated successfully." });
}));

app.delete("/api/my-qualifications/:qualification_id", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const qualification_id = Number(req.params.qualification_id);
  const institution = typeof req.body.institution === "string" ? req.body.institution.trim() : "";
  if (!Number.isInteger(qualification_id) || !institution) return res.status(400).json({ message: "Qualification details are required." });
  const [result] = await pool.execute(
    "DELETE FROM seeker_qualifications WHERE seeker_id=? AND qualification_id=? AND institution=?",
    [req.user.user_id, qualification_id, institution]
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Qualification record not found." });
  res.json({ message: "Qualification removed successfully." });
}));

app.get("/api/applications/:id/qualifications", auth, allow("employer", "admin"), asyncRoute(async (req, res) => {
  let ownershipSql = "SELECT a.seeker_id FROM applications a JOIN jobs j ON j.job_id=a.job_id WHERE a.application_id=?";
  const params = [req.params.id];
  if (req.user.role === "employer") { ownershipSql += " AND j.employer_id=?"; params.push(req.user.user_id); }
  const [owned] = await pool.execute(ownershipSql, params);
  if (!owned.length) return res.status(404).json({ message: "Application not found or access is not permitted." });
  const [rows] = await pool.execute(
    `SELECT q.qualification_name,sq.institution,sq.passing_year,sq.percentage
     FROM seeker_qualifications sq JOIN qualifications q ON q.qualification_id=sq.qualification_id
     WHERE sq.seeker_id=? ORDER BY sq.passing_year DESC,q.qualification_name`,
    [owned[0].seeker_id]
  );
  res.json(rows);
}));

app.get("/api/jobs", asyncRoute(async (req, res) => {
  const { q = "", location = "", work_mode = "", employment_type = "", category_id = "" } = req.query;
  let sql = `SELECT j.*, e.company_name, e.location AS company_location, c.category_name,
    (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.job_id) AS applicant_count
    FROM jobs j JOIN employers e ON e.employer_id=j.employer_id
    LEFT JOIN job_categories c ON c.category_id=j.category_id WHERE j.status='Open'`;
  const params = [];
  if (q) { sql += " AND (j.title LIKE ? OR j.description LIKE ? OR e.company_name LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
  if (location) { sql += " AND j.location LIKE ?"; params.push(`%${location}%`); }
  if (work_mode) { sql += " AND j.work_mode=?"; params.push(work_mode); }
  if (employment_type) { sql += " AND j.employment_type=?"; params.push(employment_type); }
  if (category_id) { sql += " AND j.category_id=?"; params.push(category_id); }
  sql += " ORDER BY j.created_at DESC";
  const [rows] = await pool.execute(sql, params);
  res.json(rows);
}));

app.get("/api/jobs/:id", asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT j.*,e.company_name,e.industry,e.website,e.description AS company_description,c.category_name
     FROM jobs j JOIN employers e ON e.employer_id=j.employer_id
     LEFT JOIN job_categories c ON c.category_id=j.category_id WHERE j.job_id=?`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: "Job not found." });
  res.json(rows[0]);
}));

app.get("/api/employer/jobs", auth, allow("employer"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT j.*, c.category_name,
      (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.job_id) AS applicant_count
     FROM jobs j LEFT JOIN job_categories c ON c.category_id=j.category_id
     WHERE j.employer_id=? ORDER BY j.created_at DESC`,
    [req.user.user_id]
  );
  res.json(rows);
}));

app.post("/api/jobs", auth, allow("employer"), asyncRoute(async (req, res) => {
  const { category_id, title, description, requirements, location, work_mode, employment_type, min_salary, max_salary, experience_level, deadline } = req.body;
  if (!title || !description) return res.status(400).json({ message: "Job title and description are required." });
  const [r] = await pool.execute(
    `INSERT INTO jobs(employer_id,category_id,title,description,requirements,location,work_mode,employment_type,min_salary,max_salary,experience_level,deadline)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.user_id, category_id || null, title, description, requirements || null, location || null, work_mode || "On-site", employment_type || "Full-time", min_salary || null, max_salary || null, experience_level || "Fresher", deadline || null]
  );
  res.status(201).json({ message: "Job published.", job_id: r.insertId });
}));

app.put("/api/jobs/:id", auth, allow("employer"), asyncRoute(async (req, res) => {
  const [owned] = await pool.execute("SELECT job_id FROM jobs WHERE job_id=? AND employer_id=?", [req.params.id, req.user.user_id]);
  if (!owned.length) return res.status(404).json({ message: "Job not found." });
  const fields = ["category_id","title","description","requirements","location","work_mode","employment_type","min_salary","max_salary","experience_level","deadline","status"];
  const sets = [], vals = [];
  for (const f of fields) if (req.body[f] !== undefined) { sets.push(`${f}=?`); vals.push(req.body[f] === "" ? null : req.body[f]); }
  if (!sets.length) return res.json({ message: "Nothing to update." });
  vals.push(req.params.id, req.user.user_id);
  await pool.execute(`UPDATE jobs SET ${sets.join(",")} WHERE job_id=? AND employer_id=?`, vals);
  res.json({ message: "Job updated." });
}));

app.delete("/api/jobs/:id", auth, allow("employer","admin"), asyncRoute(async (req, res) => {
  const sql = req.user.role === "admin" ? "DELETE FROM jobs WHERE job_id=?" : "DELETE FROM jobs WHERE job_id=? AND employer_id=?";
  const params = req.user.role === "admin" ? [req.params.id] : [req.params.id, req.user.user_id];
  const [r] = await pool.execute(sql, params);
  if (!r.affectedRows) return res.status(404).json({ message: "Job not found or not owned by you." });
  res.json({ message: "Job deleted." });
}));

app.post("/api/jobs/:id/apply", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const { cover_letter = "" } = req.body;
  const [profile] = await pool.execute("SELECT resume_path FROM job_seekers WHERE seeker_id=?", [req.user.user_id]);
  const [r] = await pool.execute(
    "INSERT INTO applications(seeker_id,job_id,cover_letter,resume_path) VALUES(?,?,?,?)",
    [req.user.user_id, req.params.id, cover_letter, profile[0]?.resume_path || null]
  );
  res.status(201).json({ message: "Application submitted.", application_id: r.insertId });
}));

app.get("/api/my-applications", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT a.application_id,a.job_id,a.cover_letter,a.status,a.applied_at,a.updated_at,j.title,j.location,j.work_mode,e.company_name
     FROM applications a JOIN jobs j ON j.job_id=a.job_id
     JOIN employers e ON e.employer_id=j.employer_id
     WHERE a.seeker_id=? ORDER BY a.applied_at DESC`, [req.user.user_id]
  );
  res.json(rows);
}));

app.get("/api/employer/applications", auth, allow("employer"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT a.application_id,a.job_id,a.cover_letter,a.status,a.applied_at,a.updated_at,(a.resume_path IS NOT NULL) AS resume_available,u.full_name,u.email,s.location AS seeker_location,s.experience_years,s.headline,j.title
     FROM applications a JOIN jobs j ON j.job_id=a.job_id
     JOIN users u ON u.user_id=a.seeker_id
     LEFT JOIN job_seekers s ON s.seeker_id=a.seeker_id
     WHERE j.employer_id=? ORDER BY a.applied_at DESC`, [req.user.user_id]
  );
  res.json(rows);
}));

app.patch("/api/applications/:id/status", auth, allow("employer","admin"), asyncRoute(async (req, res) => {
  const allowed = ["Under Review","Shortlisted","Interview","Selected","Rejected"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid application status." });
  let sql = `UPDATE applications a JOIN jobs j ON j.job_id=a.job_id SET a.status=? WHERE a.application_id=?`;
  const params = [req.body.status, req.params.id];
  if (req.user.role === "employer") { sql += " AND j.employer_id=?"; params.push(req.user.user_id); }
  const [r] = await pool.execute(sql, params);
  if (!r.affectedRows) return res.status(404).json({ message: "Application not found." });
  res.json({ message: "Application status updated." });
}));

app.post("/api/applications/:id/interviews", auth, allow("employer"), asyncRoute(async (req, res) => {
  const { scheduled_at, mode = "Online", meeting_link = "", location = "", notes = "" } = req.body;
  if (!scheduled_at) return res.status(400).json({ message: "Interview date and time are required." });
  const [owned] = await pool.execute(
    `SELECT a.application_id FROM applications a JOIN jobs j ON j.job_id=a.job_id
     WHERE a.application_id=? AND j.employer_id=?`, [req.params.id, req.user.user_id]
  );
  if (!owned.length) return res.status(404).json({ message: "Application not found." });
  const [r] = await pool.execute(
    "INSERT INTO interviews(application_id,scheduled_at,mode,meeting_link,location,notes) VALUES(?,?,?,?,?,?)",
    [req.params.id, scheduled_at, mode, meeting_link, location, notes]
  );
  await pool.execute("UPDATE applications SET status='Interview' WHERE application_id=?", [req.params.id]);
  res.status(201).json({ message: "Interview scheduled.", interview_id: r.insertId });
}));

app.patch("/api/interviews/:id/status", auth, allow("employer"), asyncRoute(async (req, res) => {
  const allowed = ["Scheduled", "Completed", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Choose a valid interview status." });
  const [result] = await pool.execute(
    `UPDATE interviews i JOIN applications a ON a.application_id=i.application_id
     JOIN jobs j ON j.job_id=a.job_id SET i.status=?
     WHERE i.interview_id=? AND j.employer_id=?`,
    [req.body.status, req.params.id, req.user.user_id]
  );
  if (!result.affectedRows) return res.status(404).json({ message: "Interview not found or not owned by your company." });
  res.json({ message: "Interview status updated." });
}));

app.get("/api/my-interviews", auth, asyncRoute(async (req, res) => {
  let sql = `SELECT i.*,j.title,e.company_name,u.full_name AS seeker_name
    FROM interviews i JOIN applications a ON a.application_id=i.application_id
    JOIN jobs j ON j.job_id=a.job_id JOIN employers e ON e.employer_id=j.employer_id
    JOIN users u ON u.user_id=a.seeker_id`;
  sql += req.user.role === "seeker" ? " WHERE a.seeker_id=?" : req.user.role === "employer" ? " WHERE j.employer_id=?" : "";
  const [rows] = await pool.execute(sql + " ORDER BY i.scheduled_at", req.user.role === "admin" ? [] : [req.user.user_id]);
  res.json(rows);
}));

app.post("/api/jobs/:id/save", auth, allow("seeker"), asyncRoute(async (req, res) => {
  await pool.execute("INSERT IGNORE INTO saved_jobs(seeker_id,job_id) VALUES(?,?)", [req.user.user_id, req.params.id]);
  res.json({ message: "Job saved." });
}));
app.delete("/api/jobs/:id/save", auth, allow("seeker"), asyncRoute(async (req, res) => {
  await pool.execute("DELETE FROM saved_jobs WHERE seeker_id=? AND job_id=?", [req.user.user_id, req.params.id]);
  res.json({ message: "Job removed from saved jobs." });
}));
app.get("/api/saved-jobs", auth, allow("seeker"), asyncRoute(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT j.*,e.company_name,c.category_name FROM saved_jobs s
     JOIN jobs j ON j.job_id=s.job_id JOIN employers e ON e.employer_id=j.employer_id
     LEFT JOIN job_categories c ON c.category_id=j.category_id WHERE s.seeker_id=? ORDER BY s.saved_at DESC`,
    [req.user.user_id]
  );
  res.json(rows);
}));

app.get("/api/dashboard", auth, asyncRoute(async (req, res) => {
  const id = req.user.user_id;
  if (req.user.role === "seeker") {
    const [[apps]] = await pool.execute("SELECT COUNT(*) total FROM applications WHERE seeker_id=?", [id]);
    const [[saved]] = await pool.execute("SELECT COUNT(*) total FROM saved_jobs WHERE seeker_id=?", [id]);
    const [[interviews]] = await pool.execute(
      `SELECT COUNT(*) total FROM interviews i JOIN applications a ON a.application_id=i.application_id
       WHERE a.seeker_id=? AND i.status='Scheduled'`, [id]);
    const [[shortlisted]] = await pool.execute("SELECT COUNT(*) total FROM applications WHERE seeker_id=? AND status IN ('Shortlisted','Interview','Selected')", [id]);
    res.json({ applications: apps.total, saved: saved.total, interviews: interviews.total, shortlisted: shortlisted.total });
  } else if (req.user.role === "employer") {
    const [[jobs]] = await pool.execute("SELECT COUNT(*) total FROM jobs WHERE employer_id=?", [id]);
    const [[apps]] = await pool.execute("SELECT COUNT(*) total FROM applications a JOIN jobs j ON j.job_id=a.job_id WHERE j.employer_id=?", [id]);
    const [[shortlisted]] = await pool.execute("SELECT COUNT(*) total FROM applications a JOIN jobs j ON j.job_id=a.job_id WHERE j.employer_id=? AND a.status='Shortlisted'", [id]);
    const [[open]] = await pool.execute("SELECT COUNT(*) total FROM jobs WHERE employer_id=? AND status='Open'", [id]);
    res.json({ jobs: jobs.total, applications: apps.total, shortlisted: shortlisted.total, open: open.total });
  } else {
    const [[users]] = await pool.execute("SELECT COUNT(*) total FROM users");
    const [[jobs]] = await pool.execute("SELECT COUNT(*) total FROM jobs");
    const [[apps]] = await pool.execute("SELECT COUNT(*) total FROM applications");
    const [[employers]] = await pool.execute("SELECT COUNT(*) total FROM employers");
    res.json({ users: users.total, jobs: jobs.total, applications: apps.total, employers: employers.total });
  }
}));

app.get("/api/admin/users", auth, allow("admin"), asyncRoute(async (_, res) => {
  const [rows] = await pool.execute("SELECT user_id,full_name,email,role,is_active,created_at FROM users ORDER BY created_at DESC");
  res.json(rows);
}));
app.patch("/api/admin/users/:id/active", auth, allow("admin"), asyncRoute(async (req, res) => {
  await pool.execute("UPDATE users SET is_active=? WHERE user_id=?", [!!req.body.is_active, req.params.id]);
  res.json({ message: "User account updated." });
}));

app.get("/api/admin/reports", auth, allow("admin"), asyncRoute(async (_, res) => {
  const [byStatus] = await pool.execute("SELECT status,COUNT(*) total FROM applications GROUP BY status");
  const [byCategory] = await pool.execute(
    `SELECT c.category_name,COUNT(j.job_id) total FROM job_categories c
     LEFT JOIN jobs j ON j.category_id=c.category_id GROUP BY c.category_id,c.category_name ORDER BY total DESC`
  );
  res.json({ byStatus, byCategory });
}));

app.get("/api/*", (_, res) => res.status(404).json({ message: "API endpoint not found." }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  if (["ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "ECONNRESET", "ETIMEDOUT"].includes(err.code)) {
    return res.status(503).json({ message: "HireSphere cannot reach MySQL. Start the MySQL80 service in Windows Services, then check DB_HOST, DB_PORT and your .env settings." });
  }
  if (err.code === "ER_ACCESS_DENIED_ERROR") return res.status(503).json({ message: "HireSphere reached MySQL, but the database username or password is incorrect. Check DB_USER and DB_PASSWORD in .env." });
  if (err.code === "ER_BAD_DB_ERROR") return res.status(503).json({ message: "The hiresphere database was not found. Execute database/schema.sql in MySQL Workbench first." });
  if (err.code === "ER_SIGNAL_EXCEPTION") return res.status(400).json({ message: err.sqlMessage || "This action is not allowed by the database rules." });
  if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "This record already exists." });
  if (err.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ message: "Related record does not exist." });
  if (err.name === "MulterError") return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Resume must be 5 MB or smaller." : "The uploaded file could not be accepted." });
  if (err.message?.startsWith("Only PDF")) return res.status(400).json({ message: err.message });
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

let server;
async function startHireSphere() {
  try {
    await pool.query("SELECT 1");
    server = app.listen(PORT, () => {
      console.log("[DATABASE READY] MySQL connection established.");
      console.log(`HireSphere running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("[STARTUP FAILED] HireSphere was not started because MySQL is unavailable.");
    if (error.code === "ECONNREFUSED") console.error("Start the MySQL Server service (usually MySQL80) in Windows Services.");
    else if (error.code === "ER_ACCESS_DENIED_ERROR") console.error("Check DB_USER and DB_PASSWORD in .env, and verify the hiresphere_app MySQL user grants.");
    else if (error.code === "ER_BAD_DB_ERROR") console.error("Run database/schema.sql in MySQL Workbench to create the hiresphere database.");
    else console.error(error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  }
}
startHireSphere();

async function shutdown() {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
}
process.on("SIGTERM", () => shutdown().finally(() => process.exit(0)));
process.on("SIGINT", () => shutdown().finally(() => process.exit(0)));
