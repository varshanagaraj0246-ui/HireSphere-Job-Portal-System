CREATE DATABASE IF NOT EXISTS hiresphere
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hiresphere;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('seeker','employer','admin') NOT NULL DEFAULT 'seeker',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  privacy_consent_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_seekers (
  seeker_id INT PRIMARY KEY,
  phone VARCHAR(20),
  location VARCHAR(120),
  headline VARCHAR(160),
  experience_years DECIMAL(4,1) NOT NULL DEFAULT 0,
  bio TEXT,
  resume_path VARCHAR(255),
  profile_visibility BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_seeker_user FOREIGN KEY (seeker_id)
    REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_seeker_experience CHECK (experience_years >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS employers (
  employer_id INT PRIMARY KEY,
  company_name VARCHAR(150) NOT NULL,
  industry VARCHAR(100),
  location VARCHAR(120),
  website VARCHAR(255),
  description TEXT,
  logo_path VARCHAR(255),
  CONSTRAINT fk_employer_user FOREIGN KEY (employer_id)
    REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
  job_id INT AUTO_INCREMENT PRIMARY KEY,
  employer_id INT NOT NULL,
  category_id INT,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  requirements TEXT,
  location VARCHAR(120),
  work_mode ENUM('On-site','Hybrid','Remote') DEFAULT 'On-site',
  employment_type ENUM('Full-time','Part-time','Internship','Contract') DEFAULT 'Full-time',
  min_salary DECIMAL(12,2),
  max_salary DECIMAL(12,2),
  experience_level VARCHAR(50) DEFAULT 'Fresher',
  deadline DATE,
  status ENUM('Open','Paused','Closed') DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_job_employer FOREIGN KEY (employer_id)
    REFERENCES employers(employer_id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_job_category FOREIGN KEY (category_id)
    REFERENCES job_categories(category_id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_job_salary CHECK (
    (min_salary IS NULL OR min_salary >= 0) AND
    (max_salary IS NULL OR max_salary >= 0) AND
    (min_salary IS NULL OR max_salary IS NULL OR max_salary >= min_salary)
  )
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS skills (
  skill_id INT AUTO_INCREMENT PRIMARY KEY,
  skill_name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seeker_skills (
  seeker_id INT NOT NULL,
  skill_id INT NOT NULL,
  proficiency ENUM('Beginner','Intermediate','Advanced') DEFAULT 'Intermediate',
  PRIMARY KEY (seeker_id, skill_id),
  FOREIGN KEY (seeker_id) REFERENCES job_seekers(seeker_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS job_skills (
  job_id INT NOT NULL,
  skill_id INT NOT NULL,
  PRIMARY KEY (job_id, skill_id),
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS qualifications (
  qualification_id INT AUTO_INCREMENT PRIMARY KEY,
  qualification_name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seeker_qualifications (
  seeker_id INT NOT NULL,
  qualification_id INT NOT NULL,
  institution VARCHAR(150),
  passing_year YEAR,
  percentage DECIMAL(5,2),
  PRIMARY KEY (seeker_id, qualification_id, institution),
  FOREIGN KEY (seeker_id) REFERENCES job_seekers(seeker_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (qualification_id) REFERENCES qualifications(qualification_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (percentage IS NULL OR percentage BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applications (
  application_id INT AUTO_INCREMENT PRIMARY KEY,
  seeker_id INT NOT NULL,
  job_id INT NOT NULL,
  cover_letter TEXT,
  resume_path VARCHAR(255),
  status ENUM('Applied','Under Review','Shortlisted','Interview','Selected','Rejected')
    NOT NULL DEFAULT 'Applied',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_seeker_job (seeker_id, job_id),
  FOREIGN KEY (seeker_id) REFERENCES job_seekers(seeker_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS interviews (
  interview_id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  mode ENUM('Online','In-person','Phone') DEFAULT 'Online',
  meeting_link VARCHAR(500),
  location VARCHAR(200),
  notes TEXT,
  status ENUM('Scheduled','Completed','Cancelled') DEFAULT 'Scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(application_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS application_status_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  application_id INT NOT NULL,
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by INT NULL,
  FOREIGN KEY (application_id) REFERENCES applications(application_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(user_id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS saved_jobs (
  seeker_id INT NOT NULL,
  job_id INT NOT NULL,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (seeker_id, job_id),
  FOREIGN KEY (seeker_id) REFERENCES job_seekers(seeker_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(job_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_jobs_search ON jobs(status, location, work_mode, employment_type);
CREATE INDEX idx_jobs_title ON jobs(title);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_interviews_schedule ON interviews(scheduled_at);

INSERT IGNORE INTO job_categories(category_name) VALUES
('Software Development'),('Data Science & AI'),('Cybersecurity'),
('Design'),('Marketing'),('Finance'),('Human Resources'),('Business');

INSERT IGNORE INTO skills(skill_name) VALUES
('JavaScript'),('HTML'),('CSS'),('React'),('Node.js'),('Python'),
('Java'),('C++'),('SQL'),('MySQL'),('Machine Learning'),('Communication'),
('Problem Solving'),('Git'),('Figma');

INSERT IGNORE INTO qualifications(qualification_name) VALUES
('B.E.'),('B.Tech'),('BCA'),('MCA'),('M.Tech'),('MBA'),('B.Sc.'),('M.Sc.');

CREATE OR REPLACE VIEW v_open_jobs AS
SELECT j.job_id, j.title, j.location, j.work_mode, j.employment_type,
       j.min_salary, j.max_salary, j.experience_level, j.created_at,
       e.company_name, c.category_name
FROM jobs j
JOIN employers e ON e.employer_id = j.employer_id
LEFT JOIN job_categories c ON c.category_id = j.category_id
WHERE j.status = 'Open';

CREATE OR REPLACE VIEW v_application_details AS
SELECT a.application_id, a.status, a.applied_at,
       u.full_name AS seeker_name, u.email AS seeker_email,
       j.job_id, j.title AS job_title, e.company_name
FROM applications a
JOIN users u ON u.user_id = a.seeker_id
JOIN jobs j ON j.job_id = a.job_id
JOIN employers e ON e.employer_id = j.employer_id;

CREATE OR REPLACE VIEW v_employer_job_summary AS
SELECT e.employer_id, e.company_name,
       COUNT(DISTINCT j.job_id) AS total_jobs,
       COUNT(a.application_id) AS total_applications
FROM employers e
LEFT JOIN jobs j ON j.employer_id = e.employer_id
LEFT JOIN applications a ON a.job_id = j.job_id
GROUP BY e.employer_id, e.company_name;

DELIMITER //
CREATE TRIGGER trg_application_status_history
AFTER UPDATE ON applications
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO application_status_history
      (application_id, old_status, new_status)
    VALUES
      (NEW.application_id, OLD.status, NEW.status);
  END IF;
END //

CREATE TRIGGER trg_prevent_closed_job_application
BEFORE INSERT ON applications
FOR EACH ROW
BEGIN
  DECLARE job_state VARCHAR(20);
  SELECT status INTO job_state FROM jobs WHERE job_id = NEW.job_id;
  IF job_state IS NULL OR job_state <> 'Open' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'This job is not open for applications';
  END IF;
END //

CREATE PROCEDURE sp_job_applicants(IN p_job_id INT)
BEGIN
  SELECT a.application_id, u.full_name, u.email, a.status, a.applied_at
  FROM applications a
  JOIN users u ON u.user_id = a.seeker_id
  WHERE a.job_id = p_job_id
  ORDER BY a.applied_at DESC;
END //

CREATE PROCEDURE sp_update_application_status(
  IN p_application_id INT,
  IN p_new_status VARCHAR(30)
)
BEGIN
  UPDATE applications
  SET status = p_new_status
  WHERE application_id = p_application_id;
END //
DELIMITER ;
