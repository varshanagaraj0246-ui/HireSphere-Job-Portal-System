require("dotenv").config();
const mysql = require("mysql2/promise");

const requiredTables = [
  "users", "job_seekers", "employers", "job_categories", "jobs", "skills",
  "seeker_skills", "job_skills", "qualifications", "seeker_qualifications",
  "applications", "interviews", "application_status_history", "saved_jobs"
];
const requiredViews = ["v_open_jobs", "v_application_details", "v_employer_job_summary"];
const requiredTriggers = ["trg_application_status_history", "trg_prevent_closed_job_application"];
const requiredProcedures = ["sp_job_applicants", "sp_update_application_status"];
const requiredIndexes = ["idx_jobs_search", "idx_jobs_title", "idx_applications_status", "idx_interviews_schedule", "uq_seeker_job"];

(async () => {
  if (!process.env.DB_USER || !process.env.DB_NAME) {
    console.error("SETUP ERROR: DB_USER and DB_NAME must be configured in .env.");
    process.exit(1);
  }
  let connection;
  let failed = false;
  const fail = message => { console.error(`[MISSING / INVALID] ${message}`); failed = true; };
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
      connectTimeout: 5000
    });
    console.log("[OK] Connected to MySQL.");
    const [[version]] = await connection.query("SELECT VERSION() AS version, CURRENT_USER() AS connected_as");
    console.log(`[INFO] MySQL ${version.version}; authenticated as ${version.connected_as}.`);

    const [objects] = await connection.query(
      "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
    );
    const tableNames = new Set(objects.filter(x => x.TABLE_TYPE === "BASE TABLE").map(x => x.TABLE_NAME));
    const viewNames = new Set(objects.filter(x => x.TABLE_TYPE === "VIEW").map(x => x.TABLE_NAME));
    for (const name of requiredTables) if (!tableNames.has(name)) fail(`table ${name}`);
    for (const name of requiredViews) if (!viewNames.has(name)) fail(`view ${name}`);
    if (!failed) console.log(`[OK] ${requiredTables.length} tables and ${requiredViews.length} views are present.`);

    const [triggers] = await connection.query(
      "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()"
    );
    const triggerNames = new Set(triggers.map(x => x.TRIGGER_NAME));
    for (const name of requiredTriggers) if (!triggerNames.has(name)) fail(`trigger ${name}`);
    if (requiredTriggers.every(x => triggerNames.has(x))) console.log("[OK] Both required triggers are present.");

    const [routines] = await connection.query(
      "SELECT ROUTINE_NAME FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE'"
    );
    const routineNames = new Set(routines.map(x => x.ROUTINE_NAME));
    for (const name of requiredProcedures) if (!routineNames.has(name)) fail(`stored procedure ${name}`);
    if (requiredProcedures.every(x => routineNames.has(x))) console.log("[OK] Both required stored procedures are present.");

    const [indexes] = await connection.query(
      "SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()"
    );
    const indexNames = new Set(indexes.map(x => x.INDEX_NAME));
    for (const name of requiredIndexes) if (!indexNames.has(name)) fail(`index ${name}`);
    if (requiredIndexes.every(x => indexNames.has(x))) console.log("[OK] Search, status, schedule and uniqueness indexes are present.");

    const [[fk]] = await connection.query(
      "SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'"
    );
    if (Number(fk.total) < 17) fail(`expected at least 17 foreign-key constraints; found ${fk.total}`);
    else console.log(`[OK] ${fk.total} foreign-key constraints are present.`);

    const [[checks]] = await connection.query(
      "SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'"
    );
    if (Number(checks.total) < 3) fail(`expected at least 3 CHECK constraints; found ${checks.total}`);
    else console.log(`[OK] ${checks.total} CHECK constraints are present.`);

    if (failed) {
      console.error("\nDatabase verification did not pass. Review the missing items and run the SQL setup scripts in the order shown in README.md.");
      process.exitCode = 1;
    } else {
      console.log("\nHireSphere database verification PASSED.");
    }
  } catch (error) {
    console.error("[DATABASE CHECK FAILED]", error.code || error.message);
    if (error.code === "ECONNREFUSED") console.error("Start the MySQL Server service in Windows Services (usually MySQL80), then retry.");
    else if (error.code === "ER_ACCESS_DENIED_ERROR") console.error("Check DB_USER and DB_PASSWORD in .env. Run database/create_app_user.sql as a MySQL administrator.");
    else if (error.code === "ER_BAD_DB_ERROR") console.error("Run database/schema.sql in MySQL Workbench to create the hiresphere database.");
    else console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
})();
