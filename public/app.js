const API = "/api";
const state = { user: null, jobs: [], entryRole: null };
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => n == null ? "Salary not disclosed" : `₹${Number(n).toLocaleString("en-IN")}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),2800); }
async function api(path, options={}) {
  const headers = { ...(options.headers || {}) };
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) headers["X-Requested-With"] = "XMLHttpRequest";
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"]="application/json";
  const response = await fetch(API+path,{...options,headers,credentials:"same-origin"});
  const data = response.status===204 ? {} : await response.json().catch(()=>({message:"Unexpected server response"}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}
function openModal(kind, role=state.entryRole || "seeker") {
  $("#modalBackdrop").classList.remove("hidden");
  const register = kind==="register";
  $("#modalContent").innerHTML = register ? `
    <h2>Create your account</h2><p>Your next chapter starts with one small step.</p>
    <form id="authForm" class="form-stack">
      <label>Full name<input name="full_name" required placeholder="Your name"></label>
      <label>Email address<input name="email" type="email" required placeholder="you@example.com"></label>
      <label>Password<input name="password" type="password" minlength="12" maxlength="72" required autocomplete="new-password" placeholder="At least 12 characters"></label>
      <label class="privacy-consent">
  <input type="checkbox" name="privacy_consent" required>
  <span>I have read and agree to the <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Notice</a>.</span>
</label>
      <input type="hidden" name="role" value="${role}"><div class="account-type-note">Creating a <strong>${role==="employer"?"Employer / Recruiter":"Candidate / Job Seeker"}</strong> account</div>
      <label id="companyField" class="${role==="employer"?"":"hidden"}">Company name<input name="company_name" ${role==="employer"?"required":""} placeholder="Company name"></label>
      <button class="btn btn-primary full" type="submit">Create account ↗</button>
    </form><div class="form-switch">Already have an account? <button data-switch="login">Log in</button></div>` :
    `<h2>Welcome back</h2><p>Log in to continue in your ${role === "seeker" ? "Candidate / Applicant" : role === "employer" ? "Employer / Recruiter" : "Administrator"} workspace.</p><div class="account-type-note">Selected workspace: <strong>${role === "seeker" ? "Candidate / Applicant" : role === "employer" ? "Employer / Recruiter" : "Administrator"}</strong>. Your account role will be verified before access is granted.</div>
    <form id="authForm" class="form-stack">
      <label>Email address<input name="email" type="email" required autocomplete="username" placeholder="you@example.com"></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Your password"></label>
      <button class="btn btn-primary full" type="submit">Log in ↗</button>
    </form><div class="form-switch">New to HireSphere? <button data-switch="register">Create an account</button></div>`;
  $("#authForm").addEventListener("submit", submitAuth);
}
async function submitAuth(e) {
  e.preventDefault();
  const form=Object.fromEntries(new FormData(e.currentTarget).entries());
  const endpoint=form.role ? "/auth/register" : "/auth/login";
  try {
    const data=await api(endpoint,{method:"POST",body:JSON.stringify(form)});
    if (!form.role && state.entryRole && data.user.role !== state.entryRole) { await api("/auth/logout",{method:"POST"}); toast(`This account is registered as ${data.user.role}. Please choose the matching workspace.`); return; }
    state.user=data.user;
    $("#modalBackdrop").classList.add("hidden"); toast(data.message); showDashboard();
  } catch(err){toast(err.message);}
}
function closeModal(){$("#modalBackdrop").classList.add("hidden");}
async function loadJobs() {
  const params=new URLSearchParams();
  if($("#searchQuery").value)params.set("q",$("#searchQuery").value);
  if($("#searchLocation").value)params.set("location",$("#searchLocation").value);
  if($("#searchMode").value)params.set("work_mode",$("#searchMode").value);
  try { state.jobs=await api("/jobs?"+params.toString()); renderJobs(state.jobs); }
  catch { $("#jobGrid").innerHTML='<div class="empty-state">Could not load jobs. Start the API and database, then refresh.</div>'; }
}
function renderJobs(jobs) {
  $("#jobGrid").innerHTML=jobs.length ? jobs.slice(0,9).map((j,i)=>`
    <article class="job-card" style="animation-delay:${i*55}ms">
      <div class="job-card-top"><div class="company-logo logo-violet">${esc((j.company_name||"H").slice(0,1).toUpperCase())}</div><button class="save-btn" data-save="${j.job_id}" title="Save job">♡</button></div>
      <h3>${esc(j.title)}</h3><div class="job-company">${esc(j.company_name)} · ${esc(j.category_name||"Opportunity")}</div>
      <div class="job-meta"><span>⌖ ${esc(j.location||"Flexible")}</span><span>${esc(j.work_mode)}</span><span>${esc(j.employment_type)}</span></div>
      <div class="job-card-bottom"><div class="salary">${j.min_salary||j.max_salary?`${money(j.min_salary)} – ${money(j.max_salary)}`:"Competitive salary"}<small>${esc(j.experience_level||"All experience levels")}</small></div><button class="job-open" data-job="${j.job_id}">View role →</button></div>
    </article>`).join("") : '<div class="empty-state">No matching jobs yet. Try a different search.</div>';
}
async function showJob(id) {
  try {
    const j=await api("/jobs/"+id);
    $("#modalBackdrop").classList.remove("hidden");
    $("#modalContent").innerHTML=`<span class="tag tag-green">${esc(j.work_mode)} · ${esc(j.employment_type)}</span><h2 style="margin-top:15px">${esc(j.title)}</h2><p>${esc(j.company_name)} · ${esc(j.location||"Flexible")}</p>
      <div class="panel"><strong>${j.min_salary||j.max_salary?money(j.min_salary)+" – "+money(j.max_salary):"Salary not disclosed"}</strong><p>${esc(j.experience_level||"All levels")}</p></div>
      <h3>About the role</h3><p>${esc(j.description)}</p><h3>What you'll need</h3><p>${esc(j.requirements||"Discussed during the selection process.")}</p>
      <button class="btn btn-primary full" id="applyNow">Apply for this role ↗</button>`;
    $("#applyNow").onclick=async()=>{if(!state.user){closeModal();openModal("register");return;}if(state.user.role!=="seeker"){toast("Only job seekers can apply.");return;}try{await api(`/jobs/${id}/apply`,{method:"POST",body:JSON.stringify({})});toast("Application submitted!");closeModal();}catch(e){toast(e.message);}};
  }catch(e){toast(e.message);}
}
function showRoleGate(){
  state.entryRole=null; document.body.dataset.entry="gate";
  $("#roleGate").classList.remove("hidden"); $("#rolePortal").classList.add("hidden"); $("#app").classList.add("hidden"); $("#dashboard").classList.add("hidden"); $(".footer").classList.add("hidden");
  window.scrollTo(0,0);
}
function showRolePortal(role){
  state.entryRole=role; document.body.dataset.entry="portal";
  $("#roleGate").classList.add("hidden"); $("#app").classList.add("hidden"); $("#dashboard").classList.add("hidden"); $(".footer").classList.add("hidden");
  const portal=$("#rolePortal"); portal.classList.remove("hidden");
  const content={
    seeker:{label:"CANDIDATE WORKSPACE",title:"Make your next move\nwith confidence.",desc:"A clear, guided space to discover roles that fit your skills and keep your job search organised.",steps:[["01","Build your profile","Add your experience, education and skills so employers understand your strengths."],["02","Explore opportunities","Search by role, location and work mode. Save roles that interest you."],["03","Apply and stay informed","Submit applications and follow each status from one dashboard."]],primary:"Create candidate account",login:"Candidate sign in",cta:"Explore public jobs"},
    employer:{label:"EMPLOYER WORKSPACE",title:"Find people who\nmove your mission.",desc:"A focused recruitment workspace to publish opportunities, review candidates and coordinate interviews.",steps:[["01","Set up your company","Create your organisation profile and add the details candidates need."],["02","Publish a role","Describe responsibilities, skills, work mode, salary and application deadline."],["03","Manage your pipeline","Review applicants, update statuses and schedule interviews in one place."]],primary:"Create employer account",login:"Employer sign in",cta:"See how hiring works"},
    admin:{label:"ADMINISTRATOR ACCESS",title:"Keep the platform\nrunning smoothly.",desc:"Administrator tools are reserved for authorised platform operators. Sign in with your assigned admin account.",steps:[["01","Verify access","Use your authorised administrator credentials."],["02","Monitor activity","Review user accounts, job listings and platform reports."],["03","Maintain trust","Manage account access and keep platform activity organised."]],primary:"Administrator sign in",login:"",cta:"Return to role selection"}
  }[role];
  const admin=role==="admin";
  portal.innerHTML=`<div class="portal-top"><button class="back-link" id="backToRoles">← Change workspace</button><div class="gate-brand"><span class="brand-mark">H</span><span>hire<span class="brand-accent">sphere</span></span></div><button class="portal-help" id="portalHelp">How it works</button></div>
    <div class="portal-layout"><div class="portal-copy"><div class="eyebrow"><span class="pulse-dot"></span> ${content.label}</div><h1>${content.title.split("\n").map(esc).join("<br>")}</h1><p class="gate-subtitle">${content.desc}</p>
    <div class="portal-actions"><button class="btn btn-primary btn-large" data-open="${admin?"login":"register"}" data-role="${role}">${content.primary} ↗</button>${!admin?`<button class="btn btn-outline btn-large" data-open="login" data-role="${role}">${content.login}</button>`:""}</div>
    <button class="portal-text-action" id="portalSecondary">${content.cta} →</button></div>
    <div class="portal-steps"><div class="portal-steps-head"><span>YOUR JOURNEY</span><span class="steps-line"></span></div>${content.steps.map(x=>`<article class="portal-step"><span>${x[0]}</span><div><strong>${x[1]}</strong><p>${x[2]}</p></div></article>`).join("")}<div class="portal-note">✧ &nbsp; A dedicated workspace keeps your actions clear and your information organised.</div></div></div>
    <div class="gate-bottom"><span>HireSphere · Thoughtful work. Meaningful connections.</span><span>Secure role-based access</span></div>`;
  $("#backToRoles").onclick=showRoleGate;
  $("#portalSecondary").onclick=()=>{if(role==="seeker")showHome();else if(role==="employer"){$("#portalHelp").click();}else showRoleGate();};
  $("#portalHelp").onclick=()=>{portal.querySelector(".portal-steps").scrollIntoView({behavior:"smooth",block:"center"});};
  window.scrollTo(0,0);
}
function showHome(){
  // Public job discovery is its own focused screen, not a long marketing page.
  document.body.dataset.entry="jobs";
  $("#roleGate").classList.add("hidden");$("#rolePortal").classList.add("hidden");$("#dashboard").classList.add("hidden");
  $("#app").classList.remove("hidden");$(".footer").classList.remove("hidden");
  $("#returnDashboard").classList.toggle("hidden",!state.user);
  $("#returnDashboard").onclick=showDashboard;
  window.scrollTo(0,0);loadJobs();
}
async function showDashboard(){
  document.body.dataset.entry="dashboard"; $("#roleGate").classList.add("hidden");$("#rolePortal").classList.add("hidden");$("#app").classList.add("hidden");$(".footer").classList.add("hidden");const shell=$("#dashboard");shell.classList.remove("hidden");
  const role=state.user.role;
  const nav=role==="seeker"?["Overview","Find jobs","My applications","Saved jobs","Qualifications","Interviews","My profile"]:role==="employer"?["Overview","My job posts","Post a job","Applications","Interviews","Company profile"]:["Overview","Users","Reports"];
  shell.innerHTML=`<div class="dash-layout"><aside class="sidebar"><div class="side-user"><strong>${esc(state.user.full_name)}</strong><small>${role === "seeker" ? "Candidate / Applicant" : role === "employer" ? "Employer / Recruiter" : "Administrator"} account</small></div><div class="side-nav">${nav.map((n,i)=>`<button class="${i===0?"active":""}" data-page="${n}">${["◈","⌕","▤","♡","◷","◎"][i]||"◈"} &nbsp; ${n}</button>`).join("")}<button id="homeBtn">⌕ &nbsp; Public job board</button><button id="workspaceBtn">⇄ &nbsp; Switch workspace</button><button id="logoutBtn">↪ &nbsp; Log out</button></div></aside><section class="dash-main"><div id="dashContent"></div></section></div>`;
  $("#logoutBtn").onclick=logout;$("#homeBtn").onclick=showHome;$("#workspaceBtn").onclick=logout;
  $$(".side-nav [data-page]").forEach(b=>b.onclick=()=>{ $$(".side-nav [data-page]").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderPage(b.dataset.page);});
  await renderPage("Overview");
}
async function renderPage(page){
  const el=$("#dashContent");el.innerHTML='<div class="empty-state">Loading…</div>';
  try{
    if(page==="Overview"){const d=await api("/dashboard");const labels=Object.keys(d);el.innerHTML=`<div class="dash-head"><div><h1>Good to see you, ${esc(state.user.full_name.split(" ")[0])}.</h1><p>Here's what's happening with your ${state.user.role==="seeker"?"career journey":"recruitment"} today.</p></div><button class="btn btn-primary" id="dashAction">${state.user.role==="employer"?"＋ Post a job":"⌕ Explore jobs"}</button></div><div class="stat-grid">${labels.map((k)=>`<div class="stat-card"><span>${k.replace(/_/g," ")}</span><strong>${d[k]}</strong></div>`).join("")}</div><div class="panel"><h3>Your HireSphere snapshot</h3><p style="color:var(--muted);font-size:12px;line-height:1.8">Keep your profile up to date, explore relevant opportunities and check your dashboard regularly for new activity.</p></div>`;$("#dashAction").onclick=()=>renderPage(state.user.role==="employer"?"Post a job":"Find jobs");}
    else if(page==="Find jobs"){el.innerHTML=`<div class="dash-head"><div><h1>Explore opportunities</h1><p>Search roles that match your next move.</p></div></div><div class="search-panel"><label class="search-field"><input id="dashQ" placeholder="Title or skill"></label><label class="search-field"><input id="dashLoc" placeholder="Location"></label><button class="btn btn-primary" id="dashSearch">Search</button></div><div id="dashJobs" class="job-grid" style="margin-top:18px"></div>`;const load=async()=>{const p=new URLSearchParams({q:$("#dashQ").value,location:$("#dashLoc").value});const rows=await api("/jobs?"+p);$("#dashJobs").innerHTML=rows.map(j=>`<div class="job-card"><h3>${esc(j.title)}</h3><div class="job-company">${esc(j.company_name)} · ${esc(j.location)}</div><p>${esc(j.work_mode)} · ${esc(j.employment_type)}</p><button class="job-open" data-job="${j.job_id}">View role →</button></div>`).join("")||'<div class="empty-state">No jobs found.</div>';};$("#dashSearch").onclick=load;await load();}
    else if(page==="My applications"){const rows=await api("/my-applications");el.innerHTML=`<div class="dash-head"><div><h1>My applications</h1><p>Follow every step of your job search.</p></div></div><div class="panel"><table class="data-table"><thead><tr><th>Role</th><th>Company</th><th>Applied</th><th>Status</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.title)}</td><td>${esc(a.company_name)}</td><td>${new Date(a.applied_at).toLocaleDateString()}</td><td><span class="status-pill">${esc(a.status)}</span></td></tr>`).join("")}</tbody></table></div>`;}
    else if(page==="Qualifications"){
      const [rows,catalog]=await Promise.all([api("/my-qualifications"),api("/qualifications")]);
      const options=catalog.map(q=>`<option value="${q.qualification_id}">${esc(q.qualification_name)}</option>`).join("");
      el.innerHTML=`<div class="dash-head"><div><h1>My qualifications</h1><p>Add and maintain your education details. Employers can view these details only when you apply to their jobs.</p></div></div>
      <div class="panel"><h3>Add a qualification</h3><form id="qualificationForm" class="dash-form">
        <label>Qualification<select name="qualification_id" required><option value="">Choose qualification</option>${options}</select></label>
        <label>Institution / University<input name="institution" required maxlength="150" placeholder="College or university name"></label>
        <label>Passing year<input name="passing_year" type="number" min="1950" max="${new Date().getFullYear()+8}" placeholder="2026"></label>
        <label>Percentage / score<input name="percentage" type="number" min="0" max="100" step="0.01" placeholder="e.g. 85.50"></label>
        <div class="wide"><button class="btn btn-primary">＋ Add qualification</button></div></form></div>
      <div class="panel" style="margin-top:18px"><h3>Saved education records</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Qualification</th><th>Institution</th><th>Year</th><th>Score</th><th>Action</th></tr></thead><tbody>${rows.map(q=>`<tr><td>${esc(q.qualification_name)}</td><td>${esc(q.institution)}</td><td>${q.passing_year||"—"}</td><td>${q.percentage==null?"—":esc(q.percentage)+"%"}</td><td><div class="inline-actions"><button class="small-btn" data-edit-qualification="${q.qualification_id}" data-institution="${esc(q.institution)}" data-name="${esc(q.qualification_name)}" data-year="${q.passing_year||''}" data-percentage="${q.percentage??''}">Edit</button><button class="small-btn" data-remove-qualification="${q.qualification_id}" data-institution="${esc(q.institution)}">Remove</button></div></td></tr>`).join("")||'<tr><td colspan="5">No qualifications added yet.</td></tr>'}</tbody></table></div></div>`;
      $("#qualificationForm").onsubmit=async e=>{e.preventDefault();try{await api("/my-qualifications",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast("Qualification added.");renderPage("Qualifications");}catch(err){toast(err.message);}};
      $$('[data-edit-qualification]').forEach(btn=>btn.onclick=()=>{
        const selected=catalog.find(q=>q.qualification_name===btn.dataset.name);
        $("#modalBackdrop").classList.remove("hidden");
        $("#modalContent").innerHTML=`<h2>Edit qualification</h2><form id="editQualificationForm" class="form-stack"><label>Qualification<select name="qualification_id" disabled><option>${esc(btn.dataset.name)}</option></select></label><label>Institution / University<input name="institution" required maxlength="150" value="${esc(btn.dataset.institution)}"></label><label>Passing year<input name="passing_year" type="number" min="1950" max="${new Date().getFullYear()+8}" value="${esc(btn.dataset.year)}"></label><label>Percentage / score<input name="percentage" type="number" min="0" max="100" step="0.01" value="${esc(btn.dataset.percentage)}"></label><button class="btn btn-primary full">Save changes</button></form>`;
        $("#editQualificationForm").onsubmit=async e=>{e.preventDefault();const payload=Object.fromEntries(new FormData(e.currentTarget));payload.old_institution=btn.dataset.institution;try{await api(`/my-qualifications/${btn.dataset.editQualification}`,{method:"PUT",body:JSON.stringify(payload)});closeModal();toast("Qualification updated.");renderPage("Qualifications");}catch(err){toast(err.message);}};
      });
      $$('[data-remove-qualification]').forEach(btn=>btn.onclick=async()=>{if(!confirm("Remove this qualification from your profile?"))return;try{await api(`/my-qualifications/${btn.dataset.removeQualification}`,{method:"DELETE",body:JSON.stringify({institution:btn.dataset.institution})});toast("Qualification removed.");renderPage("Qualifications");}catch(err){toast(err.message);}});
    }
    else if(page==="Saved jobs"){const rows=await api("/saved-jobs");el.innerHTML=`<div class="dash-head"><div><h1>Saved jobs</h1><p>Roles you want to come back to.</p></div></div><div class="job-grid">${rows.map(j=>`<article class="job-card"><h3>${esc(j.title)}</h3><div class="job-company">${esc(j.company_name)}</div><div class="job-meta"><span>${esc(j.location)}</span><span>${esc(j.work_mode)}</span></div><button class="job-open" data-job="${j.job_id}">View role →</button></article>`).join("")||'<div class="empty-state">You have not saved any jobs yet.</div>'}</div>`;}
    else if(page==="My job posts"){
      const rows=await api("/employer/jobs");
      el.innerHTML=`<div class="dash-head"><div><h1>Your job posts</h1><p>Manage the opportunities published by your company.</p></div><button class="btn btn-primary" id="newJob">＋ Post a job</button></div>
      <div class="panel"><table class="data-table"><thead><tr><th>Job</th><th>Applicants</th><th>Type</th><th>Status</th><th>Manage</th></tr></thead><tbody>
      ${rows.map(j=>`<tr><td><strong>${esc(j.title)}</strong><br><small>${esc(j.location||"Flexible")}</small></td><td>${j.applicant_count}</td><td>${esc(j.employment_type)}</td><td><span class="status-pill">${esc(j.status)}</span></td><td><div class="inline-actions"><select class="small-btn job-status" data-job-status="${j.job_id}"><option value="Open" ${j.status==="Open"?"selected":""}>Open</option><option value="Paused" ${j.status==="Paused"?"selected":""}>Paused</option><option value="Closed" ${j.status==="Closed"?"selected":""}>Closed</option></select><button class="small-btn" data-delete-job="${j.job_id}">Delete</button></div></td></tr>`).join("")||`<tr><td colspan="5">You haven't posted any jobs yet. Select “Post a job” to publish your first opportunity.</td></tr>`}</tbody></table></div>`;
      $("#newJob").onclick=()=>renderPage("Post a job");
      $$("[data-job-status]").forEach(sel=>sel.onchange=async()=>{try{await api(`/jobs/${sel.dataset.jobStatus}`,{method:"PUT",body:JSON.stringify({status:sel.value})});toast("Job status updated.");renderPage("My job posts");}catch(err){toast(err.message);}});
      $$("[data-delete-job]").forEach(btn=>btn.onclick=async()=>{if(!confirm("Delete this job post and its applications?"))return;try{await api(`/jobs/${btn.dataset.deleteJob}`,{method:"DELETE"});toast("Job post deleted.");renderPage("My job posts");}catch(err){toast(err.message);}});
    }
    else if(page==="Post a job"){const cats=await api("/categories");el.innerHTML=`<div class="dash-head"><div><h1>Publish an opportunity</h1><p>Tell candidates why this role matters.</p></div></div><div class="panel"><form id="jobForm" class="dash-form">
      <label>Job title<input name="title" required placeholder="e.g. Frontend Developer"></label>
      <label>Category<select name="category_id"><option value="">Choose category</option>${cats.map(c=>`<option value="${c.category_id}">${esc(c.category_name)}</option>`).join("")}</select></label>
      <label>Location<input name="location" placeholder="Bengaluru / Remote"></label>
      <label>Work mode<select name="work_mode"><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label>
      <label>Employment type<select name="employment_type"><option>Full-time</option><option>Part-time</option><option>Internship</option><option>Contract</option></select></label>
      <label>Experience level<input name="experience_level" placeholder="Fresher / 2+ years"></label>
      <label>Minimum salary (annual INR)<input name="min_salary" type="number" min="0"></label>
      <label>Maximum salary (annual INR)<input name="max_salary" type="number" min="0"></label>
      <label>Application deadline<input name="deadline" type="date"></label>
      <label class="wide">Job description<textarea name="description" rows="4" required placeholder="Describe the role, team and impact…"></textarea></label>
      <label class="wide">Requirements<textarea name="requirements" rows="3" placeholder="Skills, experience and qualifications…"></textarea></label>
      <div class="wide"><button class="btn btn-primary">Publish job ↗</button></div></form></div>`;$("#jobForm").onsubmit=async e=>{e.preventDefault();try{await api("/jobs",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast("Job published successfully.");renderPage("My job posts");}catch(err){toast(err.message);}};}
    else if(page==="Applications"){
      const rows=await api("/employer/applications");
      el.innerHTML=`<div class="dash-head"><div><h1>Candidate applications</h1><p>Review candidates, update their progress and schedule interviews.</p></div></div><div class="panel"><table class="data-table"><thead><tr><th>Candidate</th><th>Role</th><th>Experience</th><th>Status</th><th>Update</th><th>Resume</th><th>Education</th><th>Interview</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(a.full_name)}<br><small>${esc(a.email)}</small></td><td>${esc(a.title)}</td><td>${a.experience_years||0} yrs</td><td><span class="status-pill">${esc(a.status)}</span></td><td><select class="status-select small-btn" data-app="${a.application_id}"><option>${esc(a.status)}</option>${["Under Review","Shortlisted","Interview","Selected","Rejected"].filter(x=>x!==a.status).map(x=>`<option>${x}</option>`).join("")}</select></td><td>${a.resume_available?`<a class="text-link" href="/api/applications/${a.application_id}/resume">Download</a>`:"Not provided"}</td><td><button class="small-btn" data-view-qualifications="${a.application_id}" data-candidate="${esc(a.full_name)}">View</button></td><td><button class="small-btn" data-schedule="${a.application_id}" data-candidate="${esc(a.full_name)}">Schedule</button></td></tr>`).join("")||`<tr><td colspan="8">No applications have been received yet. Published jobs will appear here when candidates apply.</td></tr>`}</tbody></table></div>`;
      $$('[data-view-qualifications]').forEach(btn=>btn.onclick=async()=>{try{const qs=await api(`/applications/${btn.dataset.viewQualifications}/qualifications`);$("#modalBackdrop").classList.remove("hidden");$("#modalContent").innerHTML=`<h2>Education details</h2><p>Qualifications shared by ${esc(btn.dataset.candidate)} through their application.</p><div class="panel"><table class="data-table"><thead><tr><th>Qualification</th><th>Institution</th><th>Year</th><th>Score</th></tr></thead><tbody>${qs.map(q=>`<tr><td>${esc(q.qualification_name)}</td><td>${esc(q.institution)}</td><td>${q.passing_year||"—"}</td><td>${q.percentage==null?"—":esc(q.percentage)+"%"}</td></tr>`).join("")||'<tr><td colspan="4">No qualifications provided.</td></tr>'}</tbody></table></div>`;}catch(err){toast(err.message);}});
      $$(".status-select").forEach(sel=>sel.onchange=async()=>{try{await api(`/applications/${sel.dataset.app}/status`,{method:"PATCH",body:JSON.stringify({status:sel.value})});toast("Candidate status updated.");renderPage("Applications");}catch(err){toast(err.message);}});
      $$('[data-schedule]').forEach(btn=>btn.onclick=()=>{
        const appId=btn.dataset.schedule;
        $("#modalBackdrop").classList.remove("hidden");
        $("#modalContent").innerHTML=`<h2>Schedule an interview</h2><p>Set up the next conversation with ${esc(btn.dataset.candidate)}.</p><form id="interviewForm" class="form-stack"><label>Date and time<input name="scheduled_at" type="datetime-local" required></label><label>Interview mode<select name="mode"><option>Online</option><option>In-person</option><option>Phone</option></select></label><label>Meeting link (if online)<input name="meeting_link" placeholder="https://..."></label><label>Location (if in-person)<input name="location" placeholder="Office address"></label><label>Notes<textarea name="notes" rows="3" placeholder="Topics or instructions for the candidate"></textarea></label><button class="btn btn-primary full">Confirm interview</button></form>`;
        $("#interviewForm").onsubmit=async e=>{e.preventDefault();try{const payload=Object.fromEntries(new FormData(e.currentTarget));await api(`/applications/${appId}/interviews`,{method:"POST",body:JSON.stringify(payload)});closeModal();toast("Interview scheduled successfully.");renderPage("Applications");}catch(err){toast(err.message);}};
      });
    }
    else if(page==="Interviews"){
      const rows=await api("/my-interviews");
      const employer=state.user.role==="employer";
      el.innerHTML=`<div class="dash-head"><div><h1>Interview calendar</h1><p>${employer?"Review and update interviews for your applicants.":"Your scheduled conversations and interview details."}</p></div></div><div class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Role</th><th>Company</th><th>Candidate</th><th>Schedule</th><th>Mode</th><th>Status</th>${employer?"<th>Manage</th>":""}</tr></thead><tbody>${rows.map(i=>`<tr><td>${esc(i.title)}</td><td>${esc(i.company_name)}</td><td>${esc(i.seeker_name)}</td><td>${new Date(i.scheduled_at).toLocaleString()}</td><td>${esc(i.mode)}</td><td><span class="status-pill">${esc(i.status)}</span></td>${employer?`<td><select class="small-btn interview-status" data-interview="${i.interview_id}"><option value="Scheduled" ${i.status==="Scheduled"?"selected":""}>Scheduled</option><option value="Completed" ${i.status==="Completed"?"selected":""}>Completed</option><option value="Cancelled" ${i.status==="Cancelled"?"selected":""}>Cancelled</option></select></td>`:""}</tr>`).join("")||`<tr><td colspan="${employer?7:6}">No interviews scheduled yet.</td></tr>`}</tbody></table></div></div>`;
      $$(".interview-status").forEach(sel=>sel.onchange=async()=>{try{await api(`/interviews/${sel.dataset.interview}/status`,{method:"PATCH",body:JSON.stringify({status:sel.value})});toast("Interview status updated.");renderPage("Interviews");}catch(err){toast(err.message);}});
    }
    else if(page==="My profile"||page==="Company profile"){const d=await api("/me");const p=d.profile;const seeker=state.user.role==="seeker";el.innerHTML=`<div class="dash-head"><div><h1>${page}</h1><p>Keep your information current.</p></div></div><div class="panel"><form id="profileForm" class="dash-form">
      ${seeker?`<label>Phone<input name="phone" value="${esc(p.phone)}"></label><label>Location<input name="location" value="${esc(p.location)}"></label><label>Headline<input name="headline" value="${esc(p.headline)}"></label><label>Experience (years)<input name="experience_years" type="number" min="0" step=".5" value="${p.experience_years||0}"></label><label class="wide">About you<textarea name="bio" rows="4">${esc(p.bio)}</textarea></label>`:`<label>Company name<input name="company_name" required value="${esc(p.company_name)}"></label><label>Industry<input name="industry" value="${esc(p.industry)}"></label><label>Location<input name="location" value="${esc(p.location)}"></label><label>Website<input name="website" value="${esc(p.website)}"></label><label class="wide">Company description<textarea name="description" rows="4">${esc(p.description)}</textarea></label>`}
      <div class="wide"><button class="btn btn-primary">Save profile</button></div></form>${seeker?`<hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><form id="resumeForm"><label style="font-size:11px;color:var(--muted)">Upload resume (PDF, DOC, DOCX; max 5 MB)<br><input type="file" name="resume" accept=".pdf,.doc,.docx" required style="margin:12px 0"></label><button class="btn btn-primary">Upload resume</button>${p.resume_available?` <a class="text-link" href="/api/profile/resume">Download current resume</a>`:""}</form>`:""}</div>`;
      $("#profileForm").onsubmit=async e=>{e.preventDefault();try{await api("/profile",{method:"PUT",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast("Profile saved.");}catch(err){toast(err.message);}};
      if(seeker)$("#resumeForm").onsubmit=async e=>{e.preventDefault();try{const fd=new FormData(e.currentTarget);await api("/profile/resume",{method:"POST",body:fd});toast("Resume uploaded.");renderPage(page);}catch(err){toast(err.message);}};
    }
    else if(page==="Users"){const rows=await api("/admin/users");el.innerHTML=`<div class="dash-head"><div><h1>Platform users</h1><p>Manage registered accounts.</p></div></div><div class="panel"><table class="data-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Account</th><th>Action</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${u.is_active?"Active":"Disabled"}</td><td><button class="small-btn" data-user="${u.user_id}" data-active="${u.is_active?0:1}">${u.is_active?"Disable":"Enable"}</button></td></tr>`).join("")}</tbody></table></div>`;$$("[data-user]").forEach(b=>b.onclick=async()=>{await api(`/admin/users/${b.dataset.user}/active`,{method:"PATCH",body:JSON.stringify({is_active:!!Number(b.dataset.active)})});renderPage("Users");});}
    else if(page==="Reports"){const d=await api("/admin/reports");el.innerHTML=`<div class="dash-head"><div><h1>Platform reports</h1><p>Application and category overview.</p></div></div><div class="panel"><h3>Applications by status</h3>${d.byStatus.map(x=>`<p>${esc(x.status)} <strong style="float:right">${x.total}</strong></p>`).join("")||"No applications yet."}</div><div class="panel"><h3>Jobs by category</h3>${d.byCategory.map(x=>`<p>${esc(x.category_name)} <strong style="float:right">${x.total}</strong></p>`).join("")}</div>`;}
  }catch(err){el.innerHTML=`<div class="empty-state">${esc(err.message)}</div>`;}
}
async function logout(){try{await api("/auth/logout",{method:"POST"});}catch{}state.user=null;showRoleGate();toast("You have logged out.");}
document.addEventListener("click",e=>{
  const roleChoice=e.target.closest("[data-role-choice]");if(roleChoice){showRolePortal(roleChoice.dataset.roleChoice);return;}
  const navLink=e.target.closest(".nav-links a");if(navLink)$(".nav-links").classList.remove("open");
  const open=e.target.closest("[data-open]");if(open)openModal(open.dataset.open,open.dataset.role||"seeker");
  const sw=e.target.closest("[data-switch]");if(sw)openModal(sw.dataset.switch);
  const job=e.target.closest("[data-job]");if(job)showJob(job.dataset.job);
  const save=e.target.closest("[data-save]");if(save){if(!state.user){openModal("login");return;}api(`/jobs/${save.dataset.save}/save`,{method:"POST"}).then(()=>toast("Job saved.")).catch(err=>toast(err.message));}
  const chip=e.target.closest("[data-search]");if(chip){$("#searchQuery").value=chip.dataset.search;loadJobs();$("#jobs").scrollIntoView();}
});
$("#modalClose").onclick=closeModal;$("#modalBackdrop").onclick=e=>{if(e.target.id==="modalBackdrop")closeModal();};
$("#searchBtn").onclick=loadJobs;$("#viewAllJobs").onclick=()=>setTimeout(loadJobs,50);
$("#themeToggle").onclick=()=>{const dark=document.documentElement.dataset.theme!=="dark";document.documentElement.dataset.theme=dark?"dark":"light";localStorage.setItem("hs_theme",dark?"dark":"light");$("#themeToggle").textContent=dark?"☀":"☾";};
$("#menuToggle").onclick=()=>$(".nav-links").classList.toggle("open");
$("#workspaceNav").onclick=(e)=>{e.preventDefault();if(state.user){toast("Log out first to switch accounts.");return;}showRoleGate();};
$("#year").textContent=new Date().getFullYear();
const savedTheme=localStorage.getItem("hs_theme")||"light";document.documentElement.dataset.theme=savedTheme;$("#themeToggle").textContent=savedTheme==="dark"?"☀":"☾";
(async()=>{
  try {
    const current = await api("/me");
    state.user = current.user;
    state.entryRole = state.user.role;
    showDashboard();
  } catch {
    state.user = null;
    showRoleGate();
  }
})();
