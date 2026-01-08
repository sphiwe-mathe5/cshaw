document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Sidebar Navigation Logic ---
    const mainContent = document.getElementById('mainContent');
    const linkActivities = document.getElementById('link-activities');
    const linkStudents = document.getElementById('link-manage-students');

    const linkCreateEvent = document.getElementById('link-create-event');
    const navItemCreateEvent = document.getElementById('nav-item-create-event');
    
    const navItemActivities = document.getElementById('nav-item-activities');
    const navItemStudents = document.getElementById('nav-item-students');

    // Sidebar Toggle
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const overlay = document.getElementById('sidebarOverlay'); // Get the overlay
    
    // Toggle Function
    function toggleSidebar() {
        sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active');
    }

    // Close Function (for clicking links or overlay)
    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    // A. Click Hamburger Button
    if(toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent immediate closing
            toggleSidebar();
        });
    }

    // B. Click Overlay (Close menu)
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // C. Click any Nav Link (Auto-close on mobile)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            // Only close if we are on mobile (check window width)
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });

    const linkSettings = document.getElementById('link-settings');
    const navItemSettings = document.getElementById('nav-item-settings');

    if (linkSettings) {
        linkSettings.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemSettings);
            renderSettings();
        });
    }

    const linkStats = document.getElementById('link-stats');
    const navItemStats = document.getElementById('nav-item-stats');

    if (linkStats) {
        linkStats.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemStats);
            renderStudentStats();
        });
    }

    // CLICK: Volunteer Activities
    if (linkActivities) {
        linkActivities.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemActivities);
            renderActivities();
        });
    }

    // CLICK: Manage Students
    if (linkStudents) {
        linkStudents.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemStudents);
            renderStudentTable();
        });
    }

    // CLICK: Create Event (New)
    if (linkCreateEvent) {
        linkCreateEvent.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemCreateEvent);
            renderCreateEventForm();
        });
    }

    function setActiveNav(activeItem) {
        // Remove active class from all items
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        // Add to clicked
        if(activeItem) activeItem.classList.add('active');
    }


    // 1. Render Activities (List View)
    async function renderActivities() {
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>Volunteer Activities</h1>
                <p>Find your next opportunity.</p>
            </div>
            <div class="loader"></div>
        `;

        try {
            const response = await fetch('/api/activities/');
            if (!response.ok) throw new Error('Failed to load events');
            const activities = await response.json();

            if (activities.length === 0) {
                mainContent.innerHTML = `
                    <div class="header-section"><h1>Volunteer Activities</h1><p>Find your next opportunity.</p></div>
                    <div class="cards-grid">
                        <p style="grid-column: 1/-1; text-align: center; color: #7F8C8D;">No upcoming events found. Check back later!</p>
                    </div>`;
                return;
            }

            // Build HTML
            let cardsHtml = '';
            activities.forEach(activity => {
                const imageStyle = activity.image 
                    ? `background-image: url('${activity.image}'); background-size: cover; background-position: center;` 
                    : `background-color: #BDC3C7; display: flex; align-items: center; justify-content: center; content: 'No Image'; color: white;`;

                const dateObj = new Date(activity.date_time);
                const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const spotsColor = activity.spots_left > 5 ? '#27ae60' : '#e74c3c';

                // Note: We add a unique ID to the button to attach the listener later
                cardsHtml += `
                    <div class="card">
                        <div class="card-image" style="${imageStyle}"></div>
                        <div class="card-body">
                            <div style="display:flex; justify-content:space-between; align-items:start;">
                                <span class="card-badge">${activity.campus} Campus</span>
                                <span style="font-size:0.8rem; font-weight:700; color:${spotsColor};">
                                    ${activity.spots_left} spots left
                                </span>
                            </div>
                            <h3>${activity.title}</h3>
                            <p style="font-size: 0.85rem; color: #95a5a6; margin-bottom: 10px;">
                                📅 ${dateStr} at ${timeStr} <br>
                                ⏳ ${activity.duration_hours} Hours
                            </p>
                            <p>${activity.description}</p>
                            <button id="view-btn-${activity.id}" class="btn-card-action">View Details</button>
                        </div>
                    </div>
                `;
            });

            // Inject HTML
            mainContent.innerHTML = `
                <div class="header-section">
                    <h1>Volunteer Activities</h1>
                    <p>Find your next opportunity.</p>
                </div>
                <div class="cards-grid">${cardsHtml}</div>
            `;

            // Attach Event Listeners (This passes the specific activity object to the next view)
            activities.forEach(activity => {
                document.getElementById(`view-btn-${activity.id}`).addEventListener('click', () => {
                    renderActivityDetails(activity);
                });
            });

        } catch (error) {
            console.error(error);
            mainContent.innerHTML = `<div class="header-section"><h1>Error</h1><p>Could not load activities.</p></div>`;
        }
    }

    // 2. Render Activity Details (Single View)
    function renderActivityDetails(activity) {
        // Prepare Data
        const imageStyle = activity.image 
            ? `background-image: url('${activity.image}'); background-size: cover; background-position: center; height: 300px;` 
            : `background-color: #BDC3C7; height: 300px; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem;`;

        const dateObj = new Date(activity.date_time);
        const fullDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        mainContent.innerHTML = `
            <button id="backToActivities" style="background:none; border:none; cursor:pointer; color:#7F8C8D; font-weight:600; margin-bottom:20px; display:flex; align-items:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" style="fill:#7F8C8D; margin-right:5px;"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                Back to Activities
            </button>

            <div style="background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                <div style="${imageStyle}"></div>
                
                <div style="padding: 40px;">
                    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:20px; margin-bottom:20px;">
                        <div>
                            <span class="card-badge" style="font-size:0.9rem;">${activity.campus} Campus</span>
                            <h1 style="margin-top:10px; font-size:2rem; color:var(--text-main);">${activity.title}</h1>
                            <p style="color:#7F8C8D; margin-top:5px;">
                                📅 ${fullDate} &nbsp;|&nbsp; ⏰ ${timeStr} &nbsp;|&nbsp; ⏳ ${activity.duration_hours} Hours
                            </p>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:1.5rem; font-weight:700; color:var(--primary-orange);">${activity.spots_left}</div>
                            <div style="color:#7F8C8D; font-size:0.9rem;">Spots Remaining</div>
                        </div>
                    </div>

                    <hr style="border:0; border-top:1px solid #eee; margin:20px 0;">

                    <h3 style="margin-bottom:10px; color:var(--text-main);">About this Event</h3>
                    <p style="line-height:1.8; color:#4a4a4a; margin-bottom:30px;">
                        ${activity.details || activity.description}
                    </p>

                    ${activity.additional_details ? `
                        <div style="background:#FFF4EC; padding:20px; border-radius:8px; margin-bottom:30px;">
                            <h4 style="margin-bottom:5px; color:#E87A30;">ℹ️ Important Information</h4>
                            <p style="color:#555;">${activity.additional_details}</p>
                        </div>
                    ` : ''}

                    <button id="signupBtn" class="btn-submit" style="width:auto; padding: 15px 40px; font-size:1.1rem;">
                        RSVP for Event
                    </button>
                </div>
            </div>
        `;

        // Attach Event Listeners
        document.getElementById('backToActivities').addEventListener('click', () => {
            renderActivities(); // Go back to the grid
        });

        document.getElementById('signupBtn').addEventListener('click', () => {
            // Open the new modal instead of alerting
            openSignupModal(activity);
        });
    }

    async function renderAttendanceSheet(activityId, activityTitle) {
        mainContent.innerHTML = `
            <div class="header-section">
                <button id="backToManage" style="background:none; border:none; color:#666; cursor:pointer; margin-bottom:10px; font-weight: 500;">
                    &larr; Back to Events
                </button>
                <h1>Attendance Sheet</h1>
                <p style="color: var(--primary-orange); font-weight:600;">${activityTitle}</p>
            </div>
            
            <div class="attendance-container">
                <div class="table-scroll-wrapper">
                    <table class="attendance-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Time Logged</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="attendanceTableBody">
                            <tr><td colspan="5" style="padding:20px; text-align:center;">Loading RSVPs...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('backToManage').addEventListener('click', renderCreateEventForm);

        try {
            const response = await fetch(`/api/activities/${activityId}/rsvps/`);
            const rsvps = await response.json();
            const tbody = document.getElementById('attendanceTableBody');
            
            if (rsvps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#999;">No students have RSVPed yet.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            rsvps.forEach(rsvp => {
                // Determine Status and Button
                let statusBadge = '<span style="background:#f1f1f1; padding:4px 10px; border-radius:12px; color:#666; font-size:0.85rem;">Pending</span>';
                let actionBtn = `<button class="btn-signin" data-id="${rsvp.id}" style="padding:6px 16px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600;">Sign In</button>`;
                let timeLog = '<span style="color:#ccc;">--:--</span>';

                if (rsvp.sign_in_time && !rsvp.sign_out_time) {
                    // Currently Signed In
                    const signInTime = new Date(rsvp.sign_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    statusBadge = '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 10px; border-radius:12px; font-size:0.85rem;">● In Progress</span>';
                    timeLog = `<span style="color:#2e7d32; font-weight:600;">In: ${signInTime}</span>`;
                    actionBtn = `<button class="btn-signout" data-id="${rsvp.id}" style="padding:6px 16px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600;">Sign Out</button>`;
                } 
                else if (rsvp.sign_out_time) {
                    // Completed
                    statusBadge = '<span style="background:#e3f2fd; color:#1565c0; padding:4px 10px; border-radius:12px; font-size:0.85rem;">✓ Completed</span>';
                    timeLog = `<strong>${rsvp.hours_earned} Hrs</strong>`;
                    actionBtn = `<span style="color:#27ae60; font-weight:bold; font-size:1.2rem;">✓</span>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="font-weight: 600; color: var(--text-main);">${rsvp.student_name} ${rsvp.student_surname}</div>
                        <div style="font-size: 0.8rem; color: #888;">${rsvp.student_email}</div>
                    </td>
                    <td>${rsvp.role_name || 'General'}</td>
                    <td>${statusBadge}</td>
                    <td>${timeLog}</td>
                    <td style="text-align: right;">${actionBtn}</td>
                `;
                tbody.appendChild(tr);
            });

            // Attach Listeners
            document.querySelectorAll('.btn-signin').forEach(btn => {
                btn.addEventListener('click', () => handleAttendance(btn.dataset.id, 'signin', activityId, activityTitle));
            });
            document.querySelectorAll('.btn-signout').forEach(btn => {
                btn.addEventListener('click', () => handleAttendance(btn.dataset.id, 'signout', activityId, activityTitle));
            });

        } catch (err) {
            console.error(err);
            document.getElementById('attendanceTableBody').innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading data.</td></tr>';
        }
    }

    async function renderStudentStats() {
        // Initial Loader
        mainContent.innerHTML = `<div class="loader"></div>`;

        try {
            const response = await fetch('/api/users/stats/');
            const data = await response.json();

            // 1. Build Monthly Rows
            let monthlyHtml = '';
            if (data.monthly.length === 0) {
                monthlyHtml = '<p style="color:#999; text-align:center;">No activity yet.</p>';
            } else {
                data.monthly.forEach(m => {
                    monthlyHtml += `
                        <div class="stat-list-item">
                            <span class="stat-label">${m.name}</span>
                            <span class="stat-val">${m.hours} hrs</span>
                        </div>
                    `;
                });
            }

            // 2. Build Events Rows
            let eventsHtml = '';
            if (data.history.length === 0) {
                eventsHtml = '<p style="color:#999; text-align:center;">No events attended.</p>';
            } else {
                data.history.forEach((e, index) => {
                    eventsHtml += `
                        <div class="stat-list-item">
                            <span class="stat-label">${index + 1}. ${e.title}</span>
                            <span class="stat-val" style="font-size:0.85rem; color:#27ae60;">Done</span>
                        </div>
                    `;
                });
            }

            // 3. Render The Dashboard
            mainContent.innerHTML = `
                <div class="stats-hero">
                    <div class="hero-content">
                        <div style="width: 80px; height: 80px; background: white; border-radius: 50%; display:flex; align-items:center; justify-content:center; color: #1a1a2e; font-weight:800; font-size: 2rem; border: 4px solid #FF8C42; flex-shrink: 0;">
                            ME
                        </div>
                        
                        <div class="hero-number">${data.total_hours}</div>
                        
                        <div class="hero-text" style="flex-grow: 1;">
                            <h2>Volunteering Hours</h2>
                            <p>${data.motivation}</p>
                            
                            <div class="progress-container">
                                <div class="progress-fill" style="width: ${data.progress_percent}%;"></div>
                            </div>
                            <div class="progress-label">
                                ${data.remaining <= 0 ? "Goal Complete!" : `${data.remaining} Hours away from ${data.target} Hours`}
                            </div>
                        </div>
                    </div>
                    
                    <div class="hero-decoration" style="position: absolute; right: 40px; bottom: 40px; display: flex; align-items: flex-end; gap: 10px; opacity: 0.8;">
                        <div style="width: 20px; height: 40px; background: #FF8C42; border-radius: 4px;"></div>
                        <div style="width: 20px; height: 70px; background: #FF8C42; border-radius: 4px;"></div>
                        <div style="width: 20px; height: 50px; background: #4ecdc4; border-radius: 4px;"></div>
                        <div style="width: 20px; height: 90px; background: #4ecdc4; border-radius: 4px;"></div>
                    </div>
                </div>

                <div class="stats-grid">
                    
                    <div class="stat-card">
                        <h3>Monthly Hours</h3>
                        ${monthlyHtml}
                    </div>

                    <div class="stat-card">
                        <h3>Events You Attended</h3>
                        ${eventsHtml}
                    </div>

                    <div class="stat-card">
                        <h3>Achievements</h3>
                        
                        <div class="stat-list-item">
                            <span class="stat-label">Most Hours</span>
                            <span class="stat-val">(${data.total_hours})</span>
                        </div>
                        
                        <div class="stat-list-item">
                            <span class="stat-label">Total Events</span>
                            <span class="stat-val">${data.events_count}</span>
                        </div>

                        <div style="text-align: center; margin-top: 20px;">
                            <div style="font-size: 3rem;">🏅</div>
                            <div class="rank-badge">Current Rank: Position ${data.rank}</div>
                            <p style="font-size: 0.8rem; color: #999; margin-top: 5px;">Overall Leaderboard</p>
                        </div>
                    </div>

                </div>
            `;

        } catch (err) {
            console.error(err);
            mainContent.innerHTML = `<div class="header-section"><h1>Error</h1><p>Could not load stats.</p></div>`;
        }
    }

    async function renderSettings() {
        mainContent.innerHTML = `<div class="loader"></div>`;

        try {
            const response = await fetch('/api/users/profile/');
            const user = await response.json();

            // Helper to check campus selection
            const isSelected = (val) => user.campus === val ? 'selected' : '';


            mainContent.innerHTML = `
                <div class="header-section">
                    <h1>Profile & Settings</h1>
                    <p>Manage your account details and preferences.</p>
                </div>

                <div class="profile-section">
                    <h3>Personal Information</h3>
                    <form id="profileForm">
                        
                        <div class="form-group form-row">
                            <div>
                                <label>Role</label>
                                <input type="text" value="${user.role_label}" disabled>
                            </div>
                            <div>
                                <label>Student / Staff Number</label>
                                <input type="text" value="${user.student_number || 'N/A'}" disabled>
                            </div>
                        </div>

                        <div class="form-group form-row">
                            <div>
                                <label>First Name</label>
                                <input type="text" name="first_name" value="${user.first_name}" required>
                            </div>
                            <div>
                                <label>Last Name</label>
                                <input type="text" name="last_name" value="${user.last_name}" required>
                            </div>
                        </div>

                        <div class="form-group form-row">
                            <div>
                                <label>Campus</label>
                                <select name="campus">
                                    <option value="APB" ${isSelected('APB')}>APB Campus</option>
                                    <option value="DFC" ${isSelected('DFC')}>DFC Campus</option>
                                    <option value="APK" ${isSelected('APK')}>APK Campus</option>
                                    <option value="SWC" ${isSelected('SWC')}>SWC Campus</option>
                                </select>
                            </div>
                            <div>
                                <label>Email Address</label>
                                <input type="email" value="${user.email}" disabled>
                                <small style="color:#999; font-size: 0.8em;">Contact support to change email.</small>
                            </div>
                        </div>

                        <div style="text-align: right; margin-top: 20px;">
                            <button type="submit" class="btn-submit" id="saveProfileBtn">Save Changes</button>
                        </div>
                    </form>
                </div>

                <div class="profile-section">
                    <h3>Security</h3>
                    <form id="changePasswordForm">
                        <div class="form-group">
                            <label>Current Password</label>
                            <div class="password-wrapper">
                                <input type="password" name="old_password" required placeholder="Enter current password">
                                <span class="toggle-icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                </span>
                            </div>
                        </div>
                        
                        <div class="form-group form-row">
                            <div>
                                <label>New Password</label>
                                <div class="password-wrapper">
                                    <input type="password" name="new_password" id="newPass" required placeholder="New password">
                                    <span class="toggle-icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label>Confirm New Password</label>
                                <div class="password-wrapper">
                                    <input type="password" id="confirmPass" required placeholder="Repeat new password">
                                    <span class="toggle-icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="text-align: right; margin-top: 15px;">
                            <button type="submit" class="btn-submit" id="savePasswordBtn" style="background-color: #34495e;">Update Password</button>
                        </div>
                    </form>
                </div>

                <div class="profile-section">
                    <h3>Preferences</h3>
                    <div class="toggle-wrapper">
                        <div>
                            <div class="toggle-label">Email Notifications</div>
                            <div style="font-size:0.9rem; color:#666;">Receive updates about upcoming events and reminders.</div>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="notifToggle" ${user.receive_notifications ? 'checked' : ''}>
                        </label>
                    </div>
                </div>

                <div class="profile-section danger-zone">
                    <h3>Danger Zone</h3>
                    <p style="color: #c0392b; margin-bottom: 20px;">
                        Deleting your account is permanent. All your volunteer hours, history, and signups will be erased immediately.
                    </p>
                    <button id="deleteAccountBtn" class="btn-danger">Delete My Account</button>
                </div>
            `;

            // --- Attach Listeners ---

            document.querySelectorAll('.toggle-icon').forEach(icon => {
                icon.addEventListener('click', () => {
                    const input = icon.parentElement.querySelector('input');
                    if (input.type === 'password') {
                        input.type = 'text'; 
                        // Icon: Eye Slash
                        icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M1 1l22 22"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path></svg>`;
                    } else {
                        input.type = 'password'; 
                        // Icon: Eye
                        icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                    }
                });
            });

            // A. Update Profile
            document.getElementById('profileForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('saveProfileBtn');
                btn.textContent = 'Saving...';
                
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());

                try {
                    const res = await fetch('/api/users/profile/', {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        },
                        body: JSON.stringify(data)
                    });
                    if (res.ok) {
                        alert('Profile updated successfully.');
                        // Update greeting in navbar immediately
                        const nameEl = document.querySelector('.user-greeting');
                        if (nameEl) nameEl.textContent = `Hi, ${data.first_name}`;
                    } else {
                        alert('Failed to update profile.');
                    }
                } catch (err) { console.error(err); } 
                finally { btn.textContent = 'Save Changes'; }
            });

            document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const newPass = document.getElementById('newPass').value;
                const confirmPass = document.getElementById('confirmPass').value;
                const btn = document.getElementById('savePasswordBtn');
                

                // 1. Frontend Validation
                if (newPass !== confirmPass) {
                    alert("New passwords do not match!");
                    return;
                }
                
                if (newPass.length < 8) {
                    alert("Password must be at least 8 characters long.");
                    return;
                }

                btn.textContent = 'Updating...';
                btn.disabled = true;

                try {
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData);
                    // Remove confirm password from data sent to API (Backend doesn't need it)
                    delete data['confirmPass']; 

                    const response = await fetch('/api/users/change-password/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCookie('csrftoken')
                        },
                        body: JSON.stringify(data)
                    });

                    const result = await response.json();

                    if (response.ok) {
                        alert("Password changed successfully!");
                        e.target.reset(); // Clear form
                    } else {
                        // Display backend errors (e.g., "Old password incorrect" or "Password too simple")
                        let errorMsg = 'Error: ';
                        if (result.old_password) errorMsg += result.old_password + '\n';
                        if (result.new_password) errorMsg += result.new_password + '\n';
                        alert(errorMsg);
                    }
                } catch (err) {
                    console.error(err);
                    alert("Network error.");
                } finally {
                    btn.textContent = 'Update Password';
                    btn.disabled = false;
                }
            });

            // B. Preferences & C. Delete (Same as before)
            document.getElementById('notifToggle').addEventListener('change', async (e) => {
                 /* ... reuse previous logic ... */
                 const isChecked = e.target.checked;
                 await fetch('/api/users/profile/', {
                     method: 'PATCH',
                     headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
                     body: JSON.stringify({ receive_notifications: isChecked })
                 });
            });

            document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
                /* ... reuse previous logic ... */
                if(confirm("Are you sure?")) {
                     await fetch('/api/users/delete/', {
                         method: 'DELETE',
                         headers: { 'X-CSRFToken': getCookie('csrftoken') }
                     });
                     window.location.href = '/login/';
                }
            });

        } catch (err) {
            console.error(err);
            mainContent.innerHTML = `<div class="header-section"><h1>Error</h1><p>Could not load settings.</p></div>`;
        }
    }

    async function handleAttendance(rsvpId, action, activityId, activityTitle) {
        try {
            const response = await fetch(`/api/attendance/${rsvpId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ action: action })
            });

            if (response.ok) {
                // Refresh the table to show new status
                renderAttendanceSheet(activityId, activityTitle);
            } else {
                alert('Error updating status');
            }
        } catch (err) {
            console.error(err);
            alert('Network Error');
        }
    }

    async function renderStudentTable() {
        // 1. Show Loading State
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>Student Volunteers</h1>
                <p>Manage roles and view volunteer details.</p>
            </div>
            <div style="background:white; border-radius:12px; box-shadow:0 2px 5px rgba(0,0,0,0.05); overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; min-width:600px;">
                    <thead>
                        <tr style="background:#f9f9f9; text-align:left;">
                            <th style="padding:15px; border-bottom:1px solid #eee;">Name</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Student No</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Campus</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Role</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="dynamicStudentBody">
                        <tr><td colspan="5" style="padding:20px; text-align:center;">Loading students...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        // 2. Fetch Data
        try {
            const response = await fetch('/api/users/students/');
            if (!response.ok) throw new Error('Failed to load');
            const students = await response.json();
            
            // 3. Build Rows
            const tbody = document.getElementById('dynamicStudentBody');
            tbody.innerHTML = ''; // Clear loading

            students.forEach(student => {
                const roleBadge = student.executive_position 
                    ? `<span style="background:#FFF4EC; color:#FF8C42; padding:4px 8px; border-radius:4px; font-weight:600; font-size:0.8rem;">${student.executive_position}</span>` 
                    : `<span style="background:#f0f0f0; color:#666; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Volunteer</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:15px; border-bottom:1px solid #eee;">
                        <div style="font-weight:600;">${student.first_name} ${student.last_name}</div>
                        <div style="font-size:0.85rem; color:#888;">${student.email}</div>
                    </td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">${student.student_number || '-'}</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">${student.campus || '-'}</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">${roleBadge}</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">
                        <button class="manage-btn" data-id="${student.id}" data-name="${student.first_name} ${student.last_name}" 
                                style="padding:6px 12px; border:1px solid #ddd; background:white; cursor:pointer; border-radius:4px;">
                            Manage Role
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // 4. Attach Event Listeners to new Buttons
            document.querySelectorAll('.manage-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    openModal(btn.dataset.id, btn.dataset.name);
                });
            });

        } catch (err) {
            console.error(err);
            document.getElementById('dynamicStudentBody').innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading students.</td></tr>';
        }
    }

    // --- MANAGE EVENTS (Create, List, Edit, Delete) ---

    async function renderCreateEventForm() {
        
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>Manage Events</h1>
                <p>Create new opportunities or update existing ones.</p>
            </div>

            <div class="management-layout">

                <div class="event-list-container">
                    <div style="padding: 20px; border-bottom: 1px solid #eee; background: #fff; position: sticky; top: 0; z-index: 11;">
                        <h3 style="margin: 0; color: var(--text-main); font-size: 1.1rem;">My Posted Events</h3>
                    </div>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Title</th>
                                <th style="text-align: left;">Date</th>
                                <th style="text-align: center;">Spots</th> <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="myEventsTableBody">
                            <tr><td colspan="4" style="padding: 20px; text-align: center;">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>

                <div class="dashboard-form-wrapper sticky-form">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h3 id="formTitle" style="margin:0; border:none;">Create New Event</h3>
                        <button type="button" id="cancelEditBtn" style="background:#95a5a6; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.8rem; display:none;">Cancel Edit</button>
                    </div>
                    
                    <form id="createEventForm">
                        <input type="hidden" name="event_id" id="eventIdField"> 
                        
                        <div class="form-group">
                            <label>Event Image</label>
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div id="imagePreviewContainer" style="display: none; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid #ddd; background: #f9f9f9;">
                                    <img id="imagePreview" src="" alt="Current Event Image" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                
                                <div style="flex-grow: 1;">
                                    <input type="file" name="image" accept="image/*">
                                    <small id="imageHelpText" style="color: #888; display: none; margin-top: 5px;">Leave empty to keep current image</small>
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Event Name</label>
                            <input type="text" name="title" id="inputTitle" required placeholder="e.g. Saturday Cleanup">
                        </div>

                        <div class="form-group form-row">
                            <div>
                                <label>Campus</label>
                                <select name="campus" id="inputCampus" required>
                                    <option value="ALL">All</option>
                                    <option value="APB">APB</option>
                                    <option value="DFC">DFC</option>
                                    <option value="APK">APK</option>
                                    <option value="SWC">SWC</option>
                                </select>
                            </div>
                            <div>
                                <label>Start Date</label>
                                <input type="datetime-local" name="date_time" id="inputDate" required>
                            </div>
                        </div>

                        <div class="form-group form-row">
                            <div>
                                <label>Duration (Hrs)</label>
                                <input type="number" name="duration_hours" id="inputDuration" step="0.5" min="0.5" required>
                            </div>
                            <div>
                                <label>Spots</label>
                                <input type="number" name="total_spots" id="inputSpots" min="1" required>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Short Description</label>
                            <input type="text" name="description" id="inputDesc" required>
                        </div>

                        <div class="form-group">
                            <label>Full Details</label>
                            <textarea name="details" id="inputDetails" rows="4" required></textarea>
                        </div>

                        <div class="form-group">
                            <label>Additional Info</label>
                            <textarea name="additional_details" id="inputAdditional" rows="2"></textarea>
                        </div>

                        <div class="form-group">
                            <label>Available Roles</label>
                            <div class="role-selection-grid">
                                
                                <label class="role-card">
                                    <input type="checkbox" name="role_types" value="Set Up">
                                    <div>
                                        <span>Set Up</span>
                                        <small>Preparing for event</small>
                                    </div>
                                </label>

                                <label class="role-card">
                                    <input type="checkbox" name="role_types" value="Demonstration">
                                    <div>
                                        <span>Demonstration</span>
                                        <small>Showcase safety tips</small>
                                    </div>
                                </label>

                                <label class="role-card">
                                    <input type="checkbox" name="role_types" value="Recruitment">
                                    <div>
                                        <span>Recruitment</span>
                                        <small>Convince students to join</small>
                                    </div>
                                </label>

                                <label class="role-card">
                                    <input type="checkbox" name="role_types" value="General" checked>
                                    <div>
                                        <span>General Helper</span>
                                        <small>General tasks</small>
                                    </div>
                                </label>

                            </div>
                        </div>

                        <button type="submit" class="btn-submit" id="submitEventBtn" style="width:100%; margin-top:10px;">Publish Event</button>
                    </form>
                </div>
            </div>
        `;

        // Load Data & Attach Listeners
        fetchMyEvents();
        document.getElementById('createEventForm').addEventListener('submit', handleEventSubmit);
        document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
    }

    // --- Helper: Fetch and Display List ---
// --- Helper: Fetch and Display List ---
    async function fetchMyEvents() {
        const tbody = document.getElementById('myEventsTableBody');
        try {
            const response = await fetch('/api/activities/'); 
            const allEvents = await response.json();
            
            if (allEvents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center;">No events found.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            
            allEvents.forEach(event => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';
                
                tr.innerHTML = `
                    <td style="padding: 15px; font-weight: 600; color: var(--text-main);">
                        ${event.title}
                        <div style="font-size: 0.75rem; color: #999; font-weight: normal; margin-top:2px;">${event.campus}</div>
                    </td>

                    <td style="padding: 15px; color: var(--text-main);">
                        ${new Date(event.date_time).toLocaleDateString()}
                        <div style="font-size: 0.75rem; color: #999;">${new Date(event.date_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                    </td>
                    
                    <td style="padding: 15px; text-align: center; font-family: monospace; font-size: 0.95rem;">
                        <span style="color: ${event.spots_left > 0 ? '#27ae60' : '#e74c3c'}">${event.spots_left}</span> 
                        <span style="color: #ccc;">/</span> 
                        ${event.total_spots}
                    </td>
                    
                    <td style="padding: 15px; text-align: right;">
                        <div style="display: flex; gap: 8px; justify-content: flex-end;">
                            <button class="icon-btn attendance-btn" data-id="${event.id}" data-title="${event.title}" 
                                title="Attendance" style="background: #FFF4EC; color: #E35205;">
                                📋
                            </button>
                            
                            <button class="icon-btn duplicate-btn" data-id="${event.id}" 
                                title="Duplicate / Reuse" style="background: #f3e5f5; color: #8e24aa;">
                                ❐
                            </button>
                            
                            <button class="icon-btn edit-btn" data-id="${event.id}" 
                                title="Edit" style="background: #e3f2fd; color: #1565c0;">
                                ✏️
                            </button>

                            <button class="icon-btn delete-btn" data-id="${event.id}" 
                                title="Delete" style="background: #ffebee; color: #c62828;">
                                🗑️
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // --- Attach Listeners ---
            
            // 1. Attendance Listener
            document.querySelectorAll('.attendance-btn').forEach(btn => {
                btn.addEventListener('click', () => renderAttendanceSheet(btn.dataset.id, btn.dataset.title));
            });

            // 2. Edit Listener
            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => loadEventIntoForm(allEvents.find(e => e.id == btn.dataset.id)));
            });

            // 3. Delete Listener
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteEvent(btn.dataset.id));
            });

            //4. Duplicate
            document.querySelectorAll('.duplicate-btn').forEach(btn => {
                btn.addEventListener('click', () => duplicateEvent(allEvents.find(e => e.id == btn.dataset.id)));
            });

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading list.</td></tr>';
        }
    }

    // --- Helper: Duplicate Event (Reuse Details) ---
    function duplicateEvent(event) {
        // 1. Scroll to form
        document.querySelector('.dashboard-form-wrapper').scrollIntoView({ behavior: 'smooth' });

        // 2. Update UI Text
        document.getElementById('formTitle').textContent = `New Event (Copy of ${event.title})`;
        document.getElementById('submitEventBtn').textContent = 'Publish New Event';
        document.getElementById('cancelEditBtn').style.display = 'inline-block'; // Allow them to cancel the "copy mode"

        // 3. CRITICAL: Clear the ID so it saves as NEW
        document.getElementById('eventIdField').value = '';

        // 4. Fill Reusable Fields
        document.getElementById('inputTitle').value = event.title; // Keep title (user can edit)
        document.getElementById('inputCampus').value = event.campus;
        document.getElementById('inputDuration').value = event.duration_hours;
        document.getElementById('inputSpots').value = event.total_spots;
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';

        // 5. CLEAR Date (User must pick a new date for the new event)
        document.getElementById('inputDate').value = '';

        // 6. Handle Roles (Copy them over)
        const checkboxes = document.querySelectorAll('input[name="role_types"]');
        checkboxes.forEach(cb => cb.checked = false); // Clear first
        if (event.roles && Array.isArray(event.roles)) {
            event.roles.forEach(roleObj => {
                const matching = document.querySelector(`input[name="role_types"][value="${roleObj.role_type}"]`);
                if (matching) matching.checked = true;
            });
        }

        // 7. Handle Image (Reset it)
        // Browsers block copying file inputs for security, so we clear it.
        document.getElementById('imagePreviewContainer').style.display = 'none';
        document.getElementById('imagePreview').src = '';
        document.getElementById('imageHelpText').style.display = 'none';
        
        // Optional: Alert the user
        // alert("Details copied! Please set a new Date and Image.");
    }
    // --- Helper: Load Data into Form (Edit Mode) ---
    function loadEventIntoForm(event) {
        // 1. Scroll to form
        document.querySelector('.dashboard-form-wrapper').scrollIntoView({ behavior: 'smooth' });

        // 2. Update UI Text
        document.getElementById('formTitle').textContent = `Editing: ${event.title}`;
        document.getElementById('submitEventBtn').textContent = 'Update Event';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';

        // 3. Fill Standard Fields
        document.getElementById('eventIdField').value = event.id;
        document.getElementById('inputTitle').value = event.title;
        document.getElementById('inputCampus').value = event.campus;
        document.getElementById('inputDuration').value = event.duration_hours;
        document.getElementById('inputSpots').value = event.total_spots;
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';

        // 4. Format Date (YYYY-MM-DDTHH:MM)
        if (event.date_time) {
            const d = new Date(event.date_time);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            document.getElementById('inputDate').value = d.toISOString().slice(0, 16);
        }

        // 5. Handle Roles Checkboxes
        // Clear all first
        const checkboxes = document.querySelectorAll('input[name="role_types"]');
        checkboxes.forEach(cb => cb.checked = false);

        // Check the ones that exist
        if (event.roles && Array.isArray(event.roles)) {
            event.roles.forEach(roleObj => {
                const matchingCheckbox = document.querySelector(`input[name="role_types"][value="${roleObj.role_type}"]`);
                if (matchingCheckbox) {
                    matchingCheckbox.checked = true;
                }
            });
        }

        // 6. Handle Image Preview (Visual Thumbnail)
        const previewContainer = document.getElementById('imagePreviewContainer');
        const previewImg = document.getElementById('imagePreview');
        const helpText = document.getElementById('imageHelpText');

        if (event.image) {
            // Show the thumbnail if image exists
            previewContainer.style.display = 'block';
            previewImg.src = event.image;
            helpText.style.display = 'block'; // Shows "Leave empty to keep current"
        } else {
            // Hide if no image
            previewContainer.style.display = 'none';
            previewImg.src = '';
            helpText.style.display = 'none';
        }
    }

    // --- Helper: Reset Form ---
    function resetForm() {
        document.getElementById('createEventForm').reset();
        document.getElementById('eventIdField').value = ''; // Clear ID
        document.getElementById('formTitle').textContent = 'Create New Event';
        document.getElementById('submitEventBtn').textContent = 'Publish Event';
        document.getElementById('cancelEditBtn').style.display = 'none';
        document.getElementById('currentImageText').style.display = 'none';
    }

    // --- Action: Delete Event ---
    async function deleteEvent(id) {
        if (!confirm('Are you sure you want to delete this event?')) return;

        try {
            const response = await fetch(`/api/activities/${id}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCookie('csrftoken') }
            });

            if (response.ok) {
                fetchMyEvents(); // Refresh List
                resetForm();     // Clear form if we were editing that item
            } else {
                alert('Failed to delete.');
            }
        } catch (err) {
            console.error(err);
            alert('Network error.');
        }
    }

    // --- Action: Submit (Create OR Update) ---
    async function handleEventSubmit(e) {
        e.preventDefault();
        const btn = document.getElementById('submitEventBtn');
        const originalText = btn.textContent;
        btn.textContent = 'Processing...';
        btn.disabled = true;

        const formData = new FormData(e.target);
        const eventId = formData.get('event_id'); // Check if we have an ID

        const checkboxes = document.querySelectorAll('input[name="role_types"]:checked');
        
        // 2. Remove them from formData to avoid duplicates/confusion
        formData.delete('role_types');
        
        // 3. Re-append them individually. 
        // Django DRF ListField expects multiple values with the same key to form a list.
        checkboxes.forEach((checkbox) => {
            formData.append('role_types', checkbox.value);
        });

        // Determine URL and Method
        const url = eventId ? `/api/activities/${eventId}/` : '/api/activities/create/';
        const method = eventId ? 'PATCH' : 'POST'; // PATCH is safer for partial updates (files)

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'X-CSRFToken': getCookie('csrftoken') },
                body: formData
            });

            if (response.ok) {
                alert(eventId ? 'Event Updated!' : 'Event Created!');
                fetchMyEvents(); // Refresh List
                resetForm();     // Reset Form
            } else {
                const err = await response.json();
                alert('Error: ' + JSON.stringify(err));
            }
        } catch (error) {
            console.error(error);
            alert('Network Error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // --- RSVP Modal Logic ---
    const signupModal = document.getElementById('signupModal');
    
    window.openSignupModal = (activity) => {
        document.getElementById('signupEventId').value = activity.id;
        document.getElementById('signupEventTitle').textContent = activity.title;
        
        const roleSelect = document.getElementById('signupRoleSelect');
        roleSelect.innerHTML = '<option value="" disabled selected>-- Choose a Role --</option>';
        
        // Populate Roles
        if (activity.roles && activity.roles.length > 0) {
            activity.roles.forEach(role => {
                const option = document.createElement('option');
                option.value = role.id; // We send the Role ID to backend
                option.textContent = role.get_role_type_display || role.role_type; // Use readable name
                roleSelect.appendChild(option);
            });
        } else {
             // Fallback if no specific roles defined
             roleSelect.innerHTML = '<option value="">General Volunteer</option>';
        }

        signupModal.style.display = 'flex';
    }

    window.closeSignupModal = () => {
        signupModal.style.display = 'none';
    }

    // Handle RSVP Submit
    const rsvpForm = document.getElementById('rsvpForm');
    if (rsvpForm) {
        rsvpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('confirmRsvpBtn');
            btn.textContent = 'Signing up...';
            btn.disabled = true;

            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/activities/signup/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    alert('Successfully Signed Up! See you there.');
                    closeSignupModal();
                    renderActivities(); // Refresh grid to update spot count
                } else {
                    const err = await response.json();
                    // Handle duplicate signup error nicely
                    if (Array.isArray(err) && err[0].includes("already signed up")) {
                         alert("You are already signed up for this event!");
                    } else {
                        alert('Error: ' + JSON.stringify(err));
                    }
                }
            } catch (error) {
                console.error(error);
                alert('Network Error');
            } finally {
                btn.textContent = 'Confirm & Sign Up';
                btn.disabled = false;
            }
        });
    }
    // --- 3. Modal Logic (Global) ---
    
    const modal = document.getElementById('roleModal');
    const form = document.getElementById('assignRoleForm');

    window.openModal = (id, name) => {
        document.getElementById('selectedStudentId').value = id;
        document.getElementById('modalStudentName').textContent = `For: ${name}`;
        modal.style.display = 'flex'; // Show flex to center
    }

    window.closeModal = () => {
        modal.style.display = 'none';
    }

    // Handle Form Submit
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentId = document.getElementById('selectedStudentId').value;
            const position = document.getElementById('roleSelect').value;
            const csrfToken = getCookie('csrftoken');

            try {
                const response = await fetch('/api/users/assign-executive/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({ student_id: studentId, position: position })
                });

                if (response.ok) {
                    closeModal();
                    renderStudentTable(); // Refresh table immediately
                } else {
                    alert('Error updating role');
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Logout Logic
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                const response = await fetch('/api/users/logout/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': getCookie('csrftoken') }
                });
                if (response.ok) window.location.href = '/login/';
            } catch (err) { console.error(err); }
        });
    }

    // Helper
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    renderActivities();
});