-- Run AFTER database/schema.sql using a MySQL administrator account.
-- Replace the placeholder below with one strong, unique password.
-- The application connects to 127.0.0.1; create both host entries so MySQL
-- account matching does not cause an access-denied error on Windows.
CREATE USER IF NOT EXISTS 'hiresphere_app'@'localhost'
  IDENTIFIED BY '900a948a5b1431c05e3eb2c6b80bd22d5616f0a9fa82ac44';
ALTER USER 'hiresphere_app'@'localhost'
  IDENTIFIED BY '900a948a5b1431c05e3eb2c6b80bd22d5616f0a9fa82ac44';

CREATE USER IF NOT EXISTS 'hiresphere_app'@'127.0.0.1'
  IDENTIFIED BY '900a948a5b1431c05e3eb2c6b80bd22d5616f0a9fa82ac44';
ALTER USER 'hiresphere_app'@'127.0.0.1'
  IDENTIFIED BY '900a948a5b1431c05e3eb2c6b80bd22d5616f0a9fa82ac44';

GRANT SELECT, INSERT, UPDATE, DELETE ON hiresphere.*
  TO 'hiresphere_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON hiresphere.*
  TO 'hiresphere_app'@'127.0.0.1';

-- Stored procedures are part of the DBMS demonstration and can be executed
-- by the restricted application account without granting schema privileges.
GRANT EXECUTE ON PROCEDURE hiresphere.sp_job_applicants
  TO 'hiresphere_app'@'localhost';
GRANT EXECUTE ON PROCEDURE hiresphere.sp_update_application_status
  TO 'hiresphere_app'@'localhost';
GRANT EXECUTE ON PROCEDURE hiresphere.sp_job_applicants
  TO 'hiresphere_app'@'127.0.0.1';
GRANT EXECUTE ON PROCEDURE hiresphere.sp_update_application_status
  TO 'hiresphere_app'@'127.0.0.1';

FLUSH PRIVILEGES;
