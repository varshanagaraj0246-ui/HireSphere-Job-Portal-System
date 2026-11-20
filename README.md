# HireSphere — Job Portal Management System

HireSphere is a role-based job portal built with **HTML, CSS, JavaScript, Node.js, Express and MySQL 8**. MySQL is the only database. It provides separate Candidate, Employer and Administrator workspaces and covers the required job-portal entities and recruitment workflow.

## Included functionality

### Candidate / Job Seeker
- Register, sign in and maintain a candidate profile.
- Browse and filter open jobs; save jobs and submit applications.
- Upload, download and reuse a resume. Resume files are encrypted before being written to disk and are served only after server-side ownership checks.
- Add, edit and remove educational qualification records.
- Track application progress and scheduled interviews.

### Employer / Recruiter
- Register a company profile and maintain company details.
- Create, edit, pause, reopen and close job posts.
- Review applications only for jobs owned by the signed-in employer.
- View applicant education details and download resumes only for applications to the employer's own jobs.
- Update recruitment status and schedule/manage interviews.

### Administrator
- View platform totals and reports.
- View users and activate/deactivate accounts.
- Administrator accounts are created by a database administrator; public registration cannot select the admin role.

### DBMS requirements
- 14 relational tables, primary keys, foreign keys and unique/composite keys.
- One-to-many and many-to-many relationships.
- `NOT NULL`, `UNIQUE`, `DEFAULT`, `CHECK` and `ENUM` constraints.
- `ON DELETE CASCADE`, `ON DELETE SET NULL` and `ON UPDATE CASCADE` actions.
- 3 views, 2 triggers, 2 stored procedures and indexes.
- Parameterized SQL queries in the application.

## 1. Install the required software

Install:
1. **Node.js 20 LTS or newer** (includes npm).
2. **MySQL Server 8.0.16 or newer** (CHECK constraints must be enforced by this version or later).
3. **MySQL Workbench**.
4. **Visual Studio Code**.

Keep MySQL Server running while using HireSphere.

## 2. Extract and open the correct folder

1. Extract `HireSphere_Final_Submission.zip`.
2. Open the inner **HireSphere_Final** folder in VS Code. It must directly contain `package.json`, `server.js`, `.env.example`, `database`, `public`, `src` and `scripts`.
3. Open **Terminal → New Terminal** in VS Code.
4. Run `dir`. Confirm that `package.json` is listed before running npm commands.

Do not run commands from the outer extraction folder.

## 3. Create the database schema

1. Start the MySQL Server service.
2. Open MySQL Workbench and connect using your MySQL administrator account (often `root`).
3. Open `database/schema.sql` from this project, copy the complete file into a new Workbench SQL tab, and execute it once.
4. Refresh **Schemas** and confirm that `hiresphere` appears.

The schema creates the tables, relationships, constraints, sample category/skill/qualification values, views, triggers and stored procedures.

**If you already have a HireSphere database from the earlier project version:** do not blindly run migration scripts. First check whether `users.privacy_consent_at` already exists. If it does not, run `database/security_migration.sql` once. If it already exists, skip the migration. For a clean first-time installation, the main `schema.sql` is enough.

## 4. Create the restricted MySQL application account

Do not connect the website as `root`.

1. In Workbench, open `database/create_app_user.sql`.
2. Replace every occurrence of `REPLACE_WITH_A_LONG_UNIQUE_PASSWORD` with the same new password. A 32–48 character hexadecimal password is convenient because it avoids SQL quoting problems. Do not reuse your root password.
3. Execute the script while connected as the MySQL administrator.

The script creates `hiresphere_app` for both `localhost` and `127.0.0.1`, grants only `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the HireSphere schema and `EXECUTE` on the two demonstration procedures. It does not grant permission to create or drop tables.

## 5. Create the `.env` configuration file

In the VS Code terminal, make sure you are in the folder containing `package.json`. Run:

```powershell
Copy-Item .env.example .env
```

Open `.env`. Set the MySQL password to the exact password you used in Step 4. If you already have an older `.env`, keep your correct database values but add `RESUME_ENCRYPTION_KEY` and generate a fresh `JWT_SECRET`; do not reuse a session secret that was previously pasted into a chat. Generate two different random secrets with these PowerShell commands:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the first output for `JWT_SECRET` and the second output for `RESUME_ENCRYPTION_KEY`. Do not use the same output for both. Keep both values private and do not send them in chat or upload `.env` to GitHub.

Your `.env` should have this structure (replace the three example values):

```env
PORT=5000
NODE_ENV=development
APP_ORIGIN=http://localhost:5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=hiresphere_app
DB_PASSWORD=PASTE_THE_MYSQL_APP_PASSWORD_HERE
DB_NAME=hiresphere
DB_SSL=false
JWT_SECRET=PASTE_THE_FIRST_RANDOM_SECRET_HERE
RESUME_ENCRYPTION_KEY=PASTE_THE_SECOND_RANDOM_SECRET_HERE
```

Important:
- The filename must be exactly `.env`, not `.env.txt`.
- `.env` must be in the same folder as `server.js` and `package.json`.
- Do not put quotation marks around the values.
- `RESUME_ENCRYPTION_KEY` must be exactly 64 hexadecimal characters. If this key is lost or changed, previously encrypted resumes cannot be decrypted. Back it up securely, separately from the project folder.
- `DB_SSL=false` is for local MySQL on your own computer only. Do not expose this configuration to the public internet.

## 6. Install Node packages

Run this in the terminal from the folder containing `package.json`:

```powershell
npm install
```

Wait for it to finish. Do not close the terminal while installation is running.

## 7. Verify the database before launching

Run:

```powershell
npm run check:db
```

The check must finish with:

`HireSphere database verification PASSED.`

It verifies the connection, 14 tables, 3 views, 2 triggers, 2 stored procedures, required indexes, at least 17 foreign keys and at least 3 CHECK constraints. If it fails, use the exact error:

- `ECONNREFUSED`: start the MySQL Server service (usually `MySQL80`).
- `ER_ACCESS_DENIED_ERROR`: check `DB_USER` and `DB_PASSWORD`, then re-run `database/create_app_user.sql` in Workbench as administrator.
- `ER_BAD_DB_ERROR`: run `database/schema.sql` in Workbench.
- Missing tables/views/triggers/procedures: the schema was not fully created; inspect the Workbench Action Output and correct the SQL error before continuing.

Do not proceed until this check passes.

## 8. Start HireSphere

Run:

```powershell
npm run dev
```

The server now checks MySQL before opening the website. It will not display a misleading “running” message if the database connection fails. On success, the terminal prints:

`[DATABASE READY] MySQL connection established.`

`HireSphere running at http://localhost:5000`

Open **http://localhost:5000** in Chrome or Edge. Keep the terminal open while using the website. Press `Ctrl + C` in that terminal to stop it.

You can also double-click `START_HIRESphere.bat` in the project folder; it checks the database before starting the server.

## 9. Recommended demonstration sequence

1. Choose **Candidate / Applicant**, create a candidate account, and complete the profile.
2. Add one or two education qualifications and upload a sample resume (never use a real identity document).
3. Log out. Choose **Employer / Recruiter** and create a company account with a different email address.
4. As the employer, complete the company profile and publish a job.
5. Log out and sign in as the candidate. Find the published job and apply.
6. Log in as the employer. Open Applications, review the candidate, inspect the qualification details and download the resume for that employer-owned application.
7. Update the application status and schedule an interview.
8. Log in as the candidate to verify the application status and interview details.

### Create the administrator account for your demo

Register an ordinary account first. In MySQL Workbench, run this query using the email of that account:

```sql
USE hiresphere;
UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';
```

Log out and log in again, choosing **Administrator**. Never add an admin registration option to the public sign-up form.

## 10. Data protection included — and its limits

The project includes:
- bcrypt password hashing (not plaintext password storage).
- Short-lived JWT session in an `HttpOnly`, `SameSite=Strict` cookie; `Secure` is enabled in production mode.
- Server-side role and record-ownership checks for candidate, employer and admin routes.
- Parameterized SQL queries, request limits, security headers, same-origin checks and non-cacheable API responses.
- Least-privilege MySQL application account; the website does not use the database root account.
- Resume uploads limited by size/type/signature, stored outside the public folder, encrypted using AES-256-GCM, and decrypted only after authorization.
- `.env`, private resume files and dependency folders excluded from Git through `.gitignore`.

This is a **college academic project with professional-style safeguards**, not a certified production hiring platform. It has not undergone an independent penetration test, formal privacy/legal review, antivirus scanning of uploaded documents, high-availability testing or production deployment review. Local `http://localhost` is for local demonstration only. Use fictional/test data. Do not upload Aadhaar, PAN, passport, bank information or real sensitive documents. For public deployment, you would still need HTTPS, verified MySQL TLS, encrypted backups, access monitoring, malware scanning, data-retention/deletion workflows, operational monitoring and an independent security assessment.

**Resume key warning:** back up `RESUME_ENCRYPTION_KEY` securely. If it is lost, encrypted resumes are permanently unreadable. Do not commit the key or `.env` to GitHub. Resumes uploaded by an older, unencrypted build must be uploaded again after switching to this version; do not copy old plaintext files into `private_uploads`.

## 11. Main project structure

```text
HireSphere_Final/
├── database/
│   ├── schema.sql
│   ├── security_migration.sql
│   ├── create_app_user.sql
│   └── demo_queries.sql
├── private_uploads/       # encrypted resume files; not public
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── privacy.html
├── scripts/
│   └── check-db.js
├── src/
│   └── db.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## 12. DBMS demonstration queries

Open `database/demo_queries.sql` in MySQL Workbench and execute individual queries after creating sample accounts, jobs and applications. It demonstrates joins, aggregation, subqueries, views, stored procedures, trigger audit history, one-to-many relationships and many-to-many junction tables.
