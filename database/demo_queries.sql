USE hiresphere;

-- 1. List all open jobs with employer and category.
SELECT * FROM v_open_jobs;

-- 2. Applications received by each job.
SELECT j.job_id, j.title, COUNT(a.application_id) AS applicant_count
FROM jobs j LEFT JOIN applications a ON a.job_id=j.job_id
GROUP BY j.job_id, j.title;

-- 3. Jobs with more than 3 applications.
SELECT j.job_id, j.title, COUNT(a.application_id) AS applicants
FROM jobs j JOIN applications a ON a.job_id=j.job_id
GROUP BY j.job_id, j.title
HAVING COUNT(a.application_id) > 3;

-- 4. Above-average salary jobs.
SELECT title, min_salary, max_salary
FROM jobs
WHERE max_salary > (SELECT AVG(max_salary) FROM jobs WHERE max_salary IS NOT NULL);

-- 5. Application status distribution.
SELECT status, COUNT(*) AS total
FROM applications GROUP BY status;

-- 6. Employer job summary view.
SELECT * FROM v_employer_job_summary;

-- 7. Application details view.
SELECT * FROM v_application_details;

-- 8. Run the stored procedure after a job exists.
-- CALL sp_job_applicants(1);

-- 9. Run the status procedure after an application exists.
-- CALL sp_update_application_status(1, 'Shortlisted');

-- 10. Verify trigger audit history.
SELECT * FROM application_status_history ORDER BY changed_at DESC;

-- 11. Search jobs by location and workplace.
SELECT * FROM jobs
WHERE status='Open' AND location LIKE '%Bengaluru%' AND work_mode='Hybrid';

-- 12. Count job posts by employer.
SELECT employer_id, COUNT(*) AS total_jobs
FROM jobs GROUP BY employer_id;


-- 13. M:N: candidate skills through the seeker_skills junction table.
SELECT u.full_name, s.skill_name, ss.proficiency
FROM job_seekers js
JOIN users u ON u.user_id = js.seeker_id
JOIN seeker_skills ss ON ss.seeker_id = js.seeker_id
JOIN skills s ON s.skill_id = ss.skill_id
ORDER BY u.full_name, s.skill_name;

-- 14. M:N: skills required by each job through the job_skills junction table.
SELECT j.title, s.skill_name
FROM jobs j
JOIN job_skills js ON js.job_id = j.job_id
JOIN skills s ON s.skill_id = js.skill_id
ORDER BY j.title, s.skill_name;

-- 15. M:N: candidate-to-job applications, including application attributes.
SELECT u.full_name, j.title, a.status, a.applied_at
FROM applications a
JOIN users u ON u.user_id = a.seeker_id
JOIN jobs j ON j.job_id = a.job_id
ORDER BY a.applied_at DESC;

-- 16. 1:N: one employer and all jobs posted by that employer.
SELECT e.company_name, j.job_id, j.title, j.status
FROM employers e
LEFT JOIN jobs j ON j.employer_id = e.employer_id
ORDER BY e.company_name, j.created_at DESC;

-- 17. 1:N: one job and all applications received for that job.
SELECT j.title, a.application_id, u.full_name, a.status
FROM jobs j
LEFT JOIN applications a ON a.job_id = j.job_id
LEFT JOIN users u ON u.user_id = a.seeker_id
ORDER BY j.job_id, a.applied_at DESC;


-- 18. Candidate qualification records with their qualification type.
SELECT u.full_name, q.qualification_name, sq.institution,
       sq.passing_year, sq.percentage
FROM seeker_qualifications sq
JOIN users u ON u.user_id = sq.seeker_id
JOIN qualifications q ON q.qualification_id = sq.qualification_id
ORDER BY u.full_name, sq.passing_year DESC;

-- 19. Qualifications of candidates who applied for a particular job.
-- Replace 1 with an existing job_id.
SELECT j.title, u.full_name, q.qualification_name, sq.institution,
       sq.passing_year, sq.percentage, a.status
FROM applications a
JOIN jobs j ON j.job_id = a.job_id
JOIN users u ON u.user_id = a.seeker_id
LEFT JOIN seeker_qualifications sq ON sq.seeker_id = a.seeker_id
LEFT JOIN qualifications q ON q.qualification_id = sq.qualification_id
WHERE j.job_id = 1
ORDER BY u.full_name, sq.passing_year DESC;

-- 20. Recruitment pipeline summary by job and status.
SELECT j.title, a.status, COUNT(*) AS candidate_count
FROM applications a
JOIN jobs j ON j.job_id = a.job_id
GROUP BY j.job_id, j.title, a.status
ORDER BY j.title, a.status;
