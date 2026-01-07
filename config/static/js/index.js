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
    const toggleBtn = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if(toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
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
                <button id="backToManage" style="background:none; border:none; color:#666; cursor:pointer; margin-bottom:10px;">&larr; Back to Events</button>
                <h1>Attendance Sheet</h1>
                <p style="color: var(--primary-orange); font-weight:600;">${activityTitle}</p>
            </div>
            
            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm);">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa; text-align: left;">
                            <th style="padding: 15px;">Student</th>
                            <th style="padding: 15px;">Role</th>
                            <th style="padding: 15px;">Status</th>
                            <th style="padding: 15px;">Time Logged</th>
                            <th style="padding: 15px; text-align: right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="attendanceTableBody">
                        <tr><td colspan="5" style="padding:20px; text-align:center;">Loading RSVPs...</td></tr>
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('backToManage').addEventListener('click', renderCreateEventForm);

        try {
            const response = await fetch(`/api/activities/${activityId}/rsvps/`);
            const rsvps = await response.json();
            const tbody = document.getElementById('attendanceTableBody');
            
            if (rsvps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center;">No students have RSVPed yet.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            rsvps.forEach(rsvp => {
                // Determine Status and Button
                let statusBadge = '<span style="background:#eee; padding:4px 8px; border-radius:4px; color:#666;">Pending</span>';
                let actionBtn = `<button class="btn-signin" data-id="${rsvp.id}" style="padding:6px 12px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer;">Sign In</button>`;
                let timeLog = '-';

                if (rsvp.sign_in_time && !rsvp.sign_out_time) {
                    // Currently Signed In
                    const signInTime = new Date(rsvp.sign_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    statusBadge = '<span style="background:#d4edda; color:#155724; padding:4px 8px; border-radius:4px;">In Progress</span>';
                    timeLog = `In: ${signInTime}`;
                    actionBtn = `<button class="btn-signout" data-id="${rsvp.id}" style="padding:6px 12px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Sign Out</button>`;
                } 
                else if (rsvp.sign_out_time) {
                    // Completed
                    statusBadge = '<span style="background:#cce5ff; color:#004085; padding:4px 8px; border-radius:4px;">Completed</span>';
                    timeLog = `${rsvp.hours_earned} Hrs`;
                    actionBtn = `<span style="color:#27ae60; font-weight:bold;">✔ Saved</span>`;
                }

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';
                tr.innerHTML = `
                    <td style="padding: 15px;">
                        <strong>${rsvp.student_name} ${rsvp.student_surname}</strong><br>
                        <small style="color:#888;">${rsvp.student_email}</small>
                    </td>
                    <td style="padding: 15px;">${rsvp.role_name || 'General'}</td>
                    <td style="padding: 15px;">${statusBadge}</td>
                    <td style="padding: 15px;">${timeLog}</td>
                    <td style="padding: 15px; text-align: right;">${actionBtn}</td>
                `;
                tbody.appendChild(tr);
            });

            // Attach Listeners for Actions
            document.querySelectorAll('.btn-signin').forEach(btn => {
                btn.addEventListener('click', () => handleAttendance(btn.dataset.id, 'signin', activityId, activityTitle));
            });
            document.querySelectorAll('.btn-signout').forEach(btn => {
                btn.addEventListener('click', () => handleAttendance(btn.dataset.id, 'signout', activityId, activityTitle));
            });

        } catch (err) {
            console.error(err);
        }
    }

    async function renderStudentStats() {
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>My Progress</h1>
                <p>Track your volunteer impact and hours.</p>
            </div>
            <div class="loader"></div>
        `;

        try {
            const response = await fetch('/api/users/stats/');
            const data = await response.json();

            // 1. Build History Rows
            let historyHtml = '';
            if (data.history.length === 0) {
                historyHtml = '<tr><td colspan="3" style="padding:15px; text-align:center; color:#888;">No completed activities yet.</td></tr>';
            } else {
                data.history.forEach(item => {
                    const dateStr = new Date(item.date).toLocaleDateString();
                    historyHtml += `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:12px;">${item.activity}</td>
                            <td style="padding:12px;">${dateStr}</td>
                            <td style="padding:12px; font-weight:bold; color:#27ae60;">+${item.hours} hrs</td>
                        </tr>
                    `;
                });
            }

            // 2. Render Dashboard Grid
            mainContent.innerHTML = `
                <div class="header-section">
                    <h1>My Progress</h1>
                    <p>Track your volunteer impact and hours.</p>
                </div>

                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px;">
                    
                    <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: var(--shadow-sm); display:flex; align-items:center; border-left: 5px solid var(--primary-orange);">
                        <div style="background: #FFF4EC; padding: 15px; border-radius: 50%; margin-right: 20px;">
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="#FF8C42"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                        </div>
                        <div>
                            <h3 style="font-size: 2.5rem; margin: 0; color: var(--text-main);">${data.total_hours}</h3>
                            <p style="margin: 0; color: var(--text-muted);">Total Hours Earned</p>
                        </div>
                    </div>

                    <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: var(--shadow-sm); display:flex; align-items:center; border-left: 5px solid #27ae60;">
                        <div style="background: #eafaf1; padding: 15px; border-radius: 50%; margin-right: 20px;">
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="#27ae60"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        </div>
                        <div>
                            <h3 style="font-size: 2.5rem; margin: 0; color: var(--text-main);">${data.events_attended}</h3>
                            <p style="margin: 0; color: var(--text-muted);">Events Completed</p>
                        </div>
                    </div>

                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
                    
                    <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: var(--shadow-sm); min-height: 300px;">
                        <h3 style="margin-bottom: 20px;">Activity Overview</h3>
                        <div style="height: 200px; background: #fafafa; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #999; border: 2px dashed #eee;">
                            [ Graph: Monthly Hours will go here ]
                        </div>
                    </div>

                    <div style="background: white; padding: 25px; border-radius: 12px; box-shadow: var(--shadow-sm);">
                        <h3 style="margin-bottom: 20px;">Recent Activity</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
                            ${historyHtml}
                        </table>
                        <div style="margin-top: 15px; text-align: center;">
                            <a href="#" style="color: var(--primary-orange); font-weight: 600; font-size: 0.85rem;">View Full History</a>
                        </div>
                    </div>

                </div>
            `;

        } catch (err) {
            console.error(err);
            mainContent.innerHTML = `<div class="header-section"><h1>Error</h1><p>Could not load stats.</p></div>`;
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
        // 1. Structure: Split page into List (Top) and Form (Bottom/Modal)
        // For simplicity, we put the List on top and the Form below it.
        
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>Manage Events</h1>
                <p>Create new opportunities or update existing ones.</p>
            </div>

            <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: var(--shadow-sm); margin-bottom: 40px;">
                <h3 style="margin-bottom: 15px; color: var(--text-main);">My Posted Events</h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa; color: var(--text-muted); font-size: 0.9rem;">
                                <th style="padding: 12px; text-align: left;">Title</th>
                                <th style="padding: 12px; text-align: left;">Date</th>
                                <th style="padding: 12px; text-align: left;">Spots</th>
                                <th style="padding: 12px; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="myEventsTableBody">
                            <tr><td colspan="4" style="padding: 20px; text-align: center;">Loading your events...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="dashboard-form-wrapper">
                <h3 id="formTitle" style="margin-bottom: 20px; color: var(--text-main);">Create New Event</h3>
                
                <form id="createEventForm">
                    <input type="hidden" name="event_id" id="eventIdField"> <div class="form-group">
                        <label>Event Image</label>
                        <input type="file" name="image" accept="image/*">
                        <small id="currentImageText" style="color: #666; display: none;">Current image: <a href="#" target="_blank">View</a></small>
                    </div>

                    <div class="form-group">
                        <label>Event Name (Title)</label>
                        <input type="text" name="title" id="inputTitle" required placeholder="e.g. Saturday Campus Cleanup">
                    </div>

                    <div class="form-group form-row">
                        <div>
                            <label>Campus</label>
                            <select name="campus" id="inputCampus" required>
                                <option value="ALL">All Campuses</option>
                                <option value="APB">APB</option>
                                <option value="DFC">DFC</option>
                                <option value="APK">APK</option>
                                <option value="SWC">SWC</option>
                            </select>
                        </div>
                        <div>
                            <label>Start Date & Time</label>
                            <input type="datetime-local" name="date_time" id="inputDate" required>
                        </div>
                        <div>
                            <label>Duration (Hours)</label>
                            <input type="number" name="duration_hours" id="inputDuration" step="0.5" min="0.5" required>
                        </div>
                    </div>

                    <div class="form-group form-row">
                        <div>
                            <label>Total Spots</label>
                            <input type="number" name="total_spots" id="inputSpots" min="1" required>
                        </div>
                        <div>
                            <label>Short Description</label>
                            <input type="text" name="description" id="inputDesc" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Full Details</label>
                        <textarea name="details" id="inputDetails" rows="5" required></textarea>
                    </div>

                    <div class="form-group">
                        <label>Additional Info</label>
                        <textarea name="additional_details" id="inputAdditional" rows="2"></textarea>
                    </div>

                    <div class="form-group">
                        <label>Available Roles for Volunteers</label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
                            
                            <label style="display: flex; align-items: center; font-weight: normal; cursor: pointer;">
                                <input type="checkbox" name="role_types" value="Set Up" style="width: auto; margin-right: 10px;"> 
                                <span>Set Up <small style="color:#666; display:block; font-size:0.8em;">Preparing for the event</small></span>
                            </label>

                            <label style="display: flex; align-items: center; font-weight: normal; cursor: pointer;">
                                <input type="checkbox" name="role_types" value="Demonstration" style="width: auto; margin-right: 10px;"> 
                                <span>Demonstration <small style="color:#666; display:block; font-size:0.8em;">Showcase safety tips</small></span>
                            </label>

                            <label style="display: flex; align-items: center; font-weight: normal; cursor: pointer;">
                                <input type="checkbox" name="role_types" value="Recruitment" style="width: auto; margin-right: 10px;"> 
                                <span>Recruitment <small style="color:#666; display:block; font-size:0.8em;">Convince students to join</small></span>
                            </label>

                            <label style="display: flex; align-items: center; font-weight: normal; cursor: pointer;">
                                <input type="checkbox" name="role_types" value="General" checked style="width: auto; margin-right: 10px;"> 
                                <span>General Helper <small style="color:#666; display:block; font-size:0.8em;">General tasks</small></span>
                            </label>

                        </div>
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button type="submit" class="btn-submit" id="submitEventBtn">Publish Event</button>
                        <button type="button" id="cancelEditBtn" class="btn-submit" style="background-color: #95a5a6; display: none;">Cancel Edit</button>
                    </div>
                </form>
            </div>
        `;

        // 2. Load the Table Data
        fetchMyEvents();

        // 3. Attach Listeners
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
                tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center;">No events found. Create one below!</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            
            allEvents.forEach(event => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';
                
                // --- FIX IS HERE: The HTML is inside the backticks (`) ---
                tr.innerHTML = `
                    <td style="padding: 12px; font-weight: 600;">${event.title}</td>
                    <td style="padding: 12px;">${new Date(event.date_time).toLocaleDateString()}</td>
                    <td style="padding: 12px;">${event.spots_left} / ${event.total_spots}</td>
                    
                    <td style="padding: 12px; text-align: right;">
                        <button class="icon-btn attendance-btn" data-id="${event.id}" data-title="${event.title}" style="color: #E35205; font-weight:bold; margin-right: 10px; cursor: pointer;">📋 Attendance</button>
                        
                        <button class="icon-btn edit-btn" data-id="${event.id}" style="color: blue; display: inline-block; margin-right: 10px; cursor: pointer;">Edit</button>
                        <button class="icon-btn delete-btn" data-id="${event.id}" style="color: red; display: inline-block; cursor: pointer;">Delete</button>
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

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading list.</td></tr>';
        }
    }

    // --- Helper: Load Data into Form (Edit Mode) ---
    function loadEventIntoForm(event) {
        // Scroll to form
        document.querySelector('.dashboard-form-wrapper').scrollIntoView({ behavior: 'smooth' });

        // Update UI Text
        document.getElementById('formTitle').textContent = `Editing: ${event.title}`;
        document.getElementById('submitEventBtn').textContent = 'Update Event';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';

        // Fill Standard Fields
        document.getElementById('eventIdField').value = event.id;
        document.getElementById('inputTitle').value = event.title;
        document.getElementById('inputCampus').value = event.campus;
        document.getElementById('inputDuration').value = event.duration_hours;
        document.getElementById('inputSpots').value = event.total_spots;
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';

        // Format Date (YYYY-MM-DDTHH:MM)
        if (event.date_time) {
            const d = new Date(event.date_time);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            document.getElementById('inputDate').value = d.toISOString().slice(0, 16);
        }

        // --- NEW: Handle Roles Checkboxes ---
        // 1. Clear all first
        const checkboxes = document.querySelectorAll('input[name="role_types"]');
        checkboxes.forEach(cb => cb.checked = false);

        // 2. Check the ones that exist in the event
        // The API returns 'roles' as a list of objects: [{role_type: "Set Up", ...}, ...]
        if (event.roles && Array.isArray(event.roles)) {
            event.roles.forEach(roleObj => {
                // Find the checkbox with this value
                const matchingCheckbox = document.querySelector(`input[name="role_types"][value="${roleObj.role_type}"]`);
                if (matchingCheckbox) {
                    matchingCheckbox.checked = true;
                }
            });
        }

        // Handle Image Text
        const imgText = document.getElementById('currentImageText');
        if (event.image) {
            imgText.style.display = 'block';
            imgText.querySelector('a').href = event.image;
        } else {
            imgText.style.display = 'none';
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