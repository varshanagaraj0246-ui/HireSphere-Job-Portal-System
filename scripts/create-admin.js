
require("dotenv").config();

const readline = require("readline");
const bcrypt = require("bcryptjs");
const pool = require("../src/db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Read password without displaying its characters
function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error("A supported interactive terminal is required."));
      return;
    }

    process.stdout.write(question);

    let password = "";

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
    };

    const onData = (data) => {
      for (const char of data.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Operation cancelled."));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(password);
          return;
        }

        if (char === "\u007f" || char === "\b") {
          password = password.slice(0, -1);
          continue;
        }

        if (char >= " ") {
          password += char;
        }
      }
    };

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

async function createAdmin() {
  try {
    console.log("\n===== HireSphere Admin Account Setup =====\n");

    const fullName = await ask("Administrator full name: ");
    const email = (await ask("Administrator email: ")).toLowerCase();

    if (!fullName || fullName.length > 100) {
      throw new Error("Name must contain between 1 and 100 characters.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) {
      throw new Error("Please enter a valid email address.");
    }

    const [existingUsers] = await pool.execute(
      "SELECT user_id, role FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      throw new Error(
        `An account with this email already exists (role: ${existingUsers[0].role}). No changes were made.`
      );
    }

    const password = await askHidden("Create admin password (minimum 12 characters): ");
    const confirmPassword = await askHidden("Confirm admin password: ");

    if (password.length < 12) {
      throw new Error("Password must contain at least 12 characters.");
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("Password must not exceed 72 UTF-8 bytes.");
    }

    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      `INSERT INTO users
       (full_name, email, password_hash, role, privacy_consent_at)
       VALUES (?, ?, ?, 'admin', CURRENT_TIMESTAMP)`,
      [fullName, email, passwordHash]
    );

    console.log("\nAdmin account created successfully!");
    console.log("Admin ID:", result.insertId);
    console.log("Name:", fullName);
    console.log("Email:", email);
    console.log("Role: admin");
    console.log("Status: Active");
    console.log("\nYou can now sign in through Administrator Access.");

  } catch (error) {
    console.error("\nAdmin setup failed:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

createAdmin();
