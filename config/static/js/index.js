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
    const overlay = document.getElementById('sidebarOverlay'); 
    
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


    if (linkActivities) {
        linkActivities.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemActivities);
            renderActivities();
        });
    }


    if (linkStudents) {
        linkStudents.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemStudents);
            renderStudentTable();
        });
    }


    if (linkCreateEvent) {
        linkCreateEvent.addEventListener('click', (e) => {
            e.preventDefault();
            setActiveNav(navItemCreateEvent);
            renderCreateEventForm();
        });
    }

    function setActiveNav(activeItem) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        if(activeItem) activeItem.classList.add('active');
    }


    // Render Activities (List View)
    async function renderActivities() {
        const pageTitle = isUserLoggedIn ? "Volunteer Activities" : "Upcoming Activities";
        const pageSubtitle = isUserLoggedIn ? "Find your next opportunity." : "See what's happening around campus.";

        mainContent.innerHTML = `
            <div class="header-section">
                <h1>${pageTitle}</h1>
                <p>${pageSubtitle}</p>
            </div>
            <div class="loader"></div>
        `;

        try {
            const response = await fetch('/api/activities/');
            if (!response.ok) throw new Error('Failed to load events');
            let activities = await response.json();

            const now = new Date();
            activities = activities.filter(activity => new Date(activity.date_time) > now);

            const footerHtml = `
                <footer class="minimal-footer" style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                    <div class="footer-links">
                        <a href="/about/">About Us</a>
                        <span class="separator">•</span>
                        <a href="/terms/">Terms of Use</a>
                        <span class="separator">•</span>
                        <a href="/privacy/">Privacy Policy</a>
                    </div>
                    <div class="footer-copyright">
                        &copy; 2026 C-SHAW Hub. All rights reserved.
                    </div>
                </footer>
            `;

            if (activities.length === 0) {
                mainContent.innerHTML = `
                    <div class="header-section"><h1>Volunteer Activities</h1><p>Find your next opportunity.</p></div>
                    <div class="cards-grid">
                        <p style="grid-column: 1/-1; text-align: center; color: #7F8C8D;">No upcoming events found. Check back later!</p>
                    </div>
                    ${footerHtml} `;
                return;
            }

            let cardsHtml = '';
            activities.forEach(activity => {
                const imageStyle = activity.image 
                    ? `background-image: url('${activity.image}'); background-size: cover; background-position: center;` 
                    : `background-color: #BDC3C7; display: flex; align-items: center; justify-content: center; content: 'No Image'; color: white;`;

                const dateObj = new Date(activity.date_time);
                const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const spotsColor = activity.spots_left > 5 ? '#27ae60' : '#e74c3c';

                const signedUpBadge = activity.is_signed_up 
                    ? `<div style="
                        position: absolute; 
                        top: 10px; 
                        right: 10px; 
                        background: #27ae60; 
                        color: white; 
                        padding: 4px 10px; 
                        border-radius: 12px; 
                        font-size: 0.75rem; 
                        font-weight: bold; 
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        z-index: 10;
                       ">
                        ✓ Signed Up
                       </div>` 
                    : '';
                
                cardsHtml += `
                    <div class="card">
                        <div class="card-image" style="${imageStyle} position: relative;">
                            ${signedUpBadge}
                        </div>
                        
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

                    ${signedUpBadge}
                `;
            });

            mainContent.innerHTML = `
                <div class="header-section">
                    <h1>${pageTitle}</h1>
                    <p>${pageSubtitle}</p>
                </div>
                <div class="cards-grid">${cardsHtml}</div>
                ${footerHtml}
            `;

            activities.forEach(activity => {
                const btn = document.getElementById(`view-btn-${activity.id}`);
                if (btn) {
                    btn.addEventListener('click', () => {
                        renderActivityDetails(activity);
                    });
                }
            });
            
            const footerAbout = document.getElementById('footerAboutLink');
            if (footerAbout) {
                footerAbout.addEventListener('click', (e) => {
                    e.preventDefault();
                    const modal = document.getElementById('aboutModal');
                    if(modal) modal.classList.remove('hidden');
                });
            }

        } catch (error) {
            console.error(error);
            mainContent.innerHTML = `<div class="header-section"><h1>Error</h1><p>Could not load activities.</p></div>`;
        }
    }

    // Render Activity Details
    async function renderActivityDetails(activity) {

        let userCampus = null;

        try {
            const res = await fetch('/api/users/profile/');
            if (res.ok) {
                const userData = await res.json();
                userCampus = userData.campus;
            }
        } catch (err) {
            console.error("Could not verify campus restriction:", err);
        }
        // Prepare Data
        const imageStyle = activity.image 
            ? `background-image: url('${activity.image}'); background-size: cover; background-position: center; height: 300px;` 
            : `background-color: #BDC3C7; height: 300px; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem;`;

        const dateObj = new Date(activity.date_time);
        const fullDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

        // 3. Logic for Cancellation (Date Check)
        const today = new Date();
        const eventDate = new Date(activity.date_time);
        const isToday = today.toDateString() === eventDate.toDateString();
        const isPast = today > eventDate;


        let actionButtonHtml = '';

        if (activity.is_signed_up) {

            if (isToday || isPast) {
                actionButtonHtml = `
                    <div style="background:#f8f9fa; border:1px solid #ddd; padding:15px; border-radius:8px; text-align:center;">
                        <button disabled style="background:#95a5a6; color:white; padding: 12px 30px; font-size:1rem; border:none; border-radius:4px; cursor:not-allowed; opacity: 0.7;">
                            🚫 Cannot Cancel
                        </button>
                        <p style="color:#e74c3c; font-size:0.85rem; margin:10px 0 0 0; font-weight:600;">
                            Cancellations are not allowed on the day of the event.
                        </p>
                    </div>
                `;
            } else {
                actionButtonHtml = `
                    <div style="background:#fff5f5; border:1px solid #ffcccc; padding:20px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="color:#c0392b; display:block; margin-bottom:4px;">You are attending this event</strong>
                            <span style="font-size:0.85rem; color:#666;">Need to change plans?</span>
                        </div>
                        <button id="cancelBtn" style="background:#fff; border:1px solid #c0392b; color:#c0392b; padding: 10px 20px; font-size:0.9rem; border-radius:4px; cursor:pointer; font-weight:600;">
                            Cancel Sign Up
                        </button>
                    </div>
                `;
            }
        } else {

            if (activity.campus !== 'ALL' && activity.campus !== userCampus) {
                 actionButtonHtml = `
                    <div style="background:#fff3cd; border:1px solid #ffeeba; padding:15px; border-radius:8px; text-align:center;">
                        <button disabled style="background:#e0a800; color:white; padding: 12px 30px; font-size:1rem; border:none; border-radius:4px; cursor:not-allowed; opacity: 0.8;">
                            🔒 Restricted Event
                        </button>
                        <p style="color:#856404; font-size:0.85rem; margin:10px 0 0 0;">
                            This event is exclusively for <strong>${activity.campus}</strong> students.<br>
                            (You are registered at ${userCampus})
                        </p>
                    </div>
                `;
            } 

            else if (activity.spots_left <= 0) {
                actionButtonHtml = `
                    <button disabled style="background:#95a5a6; color:white; padding: 15px 40px; font-size:1.1rem; border:none; border-radius:4px; cursor:not-allowed;">
                        Event Full
                    </button>
                `;
            } 

            else {
                 actionButtonHtml = `
                    <button id="signupBtn" class="btn-submit" style="width:auto; padding: 15px 40px; font-size:1.1rem;">
                        RSVP for Event
                    </button>
                `;
            }
        }

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

                    ${isUserLoggedIn ? `
                        ${activity.additional_details ? `
                            <div style="background:#FFF4EC; padding:20px; border-radius:8px; margin-bottom:30px;">
                                <h4 style="margin-bottom:5px; color:#E87A30;">ℹ️ Important Information</h4>
                                <p style="color:#555;">${activity.additional_details}</p>
                            </div>
                        ` : ''}

                        ${actionButtonHtml}

                    ` : `
                        <div style="background:#f9f9f9; padding:15px; border-radius:6px; text-align:center; color:#666;">
                            Please <a href="/login" style="color:#E35205; font-weight:bold; text-decoration:none;">log in</a> to sign up for this event.
                        </div>
                    `}
                </div>
            </div>
        `;


        document.getElementById('backToActivities').addEventListener('click', () => {
            renderActivities(); 
        });

        if(document.getElementById('cancelBtn')) {
             document.getElementById('cancelBtn').addEventListener('click', () => cancelSignup(activity.id));
        }

        const signupBtn = document.getElementById('signupBtn');
        
        if (signupBtn) {
            signupBtn.addEventListener('click', () => {
                openSignupModal(activity);
            });
        }
    }

    async function cancelSignup(activityId) {

        const confirmed = confirm("Are you sure you want to cancel your sign up for this event?\n\nThis will free up your spot for other students.");
        
        if (!confirmed) return;
        try {
            const response = await fetch(`/api/activities/${activityId}/signup/`, {
                method: 'DELETE', 
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken') 
                }
            });

            if (response.ok) {
                alert("You have successfully cancelled your sign up.");
                const updatedActivity = await (await fetch(`/api/activities/${activityId}/`)).json();
                renderActivityDetails(updatedActivity);
            } else {
                const data = await response.json();
                alert(data.error || "Failed to cancel. Please try again.");
            }
        } catch (error) {
            console.error('Error canceling signup:', error);
            alert("A network error occurred.");
        }
    }

    async function renderAttendanceSheet(activityId) {
        mainContent.innerHTML = `
            <div class="header-section">
                <button id="backToManage" style="background:none; border:none; color:#666; cursor:pointer; margin-bottom:10px; font-weight: 500;">
                    &larr; Back to Events
                </button>
                <h1>Attendance Sheet</h1>
                <div id="activityHeader" style="margin-top: 5px;">
                    <span style="color:#ccc;">Loading event details...</span>
                </div>
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

            const [activityRes, rsvpsRes] = await Promise.all([
                fetch(`/api/activities/${activityId}/`),      
                fetch(`/api/activities/${activityId}/rsvps/`) 
            ]);

            if (!activityRes.ok || !rsvpsRes.ok) throw new Error("Failed to load data");

            const activity = await activityRes.json();
            const rsvps = await rsvpsRes.json();

            const dateObj = new Date(activity.date_time);
            const dateStr = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            const infoHtml = `
                <span style="color: var(--primary-orange); font-weight:700; font-size: 1.1rem;">${activity.title}</span>
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="color: #666;">${dateStr}</span>
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="color: #666;">${timeStr}</span>
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="color: #666; font-weight:500;">${activity.campus} Campus</span>
            `;


            document.getElementById('activityHeader').innerHTML = infoHtml;


            const tbody = document.getElementById('attendanceTableBody');
            
            if (rsvps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:40px; text-align:center; color:#999; font-style:italic;">No students have RSVPed yet.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            rsvps.forEach(rsvp => {

                let statusBadge = '<span style="background:#f1f1f1; padding:4px 10px; border-radius:12px; color:#666; font-size:0.85rem;">Pending</span>';
                let actionBtn = `<button class="btn-signin" data-id="${rsvp.id}" style="padding:6px 16px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(39,174,96,0.2);">Sign In</button>`;
                let timeLog = '<span style="color:#ccc;">--:--</span>';

                if (rsvp.sign_in_time && !rsvp.sign_out_time) {

                    const signInTime = new Date(rsvp.sign_in_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    statusBadge = '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:500;">● In Progress</span>';
                    timeLog = `<span style="color:#2e7d32; font-weight:600;">In: ${signInTime}</span>`;
                    actionBtn = `<button class="btn-signout" data-id="${rsvp.id}" style="padding:6px 16px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(231,76,60,0.2);">Sign Out</button>`;
                } 
                else if (rsvp.sign_out_time) {

                    statusBadge = '<span style="background:#e3f2fd; color:#1565c0; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:500;">✓ Completed</span>';
                    timeLog = `<strong style="color:#333;">${rsvp.hours_earned} Hrs</strong>`;
                    actionBtn = `<span style="color:#27ae60; font-weight:bold; font-size:1.2rem;">✓</span>`;
                }

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #f0f0f0';
                tr.innerHTML = `
                    <td style="padding: 15px;">
                        <div style="font-weight: 600; color: var(--text-main);">${rsvp.student_name} ${rsvp.student_surname}</div>
                        <div style="font-size: 0.8rem; color: #888;">${rsvp.student_email}</div>
                    </td>
                    <td style="padding: 15px;">
                        <span style="background:#f8f9fa; border:1px solid #eee; padding:2px 8px; border-radius:4px; font-size:0.85rem; color:#555;">
                            ${rsvp.role_name || 'General'}
                        </span>
                    </td>
                    <td style="padding: 15px;">${statusBadge}</td>
                    <td style="padding: 15px;">${timeLog}</td>
                    <td style="padding: 15px; text-align: right;">${actionBtn}</td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.btn-signin').forEach(btn => {
                btn.addEventListener('click', () => handleAttendance(btn.dataset.id, 'signin', activityId));
            });
            document.querySelectorAll('.btn-signout').forEach(btn => {
                btn.addEventListener('click', () => handleAttendance(btn.dataset.id, 'signout', activityId));
            });

        } catch (err) {
            console.error(err);
            document.getElementById('attendanceTableBody').innerHTML = '<tr><td colspan="5" style="color:red; text-align:center;">Error loading data.</td></tr>';
        }
    }

    async function renderStudentStats() {
        mainContent.innerHTML = `<div class="loader"></div>`;

        try {
            const response = await fetch('/api/users/stats/');
            const data = await response.json();
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

            let recruitmentBadge = '';
    
            if (data.recruits_count > 0) {
                recruitmentBadge = `
                    <div style="margin-top:10px; background: rgba(255,255,255,0.15); padding: 6px 15px; border-radius: 20px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
                        <span>🤝</span> 
                        <span><b>${data.recruits_count}</b> Students Recruited</span>
                    </div>
                `;
            }

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

            let awardsListHtml = '';
    
            if (data.awards && data.awards.length > 0) {
                awardsListHtml = `<div style="display: flex; flex-direction: column; gap: 8px; margin: 15px 0;">`;
                
                data.awards.forEach(award => {
                    awardsListHtml += `
                        <div style="
                            display: flex; 
                            align-items: center; 
                            gap: 10px; 
                            padding: 8px 12px; 
                            background: ${award.color}10; /* 10% opacity hex */
                            border-left: 3px solid ${award.color};
                            border-radius: 4px;
                            font-size: 0.9rem;
                            color: #333;
                        ">
                            <span style="font-size: 1.2rem;">${award.icon}</span>
                            <span style="font-weight: 600;">${award.name}</span>
                        </div>
                    `;
                });
                awardsListHtml += `</div>`;
            } else {
                awardsListHtml = `
                    <div style="text-align: center; margin: 20px 0; color: #aaa;">
                        <div style="font-size: 2rem; opacity: 0.5; margin-bottom: 5px;">🏆</div>
                        <div style="font-size: 0.85rem;">No awards yet.</div>
                    </div>
                `;
            }

            const executiveBadgeHtml = data.executive_position 
            ? `<div style="
                display: inline-block;
                background: #fff;
                color: #E35205; /* UJ Orange */
                padding: 4px 12px; 
                border-radius: 15px; 
                font-size: 0.75rem; 
                font-weight: 800; 
                text-transform: uppercase; 
                letter-spacing: 0.5px;
                margin-bottom: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                ⭐ ${data.executive_position}
            </div>`
            : '';

            mainContent.innerHTML = `
                <div class="stats-hero">
                    <div class="hero-content">
                        <div style="width: 80px; height: 80px; background: white; border-radius: 50%; display:flex; align-items:center; justify-content:center; color: #1a1a2e; font-weight:800; font-size: 2rem; border: 4px solid #FF8C42; flex-shrink: 0;">
                            ME
                        </div>
                        
                        <div class="hero-number">${data.total_hours}</div>
                        
                        <div class="hero-text" style="flex-grow: 1;">

                            ${executiveBadgeHtml}

                            <h2>Volunteering Hours</h2>
                            <p>${data.motivation}</p>

                            ${recruitmentBadge}
                            
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
                            
                            <div class="stat-list-item" style="border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 10px;">
                                <span class="stat-label">Total Events</span>
                                <span class="stat-val">${data.events_count}</span>
                            </div>

                            <div style="font-size: 0.8rem; font-weight: 700; color: #888; text-transform: uppercase; margin-bottom: 5px;">
                                Honors
                            </div>
                            
                            ${awardsListHtml}

                            <div style="text-align: center; margin-top: auto; padding-top: 15px; border-top: 1px solid #eee;">
                                <div class="rank-badge" style="display:inline-block; font-size: 0.85rem; padding: 4px 12px;">
                                    Position #${data.rank} on Leaderboard
                                </div>
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
                                <select name="campus" disabled style="background-color: #e9ecef; cursor: not-allowed;">
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
                        e.target.reset(); 
                    } else {

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

            document.getElementById('notifToggle').addEventListener('change', async (e) => {
                 const isChecked = e.target.checked;
                 await fetch('/api/users/profile/', {
                     method: 'PATCH',
                     headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
                     body: JSON.stringify({ receive_notifications: isChecked })
                 });
            });

            document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
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

    async function handleAttendance(signupId, action, activityId) {
        const actionText = action === 'signin' ? "Start Timer" : "Stop Timer & Log Hours";
        if(!confirm(`Are you sure you want to ${actionText} for this student?`)) return;

        try {
            const response = await fetch(`/api/attendance/${signupId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                },
                body: JSON.stringify({ action: action })
            });

            const data = await response.json();

            if (response.ok) {
                renderAttendanceSheet(activityId);
            } else {
                let errorMessage = data.error || "Action failed";
                
                if (errorMessage.includes("This event is on")) {
                    alert("📅 DATE MISMATCH:\n\n" + errorMessage);
                } else if (errorMessage.includes("starts at")) {
                    alert("⏰ TOO EARLY:\n\n" + errorMessage);
                } else {
                    alert("⚠️ Error:\n" + errorMessage);
                }
            }

        } catch (err) {
            console.error("Attendance Error:", err);
            alert("Network error. Please check your connection.");
        }
    }

    async function renderStudentTable() {
        let currentUserCampus = null;
        try {
            const userRes = await fetch('/api/users/profile/');
            const userData = await userRes.json();
            currentUserCampus = userData.campus;
        } catch (e) {
            console.error("Could not fetch user info", e);
        }

        mainContent.innerHTML = `
            <div class="header-section">
                <h1>Student Volunteers</h1>
                <p>Manage roles, view details, and assign annual awards.</p>
            </div>

            <div style="display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap;">
                <input type="text" id="studentSearchInput" placeholder="Search by name or student no..." 
                    style="flex: 2; padding: 10px; border: 1px solid #ddd; border-radius: 6px; min-width: 200px;">
                
                <select id="campusFilter" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; min-width: 120px;">
                    <option value="">All Campuses</option>
                    <option value="APB">APB</option>
                    <option value="DFC">DFC</option>
                    <option value="APK">APK</option>
                    <option value="SWC">SWC</option>
                </select>

                <select id="roleFilter" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; min-width: 120px;">
                    <option value="">All Roles</option>
                    <option value="Executive">Executives Only</option>
                    <option value="Volunteer">Volunteers Only</option>
                </select>

                <select id="sortFilter" style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 6px; min-width: 120px;">
                    <option value="name">Sort by Name</option>
                    <option value="hours_desc">Most Hours (High-Low)</option>
                    <option value="hours_asc">Least Hours (Low-High)</option>
                </select>
            </div>

            <div style="background:white; border-radius:12px; box-shadow:0 2px 5px rgba(0,0,0,0.05); overflow-x:auto; margin-bottom: 40px;">
                <table style="width:100%; border-collapse:collapse; min-width:900px;"> 
                    <thead>
                        <tr style="background:#f9f9f9; text-align:left;">
                            <th style="padding:15px; border-bottom:1px solid #eee;">Name</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Student No</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Role</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Total Hours</th>
                            <th style="padding:15px; border-bottom:1px solid #eee;">Honors & Awards</th> 
                            <th style="padding:15px; border-bottom:1px solid #eee;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="dynamicStudentBody">
                        <tr><td colspan="6" style="padding:20px; text-align:center;">Loading students...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="header-section" style="margin-bottom: 15px;">
                <h2>Event Qualifiers</h2>
                <p>Students who have earned enough hours to attend major events.</p>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; padding-bottom: 40px;">
                
                <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-top: 5px solid #27ae60;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                        <h3 style="margin:0; color: #27ae60;">🥾 Hiking Trip</h3>
                        <span style="background:#e8f8f0; color:#27ae60; padding:4px 10px; border-radius:15px; font-size:0.8rem; font-weight:bold;">40+ Hours</span>
                    </div>
                    <div id="hikingList" style="max-height: 300px; overflow-y: auto;">
                        Loading...
                    </div>
                </div>

                <div style="background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-top: 5px solid #FF8C42;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
                        <h3 style="margin:0; color: #FF8C42;">🏕️ Annual Camp</h3>
                        <span style="background:#FFF4EC; color:#FF8C42; padding:4px 10px; border-radius:15px; font-size:0.8rem; font-weight:bold;">80+ Hours</span>
                    </div>
                    <div id="campList" style="max-height: 300px; overflow-y: auto;">
                        Loading...
                    </div>
                </div>
            </div>
        `;

        let allStudents = [];
        try {
            const response = await fetch('/api/users/students/');
            if (!response.ok) throw new Error('Failed to load');
            allStudents = await response.json();
            
            renderRows(allStudents);
            renderQualifiers(allStudents);

            const inputs = ['studentSearchInput', 'campusFilter', 'roleFilter', 'sortFilter'];
            inputs.forEach(id => {
                document.getElementById(id).addEventListener(id === 'studentSearchInput' ? 'input' : 'change', applyFilters);
            });

            function applyFilters() {
                const query = document.getElementById('studentSearchInput').value.toLowerCase();
                const campus = document.getElementById('campusFilter').value;
                const roleType = document.getElementById('roleFilter').value;
                const sortBy = document.getElementById('sortFilter').value;

                let filtered = allStudents.filter(student => {
                    const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
                    const studentNo = (student.student_number || '').toLowerCase();
                    const matchesSearch = fullName.includes(query) || studentNo.includes(query);
                    const matchesCampus = campus === "" || student.campus === campus;
                    let matchesRole = true;
                    if (roleType === 'Executive') matchesRole = !!student.executive_position;
                    if (roleType === 'Volunteer') matchesRole = !student.executive_position;
                    return matchesSearch && matchesCampus && matchesRole;
                });

                filtered.sort((a, b) => {
                    if (sortBy === 'hours_desc') return b.total_hours - a.total_hours;
                    if (sortBy === 'hours_asc') return a.total_hours - b.total_hours;
                    if (a.campus !== b.campus) return a.campus.localeCompare(b.campus);
                    return a.first_name.localeCompare(b.first_name);
                });

                renderRows(filtered);
            };

        } catch (err) {
            console.error(err);
            const tbody = document.getElementById('dynamicStudentBody');
            if(tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center;">Error loading students.</td></tr>';
        }

        function renderRows(studentsToRender) {
            const tbody = document.getElementById('dynamicStudentBody');
            tbody.innerHTML = ''; 

            if (studentsToRender.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#999;">No matching students found.</td></tr>';
                return;
            }

            let lastCampus = null;

            studentsToRender.forEach(student => {
                if (student.campus !== lastCampus) {
                    const divider = document.createElement('tr');
                    divider.innerHTML = `
                        <td colspan="6" style="background:#f1f4f8; padding:8px 15px; font-weight:bold; color:#444; border-top:1px solid #ddd; border-bottom:1px solid #ddd;">
                            📍 ${student.campus || 'Unknown Campus'}
                        </td>
                    `;
                    tbody.appendChild(divider);
                    lastCampus = student.campus;
                }


                const isSameCampus = !currentUserCampus || (student.campus === currentUserCampus);
                const buttonStyle = isSameCampus 
                    ? "padding:6px 12px; border:1px solid #ddd; background:white; cursor:pointer; border-radius:4px;"
                    : "padding:6px 12px; border:1px solid #eee; background:#f9f9f9; color:#aaa; cursor:not-allowed; border-radius:4px;";
                const buttonAttr = isSameCampus 
                    ? `onclick="openModal('${student.id}', '${student.first_name} ${student.last_name}', '${student.executive_position || ""}', ${JSON.stringify(student.awards || []).replace(/"/g, "&quot;")})"`
                    : `disabled title="You can only manage students from ${currentUserCampus}"`;

                const roleBadge = student.executive_position 
                    ? `<span style="background:#FFF4EC; color:#FF8C42; padding:4px 8px; border-radius:4px; font-weight:600; font-size:0.8rem;">${student.executive_position}</span>` 
                    : `<span style="background:#f0f0f0; color:#666; padding:4px 8px; border-radius:4px; font-size:0.8rem;">Volunteer</span>`;

                let awardsHtml = '<span style="color:#ccc; font-size:0.8rem;">-</span>';
                if (student.awards && student.awards.length > 0) {
                    awardsHtml = `<div style="display:flex; gap:5px; flex-wrap:wrap;">`;
                    student.awards.forEach(award => {
                        awardsHtml += `<div title="${award.name}" style="background: ${award.color}15; border: 1px solid ${award.color}; color: ${award.color === '#FFD700' ? '#B8860B' : award.color}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; display: flex; align-items: center; gap: 4px; white-space: nowrap;"><span>${award.icon}</span> ${award.name}</div>`;
                    });
                    awardsHtml += `</div>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:15px; border-bottom:1px solid #eee;">
                        <div style="font-weight:600;">${student.first_name} ${student.last_name}</div>
                        <div style="font-size:0.85rem; color:#888;">${student.email}</div>
                    </td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">${student.student_number || '-'}</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">${roleBadge}</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;"><strong>${student.total_hours.toFixed(1)}</strong> hrs</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">${awardsHtml}</td>
                    <td style="padding:15px; border-bottom:1px solid #eee;">
                        <button class="manage-btn" style="${buttonStyle}" ${buttonAttr}>Manage Role</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function renderQualifiers(students) {
            const hikingQualifiers = students.filter(s => s.total_hours >= 40);
            const campQualifiers = students.filter(s => s.total_hours >= 80);

            const generateList = (list) => {
                if (list.length === 0) return '<div style="padding:15px; text-align:center; color:#999; font-style:italic;">No students qualified yet.</div>';
                
                return list.map(s => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <div style="display:flex; align-items:center; gap: 10px;">
                            <div style="width:32px; height:32px; background:#f0f0f0; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:bold; color:#666;">
                                ${s.first_name.charAt(0)}${s.last_name.charAt(0)}
                            </div>
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">${s.first_name} ${s.last_name}</div>
                                <div style="font-size:0.75rem; color:#888;">${s.campus}</div>
                            </div>
                        </div>
                        <div style="font-weight:bold; color:#444;">${s.total_hours.toFixed(0)}h</div>
                    </div>
                `).join('');
            };

            document.getElementById('hikingList').innerHTML = generateList(hikingQualifiers);
            document.getElementById('campList').innerHTML = generateList(campQualifiers);
        }
    }

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

        fetchMyEvents();
        document.getElementById('createEventForm').addEventListener('submit', handleEventSubmit);
        document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
    }

    async function fetchMyEvents() {
        const tbody = document.getElementById('myEventsTableBody');
        try {
            const response = await fetch('/api/activities/mine/'); 
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

            document.querySelectorAll('.attendance-btn').forEach(btn => {
                btn.addEventListener('click', () => renderAttendanceSheet(btn.dataset.id, btn.dataset.title));
            });

            document.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => loadEventIntoForm(allEvents.find(e => e.id == btn.dataset.id)));
            });

            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteEvent(btn.dataset.id));
            });

            document.querySelectorAll('.duplicate-btn').forEach(btn => {
                btn.addEventListener('click', () => duplicateEvent(allEvents.find(e => e.id == btn.dataset.id)));
            });

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading list.</td></tr>';
        }
    }

    function duplicateEvent(event) {
        document.querySelector('.dashboard-form-wrapper').scrollIntoView({ behavior: 'smooth' });
        document.getElementById('formTitle').textContent = `New Event (Copy of ${event.title})`;
        document.getElementById('submitEventBtn').textContent = 'Publish New Event';
        document.getElementById('cancelEditBtn').style.display = 'inline-block'; 
        document.getElementById('eventIdField').value = '';
        document.getElementById('inputTitle').value = event.title; 
        document.getElementById('inputCampus').value = event.campus;
        document.getElementById('inputDuration').value = event.duration_hours;
        document.getElementById('inputSpots').value = event.total_spots;
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';
        document.getElementById('inputDate').value = '';

        const checkboxes = document.querySelectorAll('input[name="role_types"]');
        checkboxes.forEach(cb => cb.checked = false); 
        if (event.roles && Array.isArray(event.roles)) {
            event.roles.forEach(roleObj => {
                const matching = document.querySelector(`input[name="role_types"][value="${roleObj.role_type}"]`);
                if (matching) matching.checked = true;
            });
        }

        document.getElementById('imagePreviewContainer').style.display = 'none';
        document.getElementById('imagePreview').src = '';
        document.getElementById('imageHelpText').style.display = 'none';
        
    }

    function loadEventIntoForm(event) {

        document.querySelector('.dashboard-form-wrapper').scrollIntoView({ behavior: 'smooth' });
        document.getElementById('formTitle').textContent = `Editing: ${event.title}`;
        document.getElementById('submitEventBtn').textContent = 'Update Event';
        document.getElementById('cancelEditBtn').style.display = 'inline-block';
        document.getElementById('eventIdField').value = event.id;
        document.getElementById('inputTitle').value = event.title;
        document.getElementById('inputCampus').value = event.campus;
        document.getElementById('inputDuration').value = event.duration_hours;
        document.getElementById('inputSpots').value = event.total_spots;
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';


        if (event.date_time) {
            const d = new Date(event.date_time);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            document.getElementById('inputDate').value = d.toISOString().slice(0, 16);
        }

        const checkboxes = document.querySelectorAll('input[name="role_types"]');
        checkboxes.forEach(cb => cb.checked = false);

        if (event.roles && Array.isArray(event.roles)) {
            event.roles.forEach(roleObj => {
                const matchingCheckbox = document.querySelector(`input[name="role_types"][value="${roleObj.role_type}"]`);
                if (matchingCheckbox) {
                    matchingCheckbox.checked = true;
                }
            });
        }

        const previewContainer = document.getElementById('imagePreviewContainer');
        const previewImg = document.getElementById('imagePreview');
        const helpText = document.getElementById('imageHelpText');

        if (event.image) {
            previewContainer.style.display = 'block';
            previewImg.src = event.image;
            helpText.style.display = 'block'; 
        } else {
            previewContainer.style.display = 'none';
            previewImg.src = '';
            helpText.style.display = 'none';
        }
    }

    function resetForm() {
        const form = document.getElementById('createEventForm');
        const titleHeading = document.getElementById('formTitle');
        const cancelBtn = document.getElementById('cancelEditBtn');
        const imagePreviewContainer = document.getElementById('imagePreviewContainer');
        const imageHelpText = document.getElementById('imageHelpText');
        
        form.reset();
        
        document.getElementById('eventIdField').value = '';


        if(titleHeading) titleHeading.textContent = "Create New Event";
        if(document.getElementById('submitEventBtn')) document.getElementById('submitEventBtn').textContent = "Publish Event";
        
        if(cancelBtn) cancelBtn.style.display = 'none';

        if(imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if(imageHelpText) imageHelpText.style.display = 'none';
    }

    async function deleteEvent(id) {
        if (!confirm('Are you sure you want to delete this event?')) return;

        try {
            const response = await fetch(`/api/activities/${id}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': getCookie('csrftoken') }
            });

            if (response.ok) {
                fetchMyEvents(); 
                resetForm();     
            } else {
                alert('Failed to delete.');
            }
        } catch (err) {
            console.error(err);
            alert('Network error.');
        }
    }

    async function handleEventSubmit(e) {
        e.preventDefault();
        const btn = document.getElementById('submitEventBtn');
        const originalText = btn.textContent;
        btn.textContent = 'Processing...';
        btn.disabled = true;

        const formData = new FormData(e.target);
        const eventId = formData.get('event_id');

        const checkboxes = document.querySelectorAll('input[name="role_types"]:checked');
        
        formData.delete('role_types');
        
        checkboxes.forEach((checkbox) => {
            formData.append('role_types', checkbox.value);
        });

        const url = eventId ? `/api/activities/${eventId}/` : '/api/activities/create/';
        const method = eventId ? 'PATCH' : 'POST'; 

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'X-CSRFToken': getCookie('csrftoken') },
                body: formData
            });

            if (response.ok) {
                alert(eventId ? 'Event Updated!' : 'Event Created!');
                fetchMyEvents();
                resetForm();    
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

 
        window.openSignupModal = (activity) => {
        document.getElementById('signupEventId').value = activity.id;
        document.getElementById('signupEventTitle').textContent = activity.title;
        
        const container = document.getElementById('rolesCheckboxContainer');
        container.innerHTML = ''; 
        
        if (activity.roles && activity.roles.length > 0) {
            activity.roles.forEach(role => {
                const roleLabel = role.get_role_type_display || role.role_type;
                
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '10px';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = 'selected_roles'; 
                checkbox.value = role.id;
                checkbox.id = `role_${role.id}`;
                
                const label = document.createElement('label');
                label.htmlFor = `role_${role.id}`;
                label.textContent = roleLabel;
                label.style.cursor = 'pointer';
                label.style.fontSize = '0.95rem';
                label.style.color = '#333';

                wrapper.appendChild(checkbox);
                wrapper.appendChild(label);
                container.appendChild(wrapper);
            });
        } else {
             container.innerHTML = '<p style="color:#666; font-style:italic;">No specific roles. You will be signed up as a General Volunteer.</p>';
        }

        signupModal.style.display = 'flex';
    }

    window.closeSignupModal = () => {
        signupModal.style.display = 'none';
    }

    const rsvpForm = document.getElementById('rsvpForm');
    if (rsvpForm) {
        rsvpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('confirmRsvpBtn');
            btn.textContent = 'Signing up...';
            btn.disabled = true;

            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());

            const selectedCheckboxes = document.querySelectorAll('input[name="selected_roles"]:checked');
            const roleIds = Array.from(selectedCheckboxes).map(cb => cb.value);
            
            data.selected_roles = roleIds; 

            const hasRolesAvailable = document.querySelectorAll('input[name="selected_roles"]').length > 0;
            if (hasRolesAvailable && roleIds.length === 0) {
                alert("Please select at least one role to continue.");
                btn.textContent = 'Confirm & Sign Up';
                btn.disabled = false;
                return;
            }

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
                    renderActivities(); 
                } else {
                    const err = await response.json();
                    if (err.detail) alert(err.detail); 
                    else if (err.non_field_errors) alert(err.non_field_errors[0]);
                    else alert('Error: ' + JSON.stringify(err));
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

    const modal = document.getElementById('roleModal');
    const form = document.getElementById('assignRoleForm');
    
    let cachedAwardsList = null;

    window.openModal = async (id, name, currentRole, currentAwards = []) => {
        document.getElementById('selectedStudentId').value = id;
        document.getElementById('modalStudentName').textContent = `For: ${name}`;
        document.getElementById('roleSelect').value = currentRole || ""; 

        modal.style.display = 'flex';

        const container = document.getElementById('awardsCheckboxContainer');
        
        if (!cachedAwardsList) {
            try {
                const res = await fetch('/api/awards/');
                if (res.ok) cachedAwardsList = await res.json();
            } catch (err) {
                console.error("Error loading awards", err);
                container.innerHTML = '<span style="color:red">Error loading awards.</span>';
                return;
            }
        }

        if (!cachedAwardsList || cachedAwardsList.length === 0) {
            container.innerHTML = '<span style="color:#999">No awards found in system.</span>';
        } else {
            container.innerHTML = ''; 
            
            const studentAwardIds = currentAwards.map(a => a.id);

            cachedAwardsList.forEach(award => {
                const isChecked = studentAwardIds.includes(award.id) ? 'checked' : '';
                
                const div = document.createElement('div');
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.gap = '8px';
                
                div.innerHTML = `
                    <input type="checkbox" 
                           id="award_${award.id}" 
                           name="selected_awards_ids" 
                           value="${award.id}" 
                           ${isChecked}>
                    <label for="award_${award.id}" style="cursor:pointer; font-size:0.9rem;">
                        ${award.icon} ${award.name}
                    </label>
                `;
                container.appendChild(div);
            });
        }
    }

    window.closeModal = () => {
        modal.style.display = 'none';
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const studentId = document.getElementById('selectedStudentId').value;
            const position = document.getElementById('roleSelect').value;
            
            const checkboxes = document.querySelectorAll('input[name="selected_awards_ids"]:checked');
            const awardIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
            
            const csrfToken = getCookie('csrftoken');

            try {

                const response = await fetch(`/api/users/students/${studentId}/update/`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({ 
                        executive_position: position,
                        awards: awardIds
                    })
                });

                if (response.ok) {
                    closeModal();
                    renderStudentTable(); 
                    alert("Student updated successfully");
                } else {
                    const err = await response.json();
                    alert('Error updating: ' + JSON.stringify(err));
                }
            } catch (err) {
                console.error(err);
                alert("Network Error");
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