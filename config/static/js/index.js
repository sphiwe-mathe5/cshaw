document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Sidebar Navigation Logic ---
    const mainContent = document.getElementById('mainContent');
    const linkActivities = document.getElementById('link-activities');
    const linkStudents = document.getElementById('link-manage-students');

    const linkCreateEvent = document.getElementById('link-create-event');
    const navItemCreateEvent = document.getElementById('nav-item-create-event');
    
    const navItemActivities = document.getElementById('nav-item-activities');
    const navItemStudents = document.getElementById('nav-item-students');

    const execLink = document.getElementById('link-exec-attendance');
    if (execLink) {
        execLink.addEventListener('click', (e) => {
            e.preventDefault();
            renderExecutiveAttendancePage();
            // Update active state in sidebar
            document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById('nav-item-exec-attendance').classList.add('active');
        });
    }

    // Inside your main event listener or init function
    // --- REPORTING TAB CLICK HANDLER ---
    const reportLink = document.getElementById('link-event-reports');
    
    if (reportLink) {
        reportLink.addEventListener('click', (e) => {
            e.preventDefault();

            // 1. Remove 'active' from ALL sidebar items
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });

            // 2. Add 'active' to THIS item
            // (We highlight both the LI and the A tag to cover all CSS frameworks)
            const parentLi = reportLink.closest('.nav-item');
            if (parentLi) parentLi.classList.add('active');
            reportLink.classList.add('active');

            // 3. Render the View
            renderReportsDashboard();
        });
    }

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

// Global variables
    let currentSignupId = null;
    let currentActionType = null;
    let currentActivityId = null;

    // 1. Open the Action Modal
    window.openActionModal = function(signupId, studentName, action, activityId) {
        currentSignupId = signupId;
        currentActionType = action;
        currentActivityId = activityId;
        
        const modal = document.getElementById('actionModal');
        if (!modal) {
            console.error("Modal element 'actionModal' not found in DOM");
            return;
        }

        // Set Content
        const title = action === 'signin' ? 'Start Timer' : 'Stop Timer';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalStudentName').textContent = studentName;
        
        // Reset Time Input to current time
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        document.getElementById('manualTimeInput').value = timeStr; 

        // --- FIX IS HERE: BIND THE BUTTON ---
        // We must tell the button to run 'submitAttendanceAction' when clicked
        document.getElementById('confirmActionBtn').onclick = window.submitAttendanceAction;
        // ------------------------------------

        // Show Modal
        modal.style.display = 'flex';
    }

    // 2. Submit Logic (Attached to window to be safe)
    window.submitAttendanceAction = async function() {
        const manualTime = document.getElementById('manualTimeInput').value;
        window.closeActionModal(); // Close immediately for better UX
        
        try {
            const csrfToken = getCookie('csrftoken');
            
            const response = await fetch(`/api/attendance/${currentSignupId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ 
                    action: currentActionType,
                    manual_time: manualTime 
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Refresh the table using the global render function
                renderAttendanceSheet(currentActivityId);
            } else {
                window.showCustomAlert("Action Failed", data.error || "Unknown error occurred", "❌");
            }
        } catch (err) {
            console.error(err);
            window.showCustomAlert("Network Error", "Please check your connection.", "⚠️");
        }
    }

    // 3. Close Modal Function
    window.closeActionModal = function() {
        const modal = document.getElementById('actionModal');
        if (modal) modal.style.display = 'none';
    }

    // 4. Custom Alert Function
    window.showCustomAlert = function(title, message, icon="⚠️") {
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertMessage').textContent = message;
        document.getElementById('alertIcon').textContent = icon;
        document.getElementById('alertModal').style.display = 'flex';
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
            let allActivities = await response.json();

            // 1. FILTER: Show events from Today onwards (Midnight Cutoff)
            const cutoff = new Date();
            cutoff.setHours(0, 0, 0, 0); 
            allActivities = allActivities.filter(activity => new Date(activity.date_time) >= cutoff);

            if (allActivities.length === 0) {
                mainContent.innerHTML = `
                    <div class="header-section"><h1>${pageTitle}</h1><p>${pageSubtitle}</p></div>
                    <div class="cards-grid">
                        <p style="grid-column: 1/-1; text-align: center; color: #7F8C8D;">No upcoming events found. Check back later!</p>
                    </div>`;
                return;
            }

            // 2. GROUPING LOGIC
            const groups = {};
            
            allActivities.forEach(activity => {
                const seriesName = activity.title.replace(/\s\(Day\s\d+\)$/i, '').trim();
                
                if (!groups[seriesName]) {
                    groups[seriesName] = [];
                }
                groups[seriesName].push(activity);
            });

            // 3. SORTING LOGIC (The Fix)
            // Convert groups into an array so we can sort them
            const displayList = Object.keys(groups).map(name => {
                const events = groups[name];
                
                // A. Sort events INSIDE the group (Day 1 before Day 2)
                events.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
                
                return {
                    name: name,
                    events: events,
                    // B. Determine the "Sort Date" for this group (Date of the first event)
                    startDate: new Date(events[0].date_time)
                };
            });

            // C. Sort the List by Start Date (Closest First)
            displayList.sort((a, b) => a.startDate - b.startDate);

            // 4. GENERATE HTML
            let cardsHtml = '';
            
            displayList.forEach(item => {
                if (item.events.length === 1) {
                    // Single Event
                    cardsHtml += createSingleEventCard(item.events[0]);
                } else {
                    // Series Folder
                    cardsHtml += createSeriesFolderCard(item.name, item.events);
                }
            });

            // 5. RENDER TO PAGE
            mainContent.innerHTML = `
                <div class="header-section">
                    <h1>${pageTitle}</h1>
                    <p>${pageSubtitle}</p>
                </div>
                <div class="cards-grid">
                    ${cardsHtml}
                </div>
                <footer class="minimal-footer" style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
                    <div class="footer-copyright">&copy; 2026 C-SHAW Hub. All rights reserved.</div>
                </footer>
            `;

            // 6. RE-ATTACH LISTENERS
            allActivities.forEach(activity => {
                const btn = document.getElementById(`view-btn-${activity.id}`);
                if (btn) {
                    btn.addEventListener('click', () => renderActivityDetails(activity));
                }
            });

        } catch (error) {
            console.error(error);
            mainContent.innerHTML = `<div class="header-section"><h1>Error</h1><p>Could not load activities.</p></div>`;
        }
    }

    // --- HELPER 1: STANDARD CARD HTML ---
    function createSingleEventCard(activity) {
        const imageStyle = activity.image 
            ? `background-image: url('${activity.image}'); background-size: cover; background-position: center;` 
            : `background-color: #BDC3C7; display: flex; align-items: center; justify-content: center; content: 'No Image'; color: white;`;

        const dateObj = new Date(activity.date_time);

        // 2. FIX: Add 'timeZone: UTC' to the options to prevent the +2 hour shift
        const dateStr = dateObj.toLocaleDateString('en-GB', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short',
            timeZone: 'Africa/Johannesburg' // <--- IMPORTANT: Forces it to stick to the DB time
        });

        const timeStr = dateObj.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false,   // Optional: Use 'false' for 09:00 or 'true' for 9:00 AM
            timeZone: 'Africa/Johannesburg'  // <--- IMPORTANT: Prevents converting to 11:00
        });

        const startDate = new Date(activity.date_time);

        // 2. Calculate End Date (Start Time + Duration in Milliseconds)
        // Duration is in hours, so: hours * 60 mins * 60 secs * 1000 ms
        const durationMs = (activity.duration_hours || 0) * 60 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);

        const startTimeStr = startDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'
        });

        const endTimeStr = endDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'
        });
        const spotsColor = activity.spots_left > 5 ? '#27ae60' : '#e74c3c';

        // Check signed up status
        const isSignedUp = activity.is_signed_up; 

        return `
            <div class="card">
                <div class="card-image" style="${imageStyle} position: relative;">
                    ${isSignedUp ? '<div style="position: absolute; top: 10px; right: 10px; background: #27ae60; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✓ Signed Up</div>' : ''}
                </div>
                <div class="card-body">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <span class="card-badge">${activity.campus} Campus</span>
                        <span style="font-size:0.8rem; font-weight:700; color:${spotsColor};">${activity.spots_left} spots left</span>
                    </div>
                    <h3>${activity.title}</h3>
                    <p style="font-size: 0.85rem; color: #95a5a6; margin-bottom: 10px;">
                        📅 ${dateStr} at ⏰ ${startTimeStr} - ${endTimeStr} <br>
                        ⏳ ${activity.duration_hours} Hours
                    </p>
                    <p>${activity.description.substring(0, 80)}...</p>
                    <button id="view-btn-${activity.id}" class="btn-card-action">View Details</button>
                </div>
            </div>
        `;
    }

    // --- HELPER 2: SERIES FOLDER CARD HTML ---
    function createSeriesFolderCard(seriesName, events) {
        const firstEvent = events[0]; // We use the first event to get the Image & Campus
        const lastEvent = events[events.length - 1];
        
        // Date Range
        const startStr = new Date(firstEvent.date_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = new Date(lastEvent.date_time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

        const folderId = seriesName.replace(/\s+/g, '-').toLowerCase();

        // Image Logic
        const imageStyle = firstEvent.image 
            ? `background-image: url('${firstEvent.image}'); background-size: cover; background-position: center;` 
            : `background-color: #34495e; display: flex; align-items: center; justify-content: center; color: white;`;

        // Generate Mini-Rows
        const rowsHtml = events.map(ev => {
            const dayDate = new Date(ev.date_time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                    <div style="font-size: 0.85rem; color: #333;">
                        <strong>${dayDate}</strong> <span style="color:#7f8c8d; font-size:0.8rem;">(${ev.spots_left} spots)</span>
                    </div>
                    <button id="view-btn-${ev.id}" style="font-size: 0.75rem; padding: 4px 8px; border: 1px solid #3498db; background: transparent; color: #3498db; border-radius: 4px; cursor: pointer;">
                        View Details
                    </button>
                </div>
            `;
        }).join('');

        return `
            <div class="card series-folder" style="border: 2px solid #E35205; position: relative; overflow: visible;">
                <div style="position: absolute; top: -10px; left: 20px; background: #E35205; color: white; padding: 2px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                    Event Series
                </div>

                <div class="card-image" style="${imageStyle} height: 120px;"></div>
                
                <div class="card-body">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <div style="display:flex; gap: 6px;">
                            <span class="card-badge">${firstEvent.campus}</span>
                            <span class="card-badge" style="background: #34495e;">${events.length} Days</span>
                        </div>
                        <span style="font-size:0.75rem; color: #7F8C8D; font-weight: 600;">${startStr} - ${endStr}</span>
                    </div>
                    
                    <h3 style="margin-top: 5px;">${seriesName}</h3>
                    <p style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 15px;">
                        This event runs over multiple days. Open the folder to see all available shifts.
                    </p>

                    <button onclick="toggleFolder('${folderId}')" style="width: 100%; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; color: #333; font-weight: 600; cursor: pointer; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <span>📂 Open Series Folder</span>
                        <span>▼</span>
                    </button>

                    <div id="folder-${folderId}" style="display: none; margin-top: 15px; border-top: 2px solid #eee; padding-top: 5px;">
                        ${rowsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // --- HELPER 3: TOGGLE SCRIPT ---
    // Add this to window so the HTML onclick can find it
    window.toggleFolder = function(id) {
        const el = document.getElementById(`folder-${id}`);
        if (el.style.display === 'none') {
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    };

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
        const timeStr = dateObj.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit', 
            hour12: false,   // Optional: Use 'false' for 09:00 or 'true' for 9:00 AM
            timeZone: 'Africa/Johannesburg' // <--- IMPORTANT: Prevents converting to 11:00
        });

        const durationMs = (activity.duration_hours || 0) * 60 * 60 * 1000;
        
        const startDate = new Date(activity.date_time); 
        const endDate = new Date(startDate.getTime() + durationMs);
        const startTimeStr = startDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'
        });

        const endTimeStr = endDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'
        });
       

        

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

            else if (isPast) {
                actionButtonHtml = `
                    <button disabled style="background:#bdc3c7; color:white; padding: 15px 40px; font-size:1.1rem; border:none; border-radius:4px; cursor:not-allowed;">
                        Event Ended
                    </button>
                    <p style="text-align:center; color:#999; margin-top:10px; font-size:0.9rem;">
                        This event has already taken place.
                    </p>
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
                                📅 ${fullDate} &nbsp;|&nbsp; ⏰ ${startTimeStr} - ${endTimeStr} &nbsp;|&nbsp; ⏳ ${activity.duration_hours} Hours
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

    async function renderAttendanceSheet(activityId, backHandler) {
        const goBack = backHandler || renderCreateEventForm; 
        
        // --- 1. SETUP HEADER WITH BULK BUTTON ---
        document.getElementById('mainContent').innerHTML = `
            <div class="header-section">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button id="backToManage" style="background:none; border:none; color:#666; cursor:pointer; font-weight: 500;">
                        &larr; Back to Events
                    </button>
                    
                    <button id="bulkSignOutBtn" style="display:none; background:#2c3e50; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:0.9rem;">
                        ⚡ Sign Out Remaining
                    </button>
                </div>
                
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

        document.getElementById('backToManage').onclick = goBack;

        try {
            const [activityRes, rsvpsRes] = await Promise.all([
                fetch(`/api/activities/${activityId}/`),      
                fetch(`/api/activities/${activityId}/rsvps/`) 
            ]);

            if (!activityRes.ok || !rsvpsRes.ok) throw new Error("Failed to load data");

            const activity = await activityRes.json();
            const rsvps = await rsvpsRes.json();

            // --- DATE CALCULATIONS ---
            const startDate = new Date(activity.date_time);
            const durationMs = (parseFloat(activity.duration_hours) || 0) * 60 * 60 * 1000;
            const endDate = new Date(startDate.getTime() + durationMs);

            // Formatting options (South Africa)
            const dateOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' };
            const timeOptions = { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg', hour12: false };

            const dateStr = startDate.toLocaleDateString('en-GB', dateOptions);
            const startTimeStr = startDate.toLocaleTimeString('en-GB', timeOptions);
            const endTimeStr = endDate.toLocaleTimeString('en-GB', timeOptions);
            
            // Note: We need the Start Time String (HH:MM) for manual sign-ins later
            const rawStartTime = startDate.toLocaleTimeString('en-GB', { ...timeOptions }); 

            const infoHtml = `
                <span style="color: var(--primary-orange); font-weight:700; font-size: 1.1rem;">${activity.title}</span>
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="color: #666;">${dateStr}</span>
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="color: #666;">${startTimeStr} - ${endTimeStr}</span>
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="color: #666; font-weight:500;">${activity.campus} Campus</span>
            `;
            document.getElementById('activityHeader').innerHTML = infoHtml;

            const tbody = document.getElementById('attendanceTableBody');
            
            if (rsvps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="padding:40px; text-align:center; color:#999; font-style:italic;">No students have RSVPed yet.</td></tr>';
                return;
            }

            // Check if we should show the Bulk Button (Are there any people "In Progress"?)
            const hasPendingStudents = rsvps.some(r => r.sign_in_time && !r.sign_out_time);
            const bulkBtn = document.getElementById('bulkSignOutBtn');
            
            if (hasPendingStudents) {
                bulkBtn.style.display = 'block';
                bulkBtn.onclick = async () => {
                    const confirmMsg = `Are you sure you want to sign out all remaining students?\n\nThey will be signed out at the official end time (${endTimeStr}).`;
                    if (confirm(confirmMsg)) {
                        try {
                            const csrfToken = getCookie('csrftoken');
                            const res = await fetch(`/api/activities/${activityId}/bulk_signout/`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken }
                            });
                            const data = await res.json();
                            if(res.ok) {
                                alert(data.message);
                                renderAttendanceSheet(activityId, backHandler); // Refresh table
                            } else {
                                alert("Error: " + data.error);
                            }
                        } catch(e) { console.error(e); alert("Network error"); }
                    }
                };
            }

            tbody.innerHTML = '';

            const timeFmt = { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false, 
                timeZone: 'Africa/Johannesburg' 
            };
            
            // --- ROW GENERATION ---
            rsvps.forEach(rsvp => {
                let statusBadge = '<span style="background:#f1f1f1; padding:4px 10px; border-radius:12px; color:#666; font-size:0.85rem;">Pending</span>';
                let timeLog = '<span style="color:#ccc;">--:--</span>';
                let actionBtn = '';

                // Pass Start Time as Minimum for inputs
                const minTimeAttr = `data-min="${rawStartTime}"`;

                if (rsvp.sign_in_time && !rsvp.sign_out_time) {
                    // --- CASE A: IN PROGRESS ---
                    const signInDate = new Date(rsvp.sign_in_time);
                    const signInTimeStr = signInDate.toLocaleTimeString('en-GB', timeFmt);
                    
                    statusBadge = '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:500;">● In Progress</span>';
                    timeLog = `<span style="color:#2e7d32; font-weight:600;">In: ${signInTimeStr}</span>`;
                    
                    // Allow sign out (Min time = Sign In time)
                    const signOutMin = signInDate.toLocaleTimeString('en-GB', timeFmt);
                    
                    actionBtn = `<button class="btn-signout" data-id="${rsvp.id}" data-name="${rsvp.student_name}" data-min="${signOutMin}"
                        style="padding:6px 16px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(231,76,60,0.2);">Sign Out</button>`;
                } 
                else if (rsvp.sign_out_time) {
                    // --- CASE B: COMPLETED (UPDATED) ---
                    
                    // 1. Get readable In/Out times
                    const inTime = new Date(rsvp.sign_in_time).toLocaleTimeString('en-GB', timeFmt);
                    const outTime = new Date(rsvp.sign_out_time).toLocaleTimeString('en-GB', timeFmt);

                    statusBadge = '<span style="background:#e3f2fd; color:#1565c0; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:500;">✓ Completed</span>';
                    
                    // 2. Format the Time Log Column
                    timeLog = `
                        <div style="line-height:1.2;">
                            <strong style="color:#333; font-size:1rem;">${rsvp.hours_earned} Hrs</strong>
                            <div style="font-size:0.75rem; color:#888; margin-top:2px;">
                                (${inTime} - ${outTime})
                            </div>
                        </div>
                    `;
                    
                    actionBtn = `<span style="color:#27ae60; font-weight:bold; font-size:1.2rem;">✓</span>`;
                }
                else {
                    // --- CASE C: NOT STARTED ---
                    actionBtn = `<button class="btn-signin" data-id="${rsvp.id}" data-name="${rsvp.student_name}" ${minTimeAttr}
                        style="padding:6px 16px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(39,174,96,0.2);">Sign In</button>`;
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

            // --- ATTACH LISTENERS ---
            document.querySelectorAll('.btn-signin').forEach(btn => {
                btn.addEventListener('click', () => {
                     openActionModal(btn.dataset.id, btn.dataset.name, 'signin', activityId, btn.dataset.min);
                });
            });
            
            document.querySelectorAll('.btn-signout').forEach(btn => {
                btn.addEventListener('click', () => {
                      openActionModal(btn.dataset.id, btn.dataset.name, 'signout', activityId, btn.dataset.min);
                });
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

            const isExec = data.is_executive || (data.executive_position && data.executive_position !== "None");

            const execBadge = isExec ? `
                <div style="
                    display: inline-block;
                    border: 1px solid #FF6B35;
                    color: #FF6B35;
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    margin-bottom: 15px;
                    background: rgba(255, 107, 53, 0.1);
                    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                ">
                    ★ ${data.executive_position || 'Executive Member'}
                </div>
            ` : '';

            const recruitsRow = data.recruits_count > 0 ? `
                <div class="stat-list-item">
                    <span class="stat-label">Students Recruited</span>
                    <span class="stat-val" style="color:#27ae60; font-weight:bold;">${data.recruits_count}</span>
                </div>
            ` : '';

            mainContent.innerHTML = `
                <style>
                    @media (max-width: 768px) {
                        .stats-hero {
                            padding: 20px !important;
                            width: 115% !important;
                            margin-left: -2rem !important;
                            margin-right: 0 !important;
                        }
                    }
                </style>
                <div class="stats-hero" style="
                    background-color: #111125; 
                    background-image: radial-gradient(circle at 10% 20%, rgba(255, 107, 53, 0.05) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(78, 205, 196, 0.05) 0%, transparent 20%);
                    color: white; 
                    padding: 40px; 
                    border-radius: 20px; 
                    box-shadow: 0 20px 50px rgba(0,0,0,0.3);
                    position: relative;
                    margin-bottom: 30px;
                    border: 1px solid #1f1f3a;
                    width: 100%;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                        
                        <div>
                            ${execBadge}
                            <h1 style="margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -1px;">
                                ${data.first_name} ${data.last_name}
                            </h1>
                            <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; color: #6b6b90; font-weight: 500;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                <span>${data.campus || 'UJ'} Volunteer</span>
                            </div>
                        </div>

                        <div style="text-align: right;">
                            <div style="
                                font-size: 5rem; 
                                font-weight: 800; 
                                line-height: 1; 
                                color: #FF6B35;
                                letter-spacing: -2px;
                            ">
                                ${data.total_hours}
                            </div>
                            <div style="color: #6b6b90; font-size: 0.8rem; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-top: 5px;">
                                Hours Earned
                            </div>
                        </div>
                    </div>

                    <div style="
                        border-left: 4px solid #FF6B35; 
                        padding-left: 20px; 
                        margin-bottom: 40px;
                        color: #a0a0c0;
                        font-style: italic;
                        font-size: 1.1rem;
                        line-height: 1.6;
                        max-width: 700px;
                    ">
                        "${data.motivation || 'Service to others is the rent you pay for your room here on earth.'}"
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px;">
                        
                        <div style="background: #19192f; padding: 25px; border-radius: 16px; text-align: center; border: 1px solid #252545;">
                            <div style="color: #FF6B35; margin-bottom: 10px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                            </div>
                            <div style="font-size: 2rem; font-weight: 700; color: white;">${data.remaining}</div>
                            <div style="color: #6b6b90; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px;">Remaining</div>
                        </div>

                        <div style="background: #19192f; padding: 25px; border-radius: 16px; text-align: center; border: 1px solid #252545;">
                            <div style="color: #FF6B35; margin-bottom: 10px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                            <div style="font-size: 2rem; font-weight: 700; color: white;">${Math.round(data.progress_percent)}%</div>
                            <div style="color: #6b6b90; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px;">Progress</div>
                        </div>

                    </div>

                    <div>
                        <div style="display: flex; justify-content: space-between; color: #6b6b90; font-size: 0.9rem; font-weight: 600; margin-bottom: 10px;">
                            <span>Progress to Goal</span>
                            <span style="color: white;">${data.remaining} hours left</span>
                        </div>
                        
                        <div style="height: 12px; background: #252545; border-radius: 6px; position: relative;">
                            <div style="
                                width: ${data.progress_percent}%; 
                                height: 100%; 
                                background: linear-gradient(90deg, #FF6B35, #FF8C42); 
                                border-radius: 6px;
                                box-shadow: 0 0 20px rgba(255, 107, 53, 0.4);
                            "></div>
                        </div>

                        <div style="display: flex; justify-content: space-between; margin-top: 8px; color: #4a4a6a; font-size: 0.75rem; font-weight: 600;">
                            <span>0%</span>
                            <span>25%</span>
                            <span>50%</span>
                            <span>75%</span>
                            <span>100%</span>
                        </div>
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

                            ${recruitsRow}

                            <div style="border-bottom: 1px solid #eee; margin: 15px 0 10px 0;"></div>

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
                const buttonStyle = "padding:6px 12px; border:1px solid #ddd; background:white; cursor:pointer; border-radius:4px;";
                const buttonAttr = `onclick="openModal('${student.id}', '${student.first_name} ${student.last_name}', '${student.executive_position || ""}', ${JSON.stringify(student.awards || []).replace(/"/g, "&quot;")})"`;

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
                            
                            <div class="form-group" style="background: #f0f4f8; padding: 15px; border-radius: 8px; border-left: 4px solid #3498db;">
                                <label style="color:#2c3e50; font-weight:bold;">Event Type</label>
                                <select id="eventTypeSelect" onchange="toggleDateInputs()" style="width:100%; padding:8px; border-radius:4px; border:1px solid #ddd;">
                                    <option value="single">Single Day Event</option>
                                    <option value="multi">Multi-Day Series</option>
                                </select>
                            </div>

                            <div class="form-group">
                                <label>Event Image</label>
                                <input type="file" name="image" accept="image/*">
                            </div>

                            <div class="form-group">
                                <label>Event Name</label>
                                <input type="text" name="title" id="inputTitle" required placeholder="e.g. Mass Testing">
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
                                
                                <div id="singleDateGroup" style="flex-grow:1;">
                                    <label>Event Date</label>
                                    <input type="date" name="date_only" id="inputDateOnly" required>
                                </div>
                            </div>

                            <div id="multiDateGroup" style="display:none; background: #fff5e6; padding: 15px; border-radius: 8px; border: 1px solid #ffeebb; margin-bottom: 20px;">
                                <h4 style="margin-top:0; color:#E35205;">Series Date Range</h4>
                                <div class="form-row">
                                    <div><label>Start Date</label><input type="date" id="multiStartDate"></div>
                                    <div><label>End Date</label><input type="date" id="multiEndDate"></div>
                                </div>
                            </div>

                            <div class="form-group" style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #eee;">
                                <label style="color:#2c3e50; font-weight:bold;">Time Schedule</label>
                                
                                <div class="form-row">
                                    <div>
                                        <label>Start Time</label>
                                        <input type="time" name="start_time" id="inputStartTime" required onchange="calculateDuration()">
                                    </div>
                                    <div>
                                        <label>End Time</label>
                                        <input type="time" name="end_time" id="inputEndTime" required onchange="calculateDuration()">
                                    </div>
                                </div>

                                <div class="form-row" style="margin-top: 15px;">
                                    <div style="flex-grow: 1;">
                                        <label>Calculated Duration (Hours)</label>
                                        <input type="number" name="duration_hours" id="inputDuration" step="0.1" readonly style="background-color: #e9ecef; cursor: not-allowed; color: #E35205; font-weight: bold;">
                                    </div>
                                    <div>
                                        <label>Spots (Per Day)</label>
                                        <input type="number" name="total_spots" id="inputSpots" min="1" required>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-group"><label>Short Description</label><input type="text" name="description" id="inputDesc" required></div>
                            <div class="form-group"><label>Full Details</label><textarea name="details" id="inputDetails" rows="4" required></textarea></div>
                            <div class="form-group"><label>Additional Info</label><textarea name="additional_details" id="inputAdditional" rows="2"></textarea></div>

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
        // Target the specific container for the left column
        const eventListContainer = document.querySelector('.event-list-container');
        const tbody = document.getElementById('myEventsTableBody');
        
        try {
            const response = await fetch('/api/activities/mine/'); 
            if (!response.ok) throw new Error(`Error ${response.status}`);
            const allEvents = await response.json();
            
            // --- 1. PREPARE DATA ---
            const cutoff = new Date();
            cutoff.setHours(0, 0, 0, 0); // Midnight Reset

            const upcomingEvents = allEvents.filter(e => new Date(e.date_time) >= cutoff);
            const pastEvents = allEvents.filter(e => new Date(e.date_time) < cutoff);

            // Sort
            upcomingEvents.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
            pastEvents.sort((a, b) => new Date(b.date_time) - new Date(a.date_time));

            // --- 2. RENDER UPCOMING (Main Table) ---
            tbody.innerHTML = '';
            if (upcomingEvents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#999;">No upcoming events.</td></tr>';
            } else {
                upcomingEvents.forEach(event => tbody.appendChild(createCoordinatorRow(event)));
            }

            // --- 3. RENDER HISTORY (Inside the same container, below the table) ---
            
            // First, remove old history block if it exists (to prevent duplicates on refresh)
            const existingHistory = document.getElementById('myHistorySection');
            if (existingHistory) existingHistory.remove();

            if (pastEvents.length > 0) {
                const historyHtml = `
                    <div id="myHistorySection" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
                        
                        <div style="padding: 0 20px 10px 20px;">
                            <button onclick="toggleMyHistory()" style="width:100%; background:#f8f9fa; border:1px solid #ddd; padding:10px; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-weight:600; color:#555;">
                                <span style="display:flex; align-items:center; gap:8px;">
                                    🕒 Past Events
                                    <span style="background:#e9ecef; color:#666; font-size:0.75rem; padding:2px 8px; border-radius:10px;">${pastEvents.length}</span>
                                </span>
                                <span id="historyChevron">▼</span>
                            </button>
                        </div>

                        <div id="myHistoryContainer" style="display:none; border-top:1px solid #eee;">
                            <table style="width: 100%; border-collapse: collapse;">
                                <thead style="background:#f9f9f9; color:#888; font-size:0.8rem;">
                                    <tr>
                                        <th style="text-align: left; padding:10px 20px;">Title</th>
                                        <th style="text-align: left; padding:10px;">Date</th>
                                        <th style="text-align: center; padding:10px;">Spots</th>
                                        <th style="text-align: right; padding:10px 20px;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="myHistoryTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                `;

                // INJECT INSIDE THE LEFT COLUMN (event-list-container)
                eventListContainer.insertAdjacentHTML('beforeend', historyHtml);

                // Populate History Rows
                const historyBody = document.getElementById('myHistoryTableBody');
                pastEvents.forEach(event => {
                    // We reuse the same row creator, but maybe style it slightly differently if needed
                    const row = createCoordinatorRow(event);
                    row.style.opacity = '0.8'; // Slight visual distinction for history
                    historyBody.appendChild(row);
                });
            }

            // --- 4. ATTACH LISTENERS ---
            attachActionListeners(allEvents);

        } catch (err) {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="4" style="color:red; text-align:center;">Error loading events.</td></tr>';
        }
    }

    // --- HELPER: Toggle Function (Add this globally or inside script) ---
    window.toggleMyHistory = function() {
        const container = document.getElementById('myHistoryContainer');
        const chevron = document.getElementById('historyChevron');
        if (container.style.display === 'none') {
            container.style.display = 'block';
            chevron.innerHTML = '▲';
        } else {
            container.style.display = 'none';
            chevron.innerHTML = '▼';
        }
    }

    // --- HELPER 1: ROW CREATOR ---
    function createCoordinatorRow(event) {
        const startDate = new Date(event.date_time);
        const durationMs = (parseFloat(event.duration_hours) || 0) * 60 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);

        // Date/Time Formatting (South Africa)
        const opts = { timeZone: 'Africa/Johannesburg' };
        const dateStr = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
        const startTimeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...opts });
        const endTimeStr = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...opts });

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        
        tr.innerHTML = `
            <td style="padding: 15px; font-weight: 600; color: var(--text-main);">
                ${event.title}
                <div style="font-size: 0.75rem; color: #999; font-weight: normal; margin-top:2px;">${event.campus}</div>
            </td>

            <td style="padding: 15px; color: var(--text-main);">
                ${dateStr}
                <div style="font-size: 0.75rem; color: #999; margin-top: 4px;">
                    ⏰ ${startTimeStr} - ${endTimeStr}
                </div>
            </td>
            
            <td style="padding: 15px; text-align: center; font-family: monospace; font-size: 0.95rem;">
                <span style="color: ${event.spots_left > 0 ? '#27ae60' : '#e74c3c'}">${event.spots_left}</span> 
                <span style="color: #ccc;">/</span> 
                ${event.total_spots}
            </td>
            
            <td style="padding: 15px; text-align: right;">
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="icon-btn attendance-btn" data-id="${event.id}" data-title="${event.title}" 
                        title="Attendance" style="background: #FFF4EC; color: #E35205; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">
                        📋
                    </button>
                    
                    <button class="icon-btn duplicate-btn" data-id="${event.id}" 
                        title="Duplicate" style="background: #f3e5f5; color: #8e24aa; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">
                        ❐
                    </button>
                    
                    <button class="icon-btn edit-btn" data-id="${event.id}" 
                        title="Edit" style="background: #e3f2fd; color: #1565c0; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">
                        ✏️
                    </button>

                    <button class="icon-btn delete-btn" data-id="${event.id}" 
                        title="Delete" style="background: #ffebee; color: #c62828; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        return tr;
    }

    // --- HELPER 2: LISTENER ATTACHMENT ---
    function attachActionListeners(allEvents) {
        // Attendance
        document.querySelectorAll('.attendance-btn').forEach(btn => {
            btn.onclick = () => renderAttendanceSheet(btn.dataset.id, renderCreateEventForm);
        });
        
        // Edit
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.onclick = () => loadEventIntoForm(allEvents.find(e => e.id == btn.dataset.id));
        });
        
        // Delete
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.onclick = () => deleteEvent(btn.dataset.id);
        });
        
        // Duplicate
        document.querySelectorAll('.duplicate-btn').forEach(btn => {
            btn.onclick = () => duplicateEvent(allEvents.find(e => e.id == btn.dataset.id));
        });
    }

    function renderExecutiveAttendancePage() {
        mainContent.innerHTML = `
            <style>
                /* Scoped styles for this view */
                .responsive-table-wrapper {
                    width: 100%;
                    overflow-x: auto; /* Enables horizontal scroll on mobile */
                    -webkit-overflow-scrolling: touch;
                    padding-bottom: 10px;
                }
                
                .styled-table {
                    width: 100%;
                    border-collapse: collapse;
                    min-width: 600px; /* CRITICAL: Forces table to be wide enough so it doesn't squish text */
                }

                .styled-table thead tr {
                    background-color: #f8f9fa;
                    color: #666;
                    text-align: left;
                    font-weight: 600;
                }

                .styled-table th, 
                .styled-table td {
                    padding: 12px 15px; /* More breathing room */
                    border-bottom: 1px solid #eee;
                }

                .styled-table tbody tr:last-of-type {
                    border-bottom: 2px solid #E35205; /* Orange accent at bottom of list */
                }
            </style>

            <div class="event-list-container">
                <div style="padding: 20px; border-bottom: 1px solid #eee; background: #fff; position: sticky; top: 0; z-index: 11;">
                    <h3 style="margin: 0; color: var(--text-main); font-size: 1.1rem;">Manage Campus Attendance</h3>
                    <p style="font-size: 0.85rem; color: #666; margin-top: 5px;">Upcoming events happening at your campus.</p>
                </div>
                
                <div class="responsive-table-wrapper">
                    <table class="styled-table">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Title</th>
                                <th style="text-align: left;">Date & Time</th>
                                <th style="text-align: center;">Spots</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="execEventsTableBody">
                            <tr><td colspan="4" style="padding: 20px; text-align: center; color: #888;">Loading events...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        fetchExecutiveEvents();
    }

    // 2. Fetch Events for the Executive's Campus

    async function fetchExecutiveEvents() {
        const tbody = document.getElementById('execEventsTableBody'); // Upcoming
        
        try {
            const response = await fetch('/api/activities/executive-list/'); 
            
            if (!response.ok) {
                if(response.status === 403) throw new Error("Permission Denied");
                throw new Error(`Error ${response.status}`);
            }
            
            const allEvents = await response.json();
            
            if (!Array.isArray(allEvents) || allEvents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center;">No events found for your campus.</td></tr>';
                return;
            }

            // --- 1. SPLIT EVENTS (MIDNIGHT RESET FIX) ---
            const cutoff = new Date();
            cutoff.setHours(0, 0, 0, 0); // Set to 00:00:00 Today

            // Upcoming = Today + Future
            const upcomingEvents = allEvents.filter(e => new Date(e.date_time) >= cutoff);
            
            // Past = Yesterday and before
            const pastEvents = allEvents.filter(e => new Date(e.date_time) < cutoff);
            // --------------------------------------------

            // --- SORTING LOGIC ---
            // Upcoming: Ascending (Soonest first)
            upcomingEvents.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
            
            // Past: Descending (Most recent history first) -> Changed this for better UX
            pastEvents.sort((a, b) => new Date(b.date_time) - new Date(a.date_time));
            // ---------------------

            // 2. Render Upcoming
            tbody.innerHTML = '';
            if (upcomingEvents.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:#999;">No upcoming events. Check history.</td></tr>';
            } else {
                upcomingEvents.forEach(event => {
                    tbody.appendChild(createExecutiveRow(event, false)); // false = isHistory
                });
            }

            // 3. Render History Section
            const container = document.querySelector('.event-list-container');
            
            // Remove existing history section if re-rendering to prevent duplicates
            const existingHistory = document.getElementById('historySection');
            if (existingHistory) existingHistory.remove();

            if (pastEvents.length > 0) {
                const historyHtml = `
                    <style>
                        /* Mobile Responsive Styles for History Table */
                        .history-responsive-wrapper {
                            width: 100%;
                            overflow-x: auto;
                            -webkit-overflow-scrolling: touch;
                            margin-top: 15px;
                            border: 1px solid #eee;
                            border-radius: 8px;
                            background: #fafafa;
                        }
                        
                        .history-table {
                            width: 100%;
                            border-collapse: collapse;
                            min-width: 600px;
                        }

                        .history-table th {
                            background-color: #f1f3f5;
                            color: #6c757d;
                            font-size: 0.75rem;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            padding: 12px 15px;
                            border-bottom: 2px solid #e9ecef;
                            white-space: nowrap;
                        }

                        #historyTableBody tr {
                            background-color: #fff;
                            color: #666;
                        }
                    </style>

                    <div id="historySection" style="margin-top: 40px; padding-top: 20px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                            <button onclick="toggleHistory()" style="background: #f8f9fa; border: 1px solid #e9ecef; color: #495057; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 10px 15px; border-radius: 6px; width: 100%; justify-content: space-between; transition: all 0.2s;">
                                <span style="display:flex; align-items:center; gap:8px;">
                                    🕒 Past Events History 
                                    <span style="background:#e9ecef; color:#666; font-size:0.75rem; padding:2px 6px; border-radius:10px;">${pastEvents.length}</span>
                                </span>
                                <span id="historyArrow" style="color:#adb5bd;">▼</span>
                            </button>
                        </div>
                        
                        <div id="historyTableContainer" style="display:none;">
                            <div class="history-responsive-wrapper">
                                <table class="history-table">
                                    <thead>
                                        <tr>
                                            <th style="text-align: left;">Title</th>
                                            <th style="text-align: left;">Date</th>
                                            <th style="text-align: center;">Spots</th>
                                            <th style="text-align: right;">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="historyTableBody"></tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `;
                
                container.insertAdjacentHTML('beforeend', historyHtml);

                const historyBody = document.getElementById('historyTableBody');
                pastEvents.forEach(event => {
                    historyBody.appendChild(createExecutiveRow(event, true)); // true = isHistory
                });
            }

            // Re-attach listeners
            document.querySelectorAll('.attendance-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                     // Updated: Pass title to function if needed, or just ID
                     // Ensure renderAttendanceSheet handles the 2nd argument or ignore it
                     renderAttendanceSheet(btn.dataset.id, btn.dataset.back); 
                });
            });

        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="4" style="color:red; text-align:center;">${err.message}</td></tr>`;
        }
    }

    // --- HELPER 1: Create Row HTML ---
    function createExecutiveRow(event, isHistory) {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #eee';
        if (isHistory) tr.style.background = '#fafafa';

        // Time calculations (UTC Fixed)
        const startDate = new Date(event.date_time);
        const dateStr = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg'});
        const durationMs = (parseFloat(event.duration_hours) || 0) * 60 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);
        const startTimeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'});
        const endTimeStr = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'});

        const baseStyle = 'padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer;';
        const btnStyle = isHistory 
            ? `${baseStyle} background: #f0f0f0; color: #666; border: 1px solid #ccc;` 
            : `${baseStyle} background: #FFF4EC; color: #E35205; border: 1px solid #ffccb3;`;

        const btnText = isHistory ? '👁️ View' : '📋 Manage';

        tr.innerHTML = `
            <td style="padding: 15px; font-weight: 600; color: var(--text-main);">
                ${event.title}
                <div style="font-size: 0.75rem; color: #999; font-weight: normal; margin-top:2px;">${event.campus}</div>
            </td>

            <td style="padding: 15px; color: var(--text-main);">
                ${dateStr}
                <div style="font-size: 0.75rem; color: #999; margin-top: 4px;">
                     ⏰ ${startTimeStr} - ${endTimeStr} 
                     <span style="color:#bbb;">(${event.duration_hours}h)</span>
                </div>
            </td>
            
            <td style="padding: 15px; text-align: center; font-family: monospace; font-size: 0.95rem;">
                <span style="color: ${event.spots_left > 0 ? '#27ae60' : '#e74c3c'}">${event.spots_left}</span> 
                <span style="color: #ccc;">/</span> 
                ${event.total_spots}
            </td>
            
            <td style="padding: 15px; text-align: right;">
                <button class="attendance-btn" data-id="${event.id}" data-title="${event.title}" 
                    title="${isHistory ? 'View Past Records' : 'Manage Attendance'}" 
                    style="${btnStyle}">
                    ${btnText}
                </button>
            </td>
        `;
        return tr;
    }

    // --- HELPER 2: Toggle History ---
    window.toggleHistory = function() {
        const div = document.getElementById('historyTableContainer');
        const arrow = document.getElementById('historyArrow');
        if (div.style.display === 'none') {
            div.style.display = 'block';
            arrow.textContent = '▲';
        } else {
            div.style.display = 'none';
            arrow.textContent = '▼';
        }
    };

    async function renderReportsDashboard() {
        // Basic Layout with Search
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>Event Reports & Analytics</h1>
                <p>AI-powered insights and campus comparisons.</p>
            </div>

            <div style="max-width: 800px; margin: 0 auto;">
                
                <div style="display:flex; gap:10px; margin-bottom:20px; background:#f1f3f5; padding:5px; border-radius:8px; width:fit-content;">
                    <button id="btnViewEvents" onclick="switchReportView('events')" class="toggle-btn active-toggle" 
                        style="border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-weight:600;">
                        Event List
                    </button>
                    <button id="btnViewQuarterly" onclick="switchReportView('quarterly')" class="toggle-btn" 
                        style="border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-weight:600; color:#666;">
                        Quarterly Overview
                    </button>
                </div>

                <div id="reportSelectionView">
                    <input type="text" id="reportSearch" class="report-search-bar" placeholder="🔍 Search for an event to analyze...">
                    <div id="reportEventList" style="background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); overflow: hidden;">
                        <div style="padding:40px; text-align:center; color:#999;">Loading past events...</div>
                    </div>
                </div>

                <div id="quarterlyView" style="display:none;">
                    <div id="quarterlyContent">
                        <div class="loader"></div>
                    </div>
                </div>

                <div id="reportDetailView" style="display:none;">
                    <button id="backToReportsListBtn" style="background:none; border:none; color:#666; cursor:pointer; margin-bottom:15px; display:flex; align-items:center; gap:5px; font-weight:500;">
                        &larr; Back to List
                    </button>
                    <div id="reportContentArea"></div>
                </div>
            </div>
        `;

        // Fetch Completed Events
        try {
            const response = await fetch('/api/activities/executive-list/'); // Or a dedicated endpoint for past events
            const allEvents = await response.json();
            
            // Filter only past events (Logic: End time < Now)
            const pastEvents = allEvents.filter(e => new Date(e.date_time) < new Date());
            
            // Render List
            const listContainer = document.getElementById('reportEventList');
            
            if (pastEvents.length === 0) {
                listContainer.innerHTML = '<div style="padding:40px; text-align:center;">No past events found to report on.</div>';
                return;
            }

            listContainer.innerHTML = '';
            pastEvents.forEach(event => {
                const dateStr = new Date(event.date_time).toLocaleDateString('en-GB', {day: 'numeric', month:'short', year:'numeric'});
                
                const item = document.createElement('div');
                item.style.cssText = "padding: 15px 20px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;";
                item.innerHTML = `
                    <div>
                        <div style="font-weight: 600; color: #2c3e50;">${event.title}</div>
                        <div style="font-size: 0.85rem; color: #888;">${dateStr} • ${event.campus}</div>
                    </div>
                    <div style="color: #3498db; font-size: 0.9rem; font-weight: 600;">View Report &rarr;</div>
                `;
                
                // Add Hover Effect
                item.onmouseover = () => item.style.background = "#f8f9fa";
                item.onmouseout = () => item.style.background = "white";
                
                // Click Handler -> Load Detail
                item.onclick = () => loadEventReportDetail(event.id);
                
                listContainer.appendChild(item);
            });

            const backBtn = document.getElementById('backToReportsListBtn');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    // Option A: Re-render the whole dashboard (simplest)
                    renderReportsDashboard();
                    
                    // Option B: Just toggle visibility (faster/smoother)
                    // document.getElementById('reportDetailView').style.display = 'none';
                    // document.getElementById('reportSelectionView').style.display = 'block';
                });
            }

            const style = document.createElement('style');
            style.innerHTML = `
                .toggle-btn.active-toggle { background: #fff; color: #E35205; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .toggle-btn:not(.active-toggle) { background: transparent; }
            `;
            document.head.appendChild(style);

            // Initial Load: Events
            loadReportEventsList(); 
            

            // Search Functionality
            document.getElementById('reportSearch').addEventListener('input', (e) => {
                const term = e.target.value.toLowerCase();
                Array.from(listContainer.children).forEach(row => {
                    const text = row.innerText.toLowerCase();
                    row.style.display = text.includes(term) ? 'flex' : 'none';
                });
            });

        } catch (err) {
            console.error(err);
            document.getElementById('reportEventList').innerHTML = '<div style="padding:20px; color:red; text-align:center;">Failed to load events.</div>';
        }
    }

    // 3. Load List of Past Events for Reports
    async function loadReportEventsList() {
        const listContainer = document.getElementById('reportEventList');
        if (!listContainer) return;

        // Show loading state
        listContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">Loading past events...</div>';

        try {
            // Fetch all events for the executive/coordinator
            const response = await fetch('/api/activities/executive-list/');
            if (!response.ok) throw new Error("Failed to load events");

            const allEvents = await response.json();
            
            // Filter: Only show events that have already happened (Date < Now)
            const pastEvents = allEvents.filter(e => new Date(e.date_time) < new Date());
            
            // Sort: Most recent events at the top
            pastEvents.sort((a, b) => new Date(b.date_time) - new Date(a.date_time));

            if (pastEvents.length === 0) {
                listContainer.innerHTML = '<div style="padding:40px; text-align:center; color:#7f8c8d;">No past events found to report on.</div>';
                return;
            }

            // Render the list
            listContainer.innerHTML = '';
            pastEvents.forEach(event => {
                const dateStr = new Date(event.date_time).toLocaleDateString('en-GB', {
                    day: 'numeric', 
                    month:'short', 
                    year:'numeric'
                });
                
                const item = document.createElement('div');
                // Inline styles for list items
                item.style.cssText = "padding: 15px 20px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;";
                
                item.innerHTML = `
                    <div>
                        <div style="font-weight: 600; color: #2c3e50;">${event.title}</div>
                        <div style="font-size: 0.85rem; color: #888;">${dateStr} • ${event.campus}</div>
                    </div>
                    <div style="color: #E35205; font-size: 0.9rem; font-weight: 600;">View Report &rarr;</div>
                `;
                
                // Hover effects
                item.onmouseover = () => item.style.background = "#fff5f0"; // Light orange tint
                item.onmouseout = () => item.style.background = "white";
                
                // Click Handler
                item.onclick = () => loadEventReportDetail(event.id);
                
                listContainer.appendChild(item);
            });

        } catch (err) {
            console.error(err);
            listContainer.innerHTML = '<div style="padding:20px; color:red; text-align:center;">Failed to load events.</div>';
        }
    }

    // 2. Load Specific Report Details
    async function loadEventReportDetail(eventId) {
        // Switch Views
        document.getElementById('reportSelectionView').style.display = 'none';
        const detailView = document.getElementById('reportDetailView');
        detailView.style.display = 'block';
        
        const contentArea = document.getElementById('reportContentArea');
        contentArea.innerHTML = '<div class="loader"></div><p style="text-align:center; color:#666;">Crunching numbers & generating AI insights...</p>';

        try {
            // Call the API we created in Python
            const response = await fetch(`/api/reports/event/${eventId}/`);
            if (!response.ok) throw new Error("Failed to load report data");
            
            const data = await response.json();
            const stats = data.stats;
            
            // Render Full Dashboard
            contentArea.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:15px;">
                        <div>
                            <h2 style="margin:0; color:#2c3e50;">${stats.title}</h2>
                            <span style="color:#7f8c8d;">${stats.date} | ${stats.campus} Campus</span>
                        </div>
                        
                        <div style="display:flex; gap:10px;">
                            <button onclick="window.location.href='/api/reports/event/${eventId}/download/'" 
                                style="background:#fff; border:1px solid #2c3e50; color:#2c3e50; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;">
                                Download PDF ⬇️
                            </button>

                            <button onclick="openShareModal(${eventId})" 
                                style="background:#2c3e50; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;">
                                Share via Email 📧
                            </button>
                        </div>
                    </div>

                <div class="ai-insight-box">
                    <h4>✨ AI Managerial Insight</h4>
                    <p style="line-height: 1.6; color: #444;">${data.ai_analysis}</p>
                </div>

                <div class="report-grid">
                    <div class="report-card">
                        <h3>Attendance Rate</h3>
                        <div class="big-stat" style="color: ${stats.attendance_rate > 80 ? '#27ae60' : '#e67e22'}">
                            ${stats.attendance_rate}%
                        </div>
                        <div class="stat-subtext">${stats.attended_count} attended / ${stats.rsvp_count} RSVPs</div>
                    </div>

                    <div class="report-card">
                        <h3>Total Impact</h3>
                        <div class="big-stat" style="color: #2980b9;">
                            ${stats.total_hours}
                        </div>
                        <div class="stat-subtext">Volunteer Hours Generated</div>
                    </div>

                    <div class="report-card">
                        <h3>Punctuality</h3>
                        <div style="margin-top:10px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span>Early (>15m)</span> <strong>${stats.punctuality.early}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#27ae60;">
                                <span>On Time</span> <strong>${stats.punctuality.on_time}</strong>
                            </div>
                            <div style="display:flex; justify-content:space-between; color:#c0392b;">
                                <span>Late (>5m)</span> <strong>${stats.punctuality.late}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                </div> <div class="report-card" style="margin-top:20px;">
                    <h3 style="margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:10px;">📋 Facilitator Activity Log</h3>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                        <div>
                            <h4 style="margin:0 0 10px 0; color:#27ae60; font-size:0.95rem;">Checked In By:</h4>
                            ${stats.facilitators.sign_ins.length > 0 ? 
                                `<ul style="margin:0; padding-left:20px; color:#555;">
                                    ${stats.facilitators.sign_ins.map(f => `
                                        <li style="margin-bottom:4px;">
                                            <strong>${f.sign_in_facilitator__first_name} ${f.sign_in_facilitator__last_name}</strong>
                                            <span style="color:#999; font-size:0.85rem;">(${f.count} students)</span>
                                        </li>
                                    `).join('')}
                                </ul>` 
                                : '<p style="color:#ccc; font-style:italic; margin:0;">No manual check-ins recorded.</p>'
                            }
                        </div>

                        <div>
                            <h4 style="margin:0 0 10px 0; color:#c0392b; font-size:0.95rem;">Checked Out By:</h4>
                            ${stats.facilitators.sign_outs.length > 0 ? 
                                `<ul style="margin:0; padding-left:20px; color:#555;">
                                    ${stats.facilitators.sign_outs.map(f => `
                                        <li style="margin-bottom:4px;">
                                            <strong>${f.sign_out_facilitator__first_name} ${f.sign_out_facilitator__last_name}</strong>
                                            <span style="color:#999; font-size:0.85rem;">(${f.count} students)</span>
                                        </li>
                                    `).join('')}
                                </ul>` 
                                : '<p style="color:#ccc; font-style:italic; margin:0;">No manual check-outs recorded.</p>'
                            }
                        </div>
                    </div>
                </div>

                <div class="report-card" style="margin-top:20px;">
                    <h3>Campus Comparison (Similar Events)</h3>
                    ${renderComparisonTable(data.comparison)}
                </div>
            `;

        } catch (err) {
            console.error(err);
            contentArea.innerHTML = `<div style="color:red; text-align:center; padding:20px;">Error: ${err.message}</div>`;
        }
    }

    let currentShareId = null; // Renamed from currentShareEventId to be generic
    let shareType = 'EVENT';   // New variable to track what we are sharing

    function openShareModal(idOrType) {
        // Check if we are sharing a specific event or the yearly report
        if (idOrType === 'YEARLY') {
            shareType = 'YEARLY';
            currentShareId = new Date().getFullYear(); // Use current year as ID
        } else {
            shareType = 'EVENT';
            currentShareId = idOrType;
        }

        document.getElementById('shareEmails').value = ''; 
        document.getElementById('shareModal').style.display = 'flex';
    }
    window.openShareModal = openShareModal;

    // 3. Update the Confirm Button Logic
    document.getElementById('confirmShareBtn').addEventListener('click', async () => {
        const emails = document.getElementById('shareEmails').value;
        const btn = document.getElementById('confirmShareBtn');
        
        if (!emails) return alert("Please enter at least one email.");
        
        btn.textContent = "Sending...";
        btn.disabled = true;

        try {
            const csrfToken = getCookie('csrftoken');
            let url, bodyData;

            // DYNAMIC URL SELECTION
            if (shareType === 'YEARLY') {
                url = '/api/reports/quarterly/email/';
                bodyData = { emails: emails, year: currentShareId };
            } else {
                url = `/api/reports/event/${currentShareId}/email/`;
                bodyData = { emails: emails };
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify(bodyData)
            });

            const data = await response.json();
            
            if (response.ok) {
                alert(data.message);
                document.getElementById('shareModal').style.display = 'none';
            } else {
                alert("Error: " + data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Network Error");
        } finally {
            btn.textContent = "Send Report";
            btn.disabled = false;
        }
    });

    // Helper: Render Comparison Table
    function renderComparisonTable(comparisonData) {
        if (!comparisonData || comparisonData.length === 0) {
            return '<p style="color:#999; font-style:italic; padding:10px;">No comparable events found from other campuses.</p>';
        }

        let rows = comparisonData.map(comp => `
            <tr>
                <td><strong>${comp.campus}</strong></td>
                <td>${comp.date}</td>
                <td style="text-align:center;">${comp.attendance_rate}%</td>
                <td style="text-align:center; color:${comp.late_percentage > 20 ? '#c0392b' : '#27ae60'}">
                    ${comp.late_percentage}%
                </td>
                <td style="text-align:right;"><strong>${comp.total_hours}</strong> hrs</td>
            </tr>
        `).join('');

        return `
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Campus</th>
                        <th>Date</th>
                        <th style="text-align:center;">Attendance</th>
                        <th style="text-align:center;">Late %</th>
                        <th style="text-align:right;">Total Impact</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    // 1. Toggle Switch Logic
    window.switchReportView = function(viewName) {
        const eventView = document.getElementById('reportSelectionView');
        const quartView = document.getElementById('quarterlyView');
        const detailView = document.getElementById('reportDetailView');
        
        const btnEvents = document.getElementById('btnViewEvents');
        const btnQuart = document.getElementById('btnViewQuarterly');

        // Reset UI
        detailView.style.display = 'none'; // Hide details if open
        
        if (viewName === 'events') {
            eventView.style.display = 'block';
            quartView.style.display = 'none';
            
            btnEvents.classList.add('active-toggle');
            btnQuart.classList.remove('active-toggle');
            btnEvents.style.color = '#E35205';
            btnQuart.style.color = '#666';
            
        } else {
            eventView.style.display = 'none';
            quartView.style.display = 'block';
            
            btnEvents.classList.remove('active-toggle');
            btnQuart.classList.add('active-toggle');
            btnEvents.style.color = '#666';
            btnQuart.style.color = '#E35205';

            loadQuarterlyData(); // Load data when tab is clicked
        }
    }

    // 2. Load Quarterly Data (The API Call)
    // Updated: Load Quarterly Data (Detailed)
    async function loadQuarterlyData() {
        const container = document.getElementById('quarterlyContent');
        container.innerHTML = '<div class="loader"></div>';

        try {
            const year = new Date().getFullYear();
            const response = await fetch(`/api/reports/quarterly/?year=${year}`);
            if (!response.ok) throw new Error("Failed to load data");
            
            const result = await response.json();
            const data = result.data; // Now contains complex structure

            // Helper to determine color based on percentage
            const getColor = (pct) => pct >= 80 ? '#27ae60' : (pct >= 50 ? '#f39c12' : '#c0392b');

            let reportHtml = data.map(q => {
                // Only show quarters that have data (events OR stats)
                if (q.events.length === 0 && q.campus_stats.length === 0) return '';

                // 1. Build Event List HTML (Chips)
                const eventChips = q.events.map(e => 
                    `<span style="background:#f8f9fa; border:1px solid #eee; padding:4px 10px; border-radius:15px; font-size:0.8rem; display:inline-block; margin:2px;">
                        ${e.date}: <strong>${e.title}</strong>
                    </span>`
                ).join('');

                // 2. Build Campus Table HTML
                const campusRows = q.campus_stats.map(c => `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:10px; font-weight:600;">${c.name}</td>
                        <td style="padding:10px; text-align:center;">
                            <div style="font-weight:bold; color:${getColor(c.attendance_rate)}">
                                ${c.attendance_rate}%
                            </div>
                            <div style="font-size:0.75rem; color:#999;">${c.attended}/${c.rsvps}</div>
                        </td>
                        <td style="padding:10px; text-align:center;">
                            <div style="font-weight:bold; color:${getColor(c.punctuality_rate)}">
                                ${c.punctuality_rate}%
                            </div>
                            <div style="font-size:0.75rem; color:#999;">On Time</div>
                        </td>
                    </tr>
                `).join('');

                return `
                    <div class="report-card" style="margin-bottom: 30px; border-top: 4px solid #E35205;">
                        <h3 style="font-size:1.2rem; color:#2c3e50; margin-bottom:15px;">${q.quarter}</h3>
                        
                        <div style="margin-bottom:20px;">
                            <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:#666; text-transform:uppercase;">📅 Events Hosted</h4>
                            <div style="line-height:1.6;">${eventChips || '<span style="color:#ccc;">No events hosted.</span>'}</div>
                        </div>

                        <div>
                            <h4 style="margin:0 0 10px 0; font-size:0.9rem; color:#666; text-transform:uppercase;">🏆 Campus Performance</h4>
                            <table style="width:100%; border-collapse:collapse;">
                                <thead style="background:#f8f9fa;">
                                    <tr>
                                        <th style="text-align:left; padding:10px; font-size:0.8rem;">Campus</th>
                                        <th style="text-align:center; padding:10px; font-size:0.8rem;">Attendance Rate</th>
                                        <th style="text-align:center; padding:10px; font-size:0.8rem;">Punctuality</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${campusRows || '<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">No attendance data.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            }).join('');

            if (reportHtml.trim() === '') {
                container.innerHTML = `<div style="text-align:center; padding:40px; color:#999;">No data recorded for ${year} yet.</div>`;
            } else {
                container.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                     <h3 style="margin:0;">Yearly Overview: ${year}</h3>
                     
                     <div style="display:flex; gap:10px;">
                         <button onclick="window.location.href='/api/reports/quarterly/download/?year=${year}'" 
                            style="background:#fff; border:1px solid #2c3e50; color:#2c3e50; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;">
                            Download Report ⬇️
                         </button>

                         <button onclick="openShareModal('YEARLY')" 
                            style="background:#2c3e50; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:5px;">
                            Share Report 📧
                         </button>
                     </div>
                </div>
                    ${reportHtml}
                `;
            }

        } catch (err) {
            console.error(err);
            container.innerHTML = '<div style="color:red; text-align:center;">Error loading quarterly data.</div>';
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
        
        // --- UPDATED LOGIC STARTS HERE ---
        const eventType = document.getElementById('eventTypeSelect') ? document.getElementById('eventTypeSelect').value : 'single';

        if (eventType === 'multi') {
            // 1. Add the Flag
            formData.append('is_multi_day', 'true');
            
            // 2. Add the Multi-Day Date Range
            // We need to manually grab these because they don't have 'name' attributes 
            // (or to ensure we get the specific IDs)
            formData.append('start_date', document.getElementById('multiStartDate').value);
            formData.append('end_date', document.getElementById('multiEndDate').value);
            
            // NOTE: We do NOT need to append 'time' or 'duration' manually anymore.
            // Since we added name="start_time" and name="duration_hours" to the inputs in the HTML,
            // formData has already captured them automatically!
        } 
        // For 'single' mode, formData automatically captured 'date_only', 'start_time', and 'duration_hours'
        // because we gave the inputs those exact names in the HTML.
        // --- UPDATED LOGIC ENDS HERE ---


        const eventId = formData.get('event_id');

        // Handle Checkboxes (Standard logic)
        const checkboxes = document.querySelectorAll('input[name="role_types"]:checked');
        formData.delete('role_types'); 
        checkboxes.forEach((checkbox) => {
            formData.append('role_types', checkbox.value);
        });

        const url = eventId ? `/api/activities/${eventId}/` : '/api/activities/create/';
        
        // Multi-day creation is usually only for NEW events (POST)
        const method = eventId ? 'PATCH' : 'POST'; 

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'X-CSRFToken': getCookie('csrftoken') },
                body: formData
            });

            if (response.ok) {
                alert(eventId ? 'Event Updated!' : 'Events Created Successfully!');
                
                if(typeof fetchMyEvents === 'function') fetchMyEvents();
                
                document.getElementById('createEventForm').reset();
                
                // Reset toggle view
                if(window.toggleDateInputs) { 
                    document.getElementById('eventTypeSelect').value = 'single';
                    window.toggleDateInputs();
                }
                
            } else {
                const err = await response.json();
                console.error("Server Error:", err);
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
            
            // Handle checkboxes manually
            const selectedCheckboxes = document.querySelectorAll('input[name="selected_roles"]:checked');
            const roleIds = Array.from(selectedCheckboxes).map(cb => cb.value);
            
            // Build the data object
            const data = {
                activity: formData.get('activity'), // Ensure your form has this hidden input
                selected_roles: roleIds // This can now be an empty array []
            };

            /* --- REMOVED VALIDATION BLOCK ---
               The code that forced a user to pick a role is deleted.
               Now, if they pick nothing, it just sends an empty list [].
            */

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
                    
                    // If you have a close function
                    if (typeof closeSignupModal === 'function') closeSignupModal();
                    
                    // If you have a render function
                    if (typeof renderActivities === 'function') renderActivities(); 
                    
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

    window.openModal = async (id, name, currentRole, currentAwards = [], canManageAttendance = false) => {
        
        document.getElementById('selectedStudentId').value = id;
        document.getElementById('modalStudentName').textContent = `For: ${name}`;
        document.getElementById('roleSelect').value = currentRole || ""; 
        
        // Now this variable actually exists!
        document.getElementById('manageAttendanceCheck').checked = !!canManageAttendance;

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
            
            // NEW: Get checkbox status
            const canManage = document.getElementById('manageAttendanceCheck').checked;

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
                        can_manage_attendance: canManage, // <--- Add this line
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

    window.toggleDateInputs = function() {
        const type = document.getElementById('eventTypeSelect').value;
        const singleGroup = document.getElementById('singleDateGroup');
        const singleInput = document.getElementById('inputDateOnly');
        const multiGroup = document.getElementById('multiDateGroup');
        
        if (type === 'multi') {
            singleGroup.style.display = 'none';
            multiGroup.style.display = 'block';
            singleInput.removeAttribute('required'); // Don't block submit
        } else {
            singleGroup.style.display = 'block';
            multiGroup.style.display = 'none';
            singleInput.setAttribute('required', 'true');
        }
    };

    // 2. Logic to Automatically Calculate Duration
    window.calculateDuration = function() {
        const start = document.getElementById('inputStartTime').value;
        const end = document.getElementById('inputEndTime').value;
        const durationInput = document.getElementById('inputDuration');

        if (start && end) {
            // Convert "09:00" strings to minutes
            const startMin = parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
            const endMin = parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);
            
            let diff = endMin - startMin;
            
            // Handle negative diff (e.g. event goes past midnight)
            if (diff < 0) diff += 24 * 60; 

            // FIX: Change toFixed(2) to toFixed(1)
            const hours = (diff / 60).toFixed(1); // e.g. "5.5" instead of "5.50"
            
            durationInput.value = hours;
        } else {
            durationInput.value = '';
        }
    };



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