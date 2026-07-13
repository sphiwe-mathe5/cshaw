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

function getValidCsrfToken() {
    let token = getCookie('__Host-csrftoken');
    if (!token) token = getCookie('csrftoken');
    if (!token) {
        const input = document.querySelector('[name=csrfmiddlewaretoken]');
        if (input) token = input.value;
    }
    return token;
}

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

    const linkCalendar = document.getElementById('link-calendar');
    if (linkCalendar) {
        linkCalendar.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Handle the active class switching on the sidebar
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.getElementById('nav-item-calendar').classList.add('active');
            
            // Render the new calendar
            renderCalendar();
            
            // Close the sidebar if on mobile
            if (window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.remove('open');
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) overlay.classList.remove('active');
            }
        });
    }

    const linkCareer = document.getElementById('link-career');
    if (linkCareer) {
        linkCareer.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Handle the active class switching on the sidebar
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.getElementById('nav-item-career').classList.add('active');
            
            // Render the new Career Toolkit
            renderCareerToolkit();
            
            // Close the sidebar if on mobile
            if (window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.remove('open');
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) overlay.classList.remove('active');
            }
        });
    }

    // --- LEADERBOARD TAB CLICK HANDLER ---
    const leaderboardLink = document.getElementById('link-leaderboard');
    
    if (leaderboardLink) {
        leaderboardLink.addEventListener('click', (e) => {
            e.preventDefault();

            // 1. Remove 'active' from ALL sidebar items
            document.querySelectorAll('.nav-item').forEach(item => {
                item.classList.remove('active');
            });
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
            });

            // 2. Add 'active' to THIS item
            const parentLi = leaderboardLink.closest('.nav-item');
            if (parentLi) parentLi.classList.add('active');
            leaderboardLink.classList.add('active');

            // 3. Render the View
            renderLeaderboard();
        });
    }

    // 1. SHOW THE BUTTON (Only for Coordinators)

    const announceLink = document.getElementById('nav-announcements');

    // We just check if the link exists in the DOM 
    // (If a Student is logged in, Django removes it, so announceLink will be null)
    if (announceLink) {
        announceLink.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Update active state in sidebar
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            announceLink.querySelector('a').classList.add('active');

            // Render the page
            renderAnnouncementPage(); 
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
        const confirmBtn = document.getElementById('confirmActionBtn'); // Grab the button
        
        if (!manualTime) {
            window.showCustomAlert("Missing Info", "Please provide a valid time.", "⚠️");
            return;
        }

        // Disable button to prevent accidental double-clicks while loading
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Processing...";
        
        try {
            const csrfToken = getValidCsrfToken();
            
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
                // ✅ SUCCESS: Now it is safe to close the modal and refresh
                window.closeActionModal();
                
                // Optional: You could show a success alert here if you want!
                // window.showCustomAlert("Success", "Time recorded successfully!", "✅");
                
                renderAttendanceSheet(currentActivityId);
            } else {
                // ❌ FAILED: Show the error, but keep the actionModal open!
                window.showCustomAlert("Action Failed", data.error || "Unknown error occurred", "❌");
                
                // Reset the button so they can try again
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Confirm";
            }
        } catch (err) {
            console.error(err);
            window.showCustomAlert("Network Error", "Please check your connection.", "⚠️");
            
            // Reset the button
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Confirm";
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

    // 5. Close Alert Function
    window.closeCustomAlert = function() {
        document.getElementById('alertModal').style.display = 'none';
    }

    // 6. Custom Confirm Function
    window.showCustomConfirm = function(title, message, icon, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmIcon').textContent = icon;
        
        const modal = document.getElementById('confirmModal');
        const btnYes = document.getElementById('btnConfirmYes');
        const btnCancel = document.getElementById('btnConfirmCancel');

        // Clear out old event listeners so it doesn't fire multiple times
        btnYes.onclick = null;
        btnCancel.onclick = null;

        // If they click Cancel, just close it
        btnCancel.onclick = () => {
            modal.style.display = 'none';
        };

        // If they click Yes, close it AND run the fetch logic
        btnYes.onclick = () => {
            modal.style.display = 'none';
            if (onConfirm && typeof onConfirm === 'function') {
                onConfirm();
            }
        };

        modal.style.display = 'flex';
    }


    // Render Activities (List View)
    async function renderActivities() {



        mainContent.innerHTML = `

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
                    <div class="cards-grid">
                        
                        <div class="empty-state-container" style="grid-column: 1 / -1;">
                            <div class="study-scene">
                                <div class="study-spark spark-left">✦</div>
                                <div class="study-spark spark-right">✦</div>
                                <div class="study-spark spark-top">✦</div>
                                
                                <div class="floating-book">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                                    </svg>
                                </div>
                            </div>
                            <h3 class="empty-state-title">Zero events right now.</h3>
                            <p class="empty-state-text" style="margin-bottom: 24px;">Take this time to focus on your studies and ace your upcoming classes!</p>
                            <div class="empty-state-cta">
                                <a href="/about/" class="btn-read-cshaw">
                                    <span>Read about the C-SHAW Program</span>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                        <polyline points="12 5 19 12 12 19"></polyline>
                                    </svg>
                                </a>
                            </div>
                        </div>

                    </div>`;
                return;
            }

            // 2. GROUPING LOGIC
            const groups = {};
            
            allActivities.forEach(activity => {
                // REGEX: strictly checks if the title ends with "(Day X)"
                // This assumes your multi-day creator always appends this string.
                const isSeriesIdentifier = /\s\(Day\s\d+\)$/i.test(activity.title);
                
                let groupKey;

                if (isSeriesIdentifier) {
                    // CASE A: It is a Series
                    // Clean the name (remove "Day 1") and use that as the key
                    // This allows "Event (Day 1)" and "Event (Day 2)" to merge.
                    groupKey = activity.title.replace(/\s\(Day\s\d+\)$/i, '').trim();
                } else {
                    // CASE B: It is a Single Event
                    // Use a UNIQUE key (like the ID) so it NEVER merges with anything else.
                    // Even if two events are named "Garden Cleanup", they will stay separate.
                    groupKey = `__SINGLE__${activity.id}`; 
                }
                
                if (!groups[groupKey]) {
                    groups[groupKey] = [];
                }
                groups[groupKey].push(activity);
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
                </div>
                <div class="cards-grid">
                    ${cardsHtml}
                </div>
                
                <footer class="minimal-footer" style="margin-top: 50px; border-top: 1px solid #eee; padding-top: 25px; text-align: center;">
                    
                    <div style="margin-bottom: 15px;">
                        <a href="/about/" style="color: #666; text-decoration: none; margin: 0 10px; font-weight: 500;">About</a>
                        <span style="color: #ccc;">|</span>
                        <a href="/privacy/" style="color: #666; text-decoration: none; margin: 0 10px; font-weight: 500;">Privacy Policy</a>
                        <span style="color: #ccc;">|</span>
                        <a href="/terms/" style="color: #666; text-decoration: none; margin: 0 10px; font-weight: 500;">Terms of Use</a>
                    </div>

                    <div class="footer-copyright" style="color: #999; font-size: 0.85rem;">
                        &copy; 2026 C-SHAW Hub. All rights reserved.
                    </div>
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

        const dateStr = dateObj.toLocaleDateString('en-GB', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short',
            timeZone: 'Africa/Johannesburg' 
        });

        const startDate = new Date(activity.date_time);

        // Calculate End Date
        const durationMs = (activity.duration_hours || 0) * 60 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);

        const startTimeStr = startDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'
        });

        const endTimeStr = endDate.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'
        });

        // --- NEW LOGIC: Check if event has ended ---
        const now = new Date();
        const hasEnded = now > endDate;

        let statusText = '';
        let statusColor = '';

        if (hasEnded) {
            statusText = 'Ended';
            statusColor = '#95a5a6'; // A sleek grey color for ended events
        } else if (activity.spots_left === null) {
            statusText = 'Open (Unlimited Spots)';
            statusColor = '#27ae60'; // Green
        } else {
            statusText = activity.spots_left + ' spots left';
            statusColor = activity.spots_left > 5 ? '#27ae60' : '#e74c3c'; // Green or Red depending on spots
        }

        // Check signed up status
        const isSignedUp = activity.is_signed_up; 

        return `
            <div class="event-card" ${hasEnded ? 'style="opacity: 0.6; filter: grayscale(30%);"' : ''}>
                
                <div class="card-image-wrapper" style="${imageStyle}">
                    
                    ${isSignedUp ? `
                    <div class="signed-up-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Signed Up
                    </div>` : ''}

                    <div class="status-pill" style="color: ${statusColor};">
                        ${!hasEnded ? `<span class="pulse-dot" style="color: ${statusColor};"></span>` : ''}
                        ${statusText}
                    </div>
                </div>

                <div class="card-content">
                    <div class="card-meta-tags">
                        <span class="location-tag">${activity.campus} CAMPUS</span>
                    </div>
                    
                    <h3 class="event-title">${activity.title}</h3>
                    
                    <ul class="event-details-list">
                        <li>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                            ${dateStr}
                        </li>
                        <li>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            ${startTimeStr} - ${endTimeStr} (${activity.duration_hours}h)
                        </li>
                    </ul>
                    
                    <p class="event-description">${activity.description.substring(0, 80)}...</p>
                    
                    <button id="view-btn-${activity.id}" class="btn-card-action">
                        View Details
                    </button>
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
            
            // 👇 NEW: Check if spots are unlimited 👇
            const spotsDisplay = ev.total_spots === null 
                ? '<span style="color:#27ae60; font-weight:600;">Unlimited</span>' 
                : `${ev.spots_left} spots`;

            return `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                    <div style="font-size: 0.85rem; color: #333;">
                        <strong>${dayDate}</strong> <span style="color:#7f8c8d; font-size:0.8rem;">(${spotsDisplay})</span>
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
                        This event runs over multiple days. Open the folder to see all available days.
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
        const now = new Date();
        const eventDate = new Date(activity.date_time);
        const isToday = today.toDateString() === eventDate.toDateString();
        const isPast = today > eventDate;
        const hasEventEnded = now > endDate;


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

        else if (hasEventEnded) {
                actionButtonHtml = `
                    <button disabled style="background:#bdc3c7; color:white; padding: 15px 40px; font-size:1.1rem; border:none; border-radius:4px; cursor:not-allowed;">
                        Event Ended
                    </button>
                    <p style="text-align:center; color:#999; margin-top:10px; font-size:0.9rem;">
                        This event has already taken place.
                    </p>
                `;
            }

            else if (activity.spots_left !== null && activity.spots_left <= 0) {
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
            <button id="backToActivities" class="btn-back">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Activities
            </button>

            <div class="event-detail-container">
                <div class="event-detail-hero" style="${imageStyle}"></div>
                
                <div class="event-detail-body">
                    
                    <div class="event-detail-header">
                        <div class="event-detail-main-info">
                            <span class="location-tag">${activity.campus} CAMPUS</span>
                            <h1 class="event-detail-title">${activity.title}</h1>
                            
                            <div class="event-detail-meta">
                                <span class="meta-item">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    ${fullDate}
                                </span>
                                <span class="meta-item">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                    ${startTimeStr} - ${endTimeStr}
                                </span>
                                <span class="meta-item">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"></path><path d="M5 2h14"></path><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"></path><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"></path></svg>
                                    ${activity.duration_hours} Hours
                                </span>
                            </div>
                        </div>
                        
                        <div class="event-detail-spots">
                            <div class="spots-number" style="color: ${activity.spots_left === null ? '#10B981' : 'var(--primary-orange)'};">
                                ${activity.spots_left === null ? 'Open' : activity.spots_left}
                            </div>
                            <div class="spots-label">
                                ${activity.spots_left === null ? 'Unlimited Spots' : 'Spots Remaining'}
                            </div>
                        </div>
                    </div>

                    <hr class="detail-divider">

                    <div class="event-detail-section">
                        <h3>About this Event</h3>
                        <div class="event-description-full">
                            ${activity.details || activity.description}
                        </div>
                    </div>

                    ${isUserLoggedIn ? `
                        
                        ${activity.additional_details ? `
                            <div class="important-info-box">
                                <h4>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                    Important Information
                                </h4>
                                <p>${activity.additional_details}</p>
                            </div>
                        ` : ''}

                        <div class="event-action-area">
                            ${actionButtonHtml}
                        </div>

                    ` : `
                        <div class="login-prompt-box">
                            <p>Ready to volunteer? <a href="/login/">Log in to sign up</a> for this event.</p>
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
                    'X-CSRFToken': getValidCsrfToken() 
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
        
        // 1. Check who is logged in
        const userRole = localStorage.getItem('user_role'); 
        
        // 2. Set the default page based on their role
        const defaultBackPage = (userRole === 'COORDINATOR') 
            ? renderCreateEventForm 
            : renderExecutiveAttendancePage;
            
        // 3. Apply the handler
        const goBack = backHandler || defaultBackPage;
        
        // --- 1. SETUP HEADER, TABLE, AND ***MODAL*** ---
        document.getElementById('mainContent').innerHTML = `
            <style>
                /* Scoped CSS for the Attendance View */
                .attendance-container { padding: 20px; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
                .table-scroll-wrapper { overflow-x: auto; }
                .attendance-table { width: 100%; border-collapse: collapse; min-width: 700px; }
                .attendance-table th { text-align: left; padding: 12px 15px; color: #7f8c8d; font-weight: 600; border-bottom: 2px solid #eee; background: #f9f9f9; }
                .attendance-table td { padding: 12px 15px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }

                /* Filter controls CSS */
                .filters-wrapper { display: flex; gap: 15px; margin-bottom: 20px; align-items: center; flex-wrap: wrap; }
                .search-input { flex: 1; min-width: 250px; padding: 10px 15px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; outline: none; transition: border-color 0.2s;}
                .search-input:focus { border-color: #E35205; }
                .status-select { padding: 10px 15px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.95rem; background: #fff; cursor: pointer; outline: none; }
                
                /* MODAL CSS */
                .modal-overlay {
                    display: none; 
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.5); z-index: 9999;
                    justify-content: center; align-items: center;
                }
                .modal-box {
                    background: white; padding: 25px; border-radius: 8px;
                    width: 90%; max-width: 400px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                }
            </style>

            <div class="header-section">

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button id="backToManage" style="background:none; border:none; color:#666; cursor:pointer; font-weight: 500;">
                        &larr; Back to Events
                    </button>
                    
                    
                    <button id="bulkSignOutBtn" 
                        style="display:none; background:#2c3e50; color:white; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-size:0.9rem;">
                        ⚡ Sign Out Remaining
                    </button>
                    
                </div>
                
                <h1>Attendance Sheet</h1>
                <div id="activityHeader" style="margin-top: 5px;">
                    <span style="color:#ccc;">Loading event details...</span>
                </div>
            </div>
            
            <div class="attendance-container">
                <div class="filters-wrapper">
                    <input type="text" id="attendanceSearch" class="search-input" placeholder="🔍 Search by student name or surname...">
                </div>
                <div class="table-scroll-wrapper">
                    <table class="attendance-table">
                        <thead>
                            <tr>
                                <th>Student</th>
                                
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

            <div id="actionModal" class="custom-modal-overlay">
                <div class="modal-box">
                    <h3 id="modalTitle" style="margin-top:0;">Action</h3>
                    <p>Student: <strong id="modalStudentName"></strong></p>
                    
                    <div style="margin: 15px 0;">
                        <label style="display:block; margin-bottom:5px; font-size:0.9rem;">Time Recorded:</label>
                        <input type="time" id="manualTimeInput" style="padding:8px; border:1px solid #ddd; border-radius:4px; width:100%;">
                    </div>

                    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
                        <button onclick="document.getElementById('actionModal').style.display='none'" 
                                style="padding:8px 16px; border:1px solid #ddd; background:white; border-radius:4px; cursor:pointer;">
                            Cancel
                        </button>
                        <button id="confirmActionBtn" 
                                style="padding:8px 16px; background:#E35205; color:white; border:none; border-radius:4px; cursor:pointer;">
                            Confirm
                        </button>
                    </div>
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

            const now = new Date();
            const hasEventEnded = now > endDate;
            
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
                <span style="color: #ccc; margin: 0 8px;">|</span>
                <span style="background: #e2e8f0; color: #334155; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: 700;">
                    👤 ${rsvps.length} RSVP${rsvps.length === 1 ? '' : 's'}
                </span>
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
            
            // 👇 ADD "&& bulkBtn" RIGHT HERE 👇
            if (hasPendingStudents && bulkBtn) { 
                bulkBtn.style.display = 'block';
                bulkBtn.onclick = () => {
                    const confirmMsg = `Are you sure you want to sign out all remaining students?\n\nThey will be signed out at the official end time (${endTimeStr}).`;
                    
                    // 👇 Trigger the Custom Confirm Modal 👇
                    window.showCustomConfirm("Bulk Sign Out", confirmMsg, "⚡", async () => {
                        // This block only runs if they click "Yes, proceed"
                        
                        // Optional: Show a loading state on the button
                        bulkBtn.textContent = "Processing...";
                        bulkBtn.disabled = true;

                        try {
                            const csrfToken = getValidCsrfToken();
                            const res = await fetch(`/api/activities/${activityId}/bulk_signout/`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken }
                            });
                            
                            const data = await res.json();
                            
                            if (res.ok) {
                                // Re-use your custom alert for success!
                                window.showCustomAlert("Success", data.message, "✅");
                                renderAttendanceSheet(activityId, backHandler); // Refresh table
                            } else {
                                window.showCustomAlert("Action Failed", data.error || "Failed to bulk sign out.", "❌");
                                bulkBtn.textContent = "⚡ Sign Out Remaining";
                                bulkBtn.disabled = false;
                            }
                        } catch (e) { 
                            console.error(e); 
                            window.showCustomAlert("Network Error", "Please check your connection.", "⚠️");
                            bulkBtn.textContent = "⚡ Sign Out Remaining";
                            bulkBtn.disabled = false;
                        }
                    });
                };
            }

            tbody.innerHTML = '';

            const timeFmt = { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false, 
                timeZone: 'Africa/Johannesburg' 
            };

            const metaTag = document.querySelector('meta[name="current-user-email"]');
            const currentUserEmail = metaTag ? metaTag.getAttribute('content') : "";
            
            // --- ROW GENERATION ---
            rsvps.forEach(rsvp => {
                let statusBadge = '<span style="background:#f1f1f1; padding:4px 10px; border-radius:12px; color:#666; font-size:0.85rem;">Pending</span>';
                let timeLog = '<span style="color:#ccc;">--:--</span>';
                let actionBtn = '';

                const isSelf = rsvp.student_email === currentUserEmail;
                const minTimeAttr = `data-min="${rawStartTime}"`;

                if (rsvp.sign_in_time && !rsvp.sign_out_time) {
                    // --- CASE A: IN PROGRESS ---
                    const signInDate = new Date(rsvp.sign_in_time);
                    const signInTimeStr = signInDate.toLocaleTimeString('en-GB', timeFmt);
                    
                    statusBadge = '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:500;">● In Progress</span>';
                    
                    let historyHtml = '';
                    if (rsvp.session_history && rsvp.session_history.length > 0) {
                        rsvp.session_history.forEach((sess, idx) => {
                            const sin = new Date(sess.in).toLocaleTimeString('en-GB', timeFmt);
                            const sout = new Date(sess.out).toLocaleTimeString('en-GB', timeFmt);
                            historyHtml += `<div style="font-size:0.75rem; color:#666; margin-bottom:4px;">
                                ${idx === 0 ? 'Initial:' : 'Re-Sign In:'} ${sin} - ${sout} (${sess.hours} Hrs)
                            </div>`;
                        });
                    }
                    
                    timeLog = `
                        ${historyHtml}
                        <span style="color:#2e7d32; font-weight:600;">Current: In at ${signInTimeStr}</span>
                    `;
                    
                    // Allow sign out (Min time = Sign In time)
                    const signOutMin = signInDate.toLocaleTimeString('en-GB', timeFmt);
                    
                    actionBtn = `<button class="btn-signout" data-id="${rsvp.id}" data-name="${rsvp.student_name}" data-min="${signOutMin}"
                        style="padding:6px 16px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(231,76,60,0.2);">Sign Out</button>`;
                } 
                else if (rsvp.sign_out_time) {
                    // --- CASE B: COMPLETED ---
                    
                    const inTime = new Date(rsvp.sign_in_time).toLocaleTimeString('en-GB', timeFmt);
                    const outTime = new Date(rsvp.sign_out_time).toLocaleTimeString('en-GB', timeFmt);

                    statusBadge = '<span style="background:#e3f2fd; color:#1565c0; padding:4px 10px; border-radius:12px; font-size:0.85rem; font-weight:500;">✓ Completed</span>';
                    
                    let historyHtml = '';
                    if (rsvp.session_history && rsvp.session_history.length > 0) {
                        historyHtml += `<div style="margin-top: 6px; border-top: 1px dashed #ddd; padding-top: 4px;">`;
                        rsvp.session_history.forEach((sess, idx) => {
                            const sin = new Date(sess.in).toLocaleTimeString('en-GB', timeFmt);
                            const sout = new Date(sess.out).toLocaleTimeString('en-GB', timeFmt);
                            historyHtml += `<div style="font-size:0.75rem; color:#666; margin-bottom:2px;">
                                ${idx === 0 ? 'Initial:' : 'Re-Sign In:'} ${sin} - ${sout} <strong style="color:#444;">(+${sess.hours}h)</strong>
                            </div>`;
                        });
                        historyHtml += `</div>`;
                    }

                    timeLog = `
                        <div style="line-height:1.2;">
                            <strong style="color:#333; font-size:1rem; display:block;">Total: ${rsvp.hours_earned} Hrs</strong>
                            ${historyHtml}
                        </div>
                    `;
                    
                    // 👇 NEW: If event is still going, show the Re-Sign In button 👇
                    if (!hasEventEnded) {
                        actionBtn = `
                            <div style="display:flex; gap:10px; align-items:center; justify-content:flex-end;">
                                <span style="color:#27ae60; font-weight:bold; font-size:1.2rem;">✓</span>
                                <button class="btn-resignin" data-id="${rsvp.id}" data-name="${rsvp.student_name}" data-min="${outTime}"
                                    style="padding:4px 10px; background:#f39c12; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:600;">
                                    Re-Sign In
                                </button>
                            </div>
                        `;
                    } else {
                        actionBtn = `<span style="color:#27ae60; font-weight:bold; font-size:1.2rem;">✓</span>`;
                    }
                }

                else {
                    // --- CASE C: NOT STARTED ---
                    if (hasEventEnded) {
                        // If the event is over, show a disabled grey button
                        actionBtn = `<button disabled 
                            style="padding:6px 16px; background:#bdc3c7; color:white; border:none; border-radius:4px; cursor:not-allowed; font-weight:600;">
                            Event Ended
                        </button>`;
                    } else {
                        // If the event is still active, show the normal green Sign In button
                        actionBtn = `<button class="btn-signin" data-id="${rsvp.id}" data-name="${rsvp.student_name}" ${minTimeAttr}
                            style="padding:6px 16px; background:#27ae60; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(39,174,96,0.2);">
                            Sign In
                        </button>`;
                    }
                }

                if (isSelf) {
                    // 👇 2. If it's them, OVERRIDE the buttons with a strict warning popup
                    actionBtn = `<button onclick="alert('Accountability Lock 🔒\\n\\nYou cannot sign yourself in or out. Please find another Executive to log your attendance to ensure fair tracking.')"
                        style="padding:6px 16px; background:#95a5a6; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                        Locked (Self)
                    </button>`;
                }

                const fullNameLower = `${rsvp.student_name} ${rsvp.student_surname}`.toLowerCase();

                const tr = document.createElement('tr');
                tr.className = 'rsvp-row'; 
                tr.dataset.searchName = fullNameLower; 

                tr.innerHTML = `
                    <td class="col-student">
                        <div class="student-name">${rsvp.student_name} ${rsvp.student_surname}</div>
                    </td>
                    <td class="col-status">
                        ${statusBadge}
                    </td>
                    <td class="col-time">
                        ${timeLog}
                    </td>
                    <td class="col-actions">
                        ${actionBtn}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // --- FILTER LOGIC ---
            const searchInput = document.getElementById('attendanceSearch');
            const allRows = document.querySelectorAll('.rsvp-row');

            function applyFilters() {
                const searchTerm = searchInput.value.toLowerCase();

                allRows.forEach(row => {
                    const matchesSearch = row.dataset.searchName.includes(searchTerm);


                    if (matchesSearch) {
                        row.style.display = ''; // Show row
                    } else {
                        row.style.display = 'none'; // Hide row instantly
                    }
                });
            }

            // Trigger filters instantly when typing or selecting
            searchInput.addEventListener('input', applyFilters);

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

            document.querySelectorAll('.btn-resignin').forEach(btn => {
                btn.addEventListener('click', () => {
                     openActionModal(btn.dataset.id, btn.dataset.name, 'resignin', activityId, btn.dataset.min);
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
                 ${data.executive_position || 'Executive Member'}
                </div>
            ` : '';

            const recruitsRow = data.recruits_count > 0 ? `
                <div class="stat-list-item">
                    <span class="stat-label">Students Recruited</span>
                    <span class="stat-val" style="color:#27ae60; font-weight:bold;">${data.recruits_count}</span>
                </div>
            ` : '';

            const totalDecimal = parseFloat(data.total_hours) || 0;
            const exactHours = Math.floor(totalDecimal);
            const exactMinutes = Math.floor((totalDecimal - exactHours) * 60);
            const exactSeconds = Math.round((((totalDecimal - exactHours) * 60) - exactMinutes) * 60);

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
                                <span>${data.campus || 'C-SHAW'}</span>
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
                                ${exactHours}
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

                    <div class="mobile-only-leaderboard">
                        <div style="background: rgba(46, 204, 113, 0.1); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.3); font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: 600;">
                            🏫 ${data.campus}: #${data.rank_campus}
                        </div>
                        <div style="background: rgba(255, 140, 66, 0.1); color: #FF8C42; border: 1px solid rgba(255, 140, 66, 0.3); font-size: 0.7rem; padding: 2px 8px; border-radius: 12px; font-weight: 600;">
                            🌍 Global: #${data.rank_global}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px;">

                    <div style="background: #19192f; padding: 25px; border-radius: 16px; text-align: center; border: 1px solid #252545;">
                        <div style="color: #FF6B35; margin-bottom: 10px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            </div>
                            <div style="font-size: 1.5rem; font-weight: 700; color: white; display: flex; justify-content: center; align-items: baseline; gap: 4px;">
                                <span>${exactHours}<span style="font-size:1rem; color:#FF6B35;">h</span></span>
                                <span>${exactMinutes}<span style="font-size:1rem; color:#FF6B35;">m</span></span>
                                <span>${exactSeconds}<span style="font-size:1rem; color:#FF6B35;">s</span></span>
                            </div>
                            <div style="color: #6b6b90; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px;">Detailed Hours</div>
                        </div>
                        
                        <div style="background: #19192f; padding: 25px; border-radius: 16px; text-align: center; border: 1px solid #252545;">
                            <div style="color: #FF6B35; margin-bottom: 10px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                            </div>
                            <div style="font-size: 2rem; font-weight: 700; color: white;">${data.remaining}</div>
                            <div style="color: #6b6b90; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px;">Remaining</div>
                        </div>

                        <div style="background: #19192f; padding: 25px; border-radius: 16px; text-align: center; border: 1px solid #252545;">
                            <div style="color: #FF6B35; margin-bottom: 10px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
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
                        <div class="stat-card-header">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                            <h3>Monthly Hours</h3>
                        </div>
                        <div class="stat-card-content">
                            ${monthlyHtml}
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-card-header">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <h3>Punctuality Track</h3>
                        </div>
                        
                        <div class="stat-card-content punctuality-content">
                            
                            <div class="punctuality-status">
                                <span class="status-badge" style="color: ${data.punctuality_color}; background-color: ${data.punctuality_bg};">
                                    ${data.punctuality_status}
                                </span>
                            </div>
                            
                            <div class="punctuality-stats">
                                <div class="punc-stat-item early">
                                    <div class="punc-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <div class="punc-details">
                                        <span class="punc-count">${data.early_count}</span>
                                        <span class="punc-label">events early</span>
                                    </div>
                                </div>

                                <div class="punc-stat-item late">
                                    <div class="punc-icon">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    </div>
                                    <div class="punc-details">
                                        <span class="punc-count">${data.late_count}</span>
                                        <span class="punc-label">events late</span>
                                    </div>
                                </div>
                            </div>
                            
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-card-header">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <h3>Events You Attended</h3>
                        </div>
                        <div class="stat-card-content">
                            ${eventsHtml}
                        </div>
                    </div>

                    <div class="stat-card achievements-card">
                        <div class="stat-card-header">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            <h3>Achievements</h3>
                        </div>
                        
                        <div class="stat-list">
                            <div class="stat-row">
                                <span class="stat-label">Most Hours</span>
                                <span class="stat-value highlight">${exactHours}</span>
                            </div>
                            
                            <div class="stat-row">
                                <span class="stat-label">Total Events</span>
                                <span class="stat-value">${data.events_count}</span>
                            </div>

                            ${recruitsRow}
                        </div>

                        <div class="leaderboard-section">
                            <div class="section-micro-header">Leaderboard Position</div>
                            <div class="rank-badges-container">
                                <div class="rank-badge badge-global">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                    Global: #${data.rank_global}
                                </div>
                                <div class="rank-badge badge-campus">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                                    ${data.campus}: #${data.rank_campus}
                                </div>
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

                <div class="settings-container">
                    
                    <div class="settings-card">
                        <div class="settings-card-header">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <h3>Personal Information</h3>
                        </div>
                        
                        <form id="profileForm" class="settings-form">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Role</label>
                                    <input type="text" class="form-input input-disabled" value="${user.role_label}" disabled>
                                </div>
                                <div class="form-group">
                                    <label>Student / Staff Number</label>
                                    <input type="text" class="form-input input-disabled" value="${user.student_number || 'N/A'}" disabled>
                                </div>
                            </div>

                            <div class="form-grid">
                                <div class="form-group">
                                    <label>First Name</label>
                                    <input type="text" class="form-input" name="first_name" value="${user.first_name}" required>
                                </div>
                                <div class="form-group">
                                    <label>Last Name</label>
                                    <input type="text" class="form-input" name="last_name" value="${user.last_name}" required>
                                </div>
                            </div>

                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Campus</label>
                                    <select class="form-input input-disabled" name="campus" disabled>
                                        <option value="APB" ${isSelected('APB')}>APB Campus</option>
                                        <option value="DFC" ${isSelected('DFC')}>DFC Campus</option>
                                        <option value="APK" ${isSelected('APK')}>APK Campus</option>
                                        <option value="SWC" ${isSelected('SWC')}>SWC Campus</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Email Address</label>
                                    <input type="email" class="form-input input-disabled" value="${user.email}" disabled>
                                    <small class="form-help-text">Contact support to change email.</small>
                                </div>
                            </div>

                            <div class="form-actions">
                                <button type="submit" class="btn-settings-primary" id="saveProfileBtn">Save Changes</button>
                            </div>
                        </form>
                    </div>

                    <div class="settings-card">
                        <div class="settings-card-header">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                            <h3>Security</h3>
                        </div>
                        
                        <form id="changePasswordForm" class="settings-form">
                            <div class="form-group" style="max-width: 50%;">
                                <label>Current Password</label>
                                <div class="password-input-wrapper">
                                    <input type="password" class="form-input" name="old_password" required placeholder="Enter current password">
                                    <span class="password-toggle-icon toggle-icon">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    </span>
                                </div>
                            </div>
                            
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>New Password</label>
                                    <div class="password-input-wrapper">
                                        <input type="password" class="form-input" name="new_password" id="newPass" required placeholder="New password">
                                        <span class="password-toggle-icon toggle-icon">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        </span>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Confirm New Password</label>
                                    <div class="password-input-wrapper">
                                        <input type="password" class="form-input" id="confirmPass" required placeholder="Repeat new password">
                                        <span class="password-toggle-icon toggle-icon">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-actions">
                                <button type="submit" class="btn-settings-secondary" id="savePasswordBtn">Update Password</button>
                            </div>
                        </form>
                    </div>

                    <div class="settings-card">
                        <div class="settings-card-header">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                            <h3>Preferences & Security</h3>
                        </div>
                        
                        <div class="preference-toggle-row">
                            <div class="preference-info">
                                <h4>Email Notifications</h4>
                                <p>Receive updates about upcoming events and reminders.</p>
                            </div>
                            <label class="custom-toggle">
                                <input type="checkbox" id="notifToggle" ${user.receive_notifications ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>

                        <div class="preference-toggle-row" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
                            <div class="preference-info">
                                <h4>Two-Factor Authentication (2FA)</h4>
                                <p>Require an email verification code when logging in for extra security.</p>
                            </div>
                            <label class="custom-toggle">
                                <input type="checkbox" id="twoFactorToggle" ${user.is_2fa_enabled ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    </div>

                    <div class="settings-card card-danger">
                        <div class="settings-card-header text-danger">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                            <h3>Danger Zone</h3>
                        </div>
                        
                        <div class="danger-content">
                            <p>To protect your account from unauthorized changes, direct deletion is disabled. Deleting your account is permanent and will erase all your volunteer hours and history.</p>
                            <p>If you wish to proceed, please contact support to verify your identity.</p>
                            <a href="mailto:support@cshaw.co.za?subject=Account Deletion Request" class="btn-settings-danger">
                                Request Account Deletion
                            </a>
                        </div>
                    </div>

                </div>
            `;

            // --- 1. Password Eye Toggle ---
            document.querySelectorAll('.toggle-icon').forEach(icon => {
                icon.addEventListener('click', () => {
                    const input = icon.parentElement.querySelector('input');
                    if (input.type === 'password') {
                        input.type = 'text'; 
                        icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M1 1l22 22"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path></svg>`;
                    } else {
                        input.type = 'password'; 
                        icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
                    }
                });
            });

            // --- 2. Notification Toggle Listener ---
            document.getElementById('notifToggle').addEventListener('change', async (e) => {
                 const isChecked = e.target.checked;
                 try {
                     const res = await fetch('/api/users/profile/', {
                         method: 'PATCH',
                         headers: {'Content-Type': 'application/json', 'X-CSRFToken': getValidCsrfToken()},
                         body: JSON.stringify({ receive_notifications: isChecked })
                     });
                     if(!res.ok) {
                        e.target.checked = !isChecked; // Revert if failed
                        alert("Failed to update notifications.");
                     }
                 } catch(err) {
                     e.target.checked = !isChecked;
                 }
            });

            // --- 3. 2FA Toggle Listener ---
            document.getElementById('twoFactorToggle').addEventListener('change', async (e) => {
                const toggleInput = e.target;
                const isChecked = toggleInput.checked;

                try {
                    const response = await fetch('/api/users/toggle-2fa/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getValidCsrfToken() // Use your existing helper!
                        }
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Failed to update 2FA setting.');
                    }
                    console.log("2FA Updated:", data.message);

                } catch (error) {
                    console.error("2FA Toggle Error:", error);
                    alert("Could not update security settings. Please check your connection.");
                    toggleInput.checked = !isChecked; // Revert visually if network fails
                }
            });

            // --- 4. Profile Save Form ---
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
                            'X-CSRFToken': getValidCsrfToken()
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

            // --- 5. Change Password Form ---
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
                            'X-CSRFToken': getValidCsrfToken()
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
                    'X-CSRFToken': getValidCsrfToken()
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
        `;

        let allStudents = [];
        try {
            const response = await fetch('/api/users/students/');
            if (!response.ok) throw new Error('Failed to load');
            allStudents = await response.json();
            
            renderRows(allStudents);

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
                
                // 👇 --- PRIVACY MASK LOGIC ADDED HERE --- 👇
                const rawNo = student.student_number || '';
                // Shows first 2 digits, ****, then last 2 digits
                const maskedStudentNo = rawNo.length > 4 
                    ? rawNo.substring(0, 2) + '****' + rawNo.slice(-2) 
                    : rawNo; 
                // 👆 --------------------------------------- 👆

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
                    <td style="padding:15px; border-bottom:1px solid #eee;">${maskedStudentNo || '-'}</td>
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
                            
                            <div class="form-group" style="background: #f0f4f8; padding: 20px; border-radius: 12px; border-left: 4px solid var(--primary-orange); margin-bottom: 20px;">
                                <label style="color:#2c3e50; font-weight:bold;">Event Type</label>
                                <select id="eventTypeSelect" class="form-input" onchange="toggleDateInputs()" style="width:100%;">
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
                                <input type="text" class="form-input" name="title" id="inputTitle" required placeholder="e.g. Mass Testing">
                            </div>

                            <div class="form-group form-row">
                                <div>
                                    <label>Campus</label>
                                    <select name="campus" id="inputCampus" class="form-input" required>
                                        <option value="ALL">All</option>
                                        <option value="APB">APB</option>
                                        <option value="DFC">DFC</option>
                                        <option value="APK">APK</option>
                                        <option value="SWC">SWC</option>
                                    </select>
                                </div>
                                
                                <div id="singleDateGroup" style="flex-grow:1;">
                                    <label>Event Date</label>
                                    <input type="date" name="date_only" id="inputDateOnly" class="form-input" required>
                                </div>
                            </div>

                            <div id="multiDateGroup" style="display:none; background: #fff5e6; padding: 15px; border-radius: 8px; border: 1px solid #ffeebb; margin-bottom: 20px;">
                                <h4 style="margin-top:0; color:#E35205;">Series Date Range</h4>
                                <div class="form-row">
                                    <div><label>Start Date</label><input type="date" id="multiStartDate"></div>
                                    <div><label>End Date</label><input type="date" id="multiEndDate"></div>
                                </div>
                            </div>

                            <div class="form-group" style="background: #f8f9fa; padding: 20px; border-radius: 12px; border: 1px solid #eee; margin-top: 20px; margin-bottom: 20px;">
                                <label style="color:#2c3e50; font-weight:bold;">Time Schedule</label>
                                
                                <div class="form-row">
                                    <div>
                                        <label>Start Time</label>
                                        <input type="time" name="start_time" id="inputStartTime" class="form-input" required onchange="calculateDuration()">
                                    </div>
                                    <div>
                                        <label>End Time</label>
                                        <input type="time" name="end_time" id="inputEndTime" class="form-input" required onchange="calculateDuration()">
                                    </div>
                                </div>

                                <div class="form-row" style="margin-top: 15px;">
                                    <div style="flex-grow: 1;">
                                        <label>Calculated Duration (Hours)</label>
                                        <input type="number" name="duration_hours" id="inputDuration" class="form-input" step="0.1" readonly style="background-color: #e9ecef; cursor: not-allowed; color: #E35205; font-weight: bold;">
                                    </div>
                                    <div class="form-group">
                                        <label for="total_spots">Total Spots (Optional)</label>
                                        <input type="number" id="total_spots" class="form-input" name="total_spots" placeholder="Leave empty for unlimited">
                                    </div>
                                </div>
                            </div>
                            
                            <div class="form-group"><label>Short Description</label><input type="text" name="description" id="inputDesc" class="form-input" required></div>
                            <div class="form-group"><label>Full Details</label><textarea name="details" id="inputDetails" class="form-input" rows="4" required></textarea></div>
                            <div class="form-group"><label>Additional Info</label><textarea name="additional_details" id="inputAdditional" class="form-input" rows="2"></textarea></div>

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

                            <button type="submit" class="btn-settings-primary" id="submitEventBtn" style="width:100%; margin-top:20px; font-size: 1.1rem; padding: 14px;">Publish Event</button>
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
                ${event.total_spots === null 
                    ? `<span style="color: #27ae60; font-weight: bold;">Unlimited</span>` 
                    : `
                        <span style="color: ${event.spots_left > 0 ? '#27ae60' : '#e74c3c'}">${event.spots_left}</span> 
                        <span style="color: #ccc;">/</span> 
                        ${event.total_spots}
                    `
                }
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
            <div class="exec-attendance-container">
                <div class="exec-page-header">
                    <h3>Manage Campus Attendance</h3>
                    <p>Select an upcoming or past event to manage its register.</p>
                </div>
                
                <div class="exec-list-wrapper">
                    <div class="exec-list-header desktop-only">
                        <span>Event Details</span>
                        <span style="text-align: right;">Date & Time</span>
                    </div>
                    <div id="execEventsList" class="exec-event-list">
                        <div class="loading-state">Loading events...</div>
                    </div>
                </div>

                <div id="historySectionContainer"></div>
            </div>

            <div id="actionModal" class="modal-overlay">
                <div class="modal-content">
                    <span class="close-modal" onclick="document.getElementById('actionModal').style.display='none'">&times;</span>
                    <div id="modalBody"></div>
                </div>
            </div>
        `;
        
        fetchExecutiveEvents();
    }

    async function fetchExecutiveEvents() {
        const eventsList = document.getElementById('execEventsList'); 
        
        try {
            const response = await fetch('/api/activities/executive-list/'); 
            
            if (!response.ok) {
                if(response.status === 403) throw new Error("Permission Denied: Executives Only.");
                throw new Error(`Error ${response.status}`);
            }
            
            const allEvents = await response.json();
            
            if (!Array.isArray(allEvents) || allEvents.length === 0) {
                eventsList.innerHTML = '<div class="empty-state-list">No events found for your campus.</div>';
                return;
            }

            // Split Events (Midnight cutoff)
            const cutoff = new Date();
            cutoff.setHours(0, 0, 0, 0); 
            const upcomingEvents = allEvents.filter(e => new Date(e.date_time) >= cutoff);
            const pastEvents = allEvents.filter(e => new Date(e.date_time) < cutoff);
            
            // Sorting: Upcoming (Soonest first), Past (Most recent first)
            upcomingEvents.sort((a, b) => new Date(a.date_time) - new Date(b.date_time));
            pastEvents.sort((a, b) => new Date(b.date_time) - new Date(a.date_time));

            // Render Upcoming
            eventsList.innerHTML = '';
            if (upcomingEvents.length === 0) {
                 eventsList.innerHTML = '<div class="empty-state-list">No upcoming events. Check history.</div>';
            } else {
                upcomingEvents.forEach(event => {
                    eventsList.appendChild(createExecutiveCard(event, false));
                });
            }

            // Render History
            const historyContainer = document.getElementById('historySectionContainer');
            historyContainer.innerHTML = ''; 

            if (pastEvents.length > 0) {
                historyContainer.innerHTML = `
                    <div class="history-toggle-wrapper">
                        <button onclick="toggleHistory()" class="btn-history-toggle">
                            <span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                Past Events History 
                                <span class="history-badge">${pastEvents.length}</span>
                            </span>
                            <span id="historyArrow">▼</span>
                        </button>
                    </div>
                    
                    <div id="historyListContainer" style="display:none;" class="exec-list-wrapper is-history">
                        <div id="historyEventsList" class="exec-event-list"></div>
                    </div>
                `;

                const historyList = document.getElementById('historyEventsList');
                pastEvents.forEach(event => {
                    historyList.appendChild(createExecutiveCard(event, true)); 
                });
            }

            // Attach Click Listeners
            document.querySelectorAll('.exec-event-card').forEach(card => {
                card.addEventListener('click', () => {
                     renderAttendanceSheet(card.dataset.id); 
                });
            });

        } catch (err) {
            console.error(err);
            eventsList.innerHTML = `<div class="empty-state-list" style="color:#ef4444;">${err.message}</div>`;
        }
    }

    // --- HELPER 1: Create Card HTML ---
    function createExecutiveCard(event, isHistory) {
        const card = document.createElement('div');
        card.className = `exec-event-card ${isHistory ? 'is-history' : 'is-upcoming'}`; 
        card.dataset.id = event.id;

        const startDate = new Date(event.date_time);
        const dateStr = startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg'});
        const durationMs = (parseFloat(event.duration_hours) || 0) * 60 * 60 * 1000;
        const endDate = new Date(startDate.getTime() + durationMs);
        const startTimeStr = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'});
        const endTimeStr = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg'});

        // Compact Two-Line Layout
        card.innerHTML = `
            <div class="exec-card-top">
                <span class="exec-card-title">${event.title}</span>
                <span class="exec-card-date">${dateStr}</span>
            </div>
            <div class="exec-card-bottom">
                <span class="exec-card-meta">
                    <span class="meta-tag campus">${event.campus}</span>
                    <span class="meta-tag time">${startTimeStr} - ${endTimeStr} (${event.duration_hours}h)</span>
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="action-chevron">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;
        return card;
    }

    // --- HELPER 2: Toggle History ---
    window.toggleHistory = function() {
        const div = document.getElementById('historyListContainer');
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
            const csrfToken = getValidCsrfToken();
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
        
        const spotsField = document.getElementById('total_spots');
        if (spotsField) spotsField.value = event.total_spots !== null ? event.total_spots : '';
        
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';
        
        const dateOnlyField = document.getElementById('inputDateOnly');
        if (dateOnlyField) dateOnlyField.value = '';
        
        const startTimeField = document.getElementById('inputStartTime');
        if (startTimeField) startTimeField.value = '';
        
        const endTimeField = document.getElementById('inputEndTime');
        if (endTimeField) endTimeField.value = '';

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
        
        const spotsField = document.getElementById('total_spots');
        if (spotsField) spotsField.value = event.total_spots !== null ? event.total_spots : '';
        
        document.getElementById('inputDesc').value = event.description;
        document.getElementById('inputDetails').value = event.details;
        document.getElementById('inputAdditional').value = event.additional_details || '';


        if (event.date_time) {
            const d = new Date(event.date_time);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            
            const dateOnlyField = document.getElementById('inputDateOnly');
            if (dateOnlyField) dateOnlyField.value = `${year}-${month}-${day}`;
            
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            const startTimeField = document.getElementById('inputStartTime');
            if (startTimeField) startTimeField.value = `${hours}:${mins}`;
            
            if (event.duration_hours) {
                const end = new Date(d.getTime() + event.duration_hours * 60 * 60 * 1000);
                const endHours = String(end.getHours()).padStart(2, '0');
                const endMins = String(end.getMinutes()).padStart(2, '0');
                const endTimeField = document.getElementById('inputEndTime');
                if (endTimeField) endTimeField.value = `${endHours}:${endMins}`;
            }
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
                headers: { 'X-CSRFToken': getValidCsrfToken() }
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
                headers: { 'X-CSRFToken': getValidCsrfToken() },
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
                        'X-CSRFToken': getValidCsrfToken()
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
            
            const csrfToken = getValidCsrfToken();

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

    function renderAnnouncementPage() {
        mainContent.innerHTML = `
            <div class="header-section">
                <h1>📢 Make an Announcement</h1>
                <p>Send a bulk email to all registered volunteers, a specific campus, or custom email addresses.</p>
            </div>

            <div class="cards-grid" style="display: block; max-width: 700px; margin: 0 auto;">
                <div class="card" style="padding: 30px; border-top: 4px solid #E35205;">
                    
                    <form id="announcementForm">
                        <div class="form-group">
                            <label for="announceTarget">Recipients</label>
                            <select id="announceTarget" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="ALL">All Volunteers (Entire Database)</option>
                                <option value="APB">APB Campus Only</option>
                                <option value="DFC">DFC Campus Only</option>
                                <option value="APK">APK Campus Only</option>
                                <option value="SWC">SWC Campus Only</option>
                                <option value="CUSTOM">Custom Emails (Enter manually) ✍️</option>
                            </select>
                        </div>

                        <div class="form-group" id="customEmailGroup" style="display: none; margin-top: 15px;">
                            <label for="customEmails">Email Addresses</label>
                            <input type="text" id="customEmails" placeholder="e.g. john@test.com, mary@test.com" 
                                style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
                            <small style="color: #888;">Separate multiple emails with a comma.</small>
                        </div>

                        <div class="form-group" style="margin-top: 15px;">
                            <label for="announceSubject">Subject Line</label>
                            <input type="text" id="announceSubject" placeholder="e.g. Important Update regarding Weekend Hiking" 
                                style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;" required>
                        </div>

                        <div class="form-group" style="margin-top: 15px;">
                            <label for="announceMessage">Message Body</label>
                            <textarea id="announceMessage" rows="8" placeholder="Type your announcement here..." 
                                style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: inherit;" required></textarea>
                            <small style="color: #888;">The email will automatically include the C-SHAW header and footer.</small>
                        </div>

                        <div id="announceError" class="error-message hidden" style="margin-top: 15px; color: red;"></div>

                        <button type="submit" id="sendAnnounceBtn" 
                            style="margin-top: 20px; width: 100%; background-color: #2c3e50; color: white; padding: 12px; border: none; border-radius: 6px; font-size: 1rem; font-weight: bold; cursor: pointer;">
                            🚀 Send Announcement
                        </button>
                    </form>
                </div>
            </div>
        `;

        // --- Toggle Custom Email Input ---
        document.getElementById('announceTarget').addEventListener('change', (e) => {
            const customGroup = document.getElementById('customEmailGroup');
            if (e.target.value === 'CUSTOM') {
                customGroup.style.display = 'block';
            } else {
                customGroup.style.display = 'none';
            }
        });

        // --- Handle Form Submission ---
        document.getElementById('announcementForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('sendAnnounceBtn');
            const errorDiv = document.getElementById('announceError');
            
            // Get Values
            const target = document.getElementById('announceTarget').value;
            const customEmails = document.getElementById('customEmails').value;
            const subject = document.getElementById('announceSubject').value;
            const message = document.getElementById('announceMessage').value;

            if(!subject || !message) {
                errorDiv.textContent = "Please fill in all fields.";
                errorDiv.classList.remove('hidden');
                return;
            }

            if(target === 'CUSTOM' && !customEmails.trim()) {
                errorDiv.textContent = "Please enter at least one email address.";
                errorDiv.classList.remove('hidden');
                return;
            }

            // Confirm
            const confirmText = target === 'CUSTOM' ? 'these specific emails' : (target === 'ALL' ? 'EVERYONE' : target + ' Campus');
            if(!confirm(`Are you sure you want to send this email to ${confirmText}?`)) {
                return;
            }

            // Loading State
            btn.textContent = "Sending... (This may take a moment)";
            btn.disabled = true;
            btn.style.backgroundColor = "#95a5a6";
            errorDiv.classList.add('hidden');

            try {
                const response = await fetch('/api/communications/announce/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getValidCsrfToken()
                    },
                    body: JSON.stringify({
                        campus: target,
                        custom_emails: customEmails, // Send custom emails to backend
                        subject: subject,
                        message: message
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert(data.message);
                    // Reset Form
                    document.getElementById('announceSubject').value = '';
                    document.getElementById('announceMessage').value = '';
                    document.getElementById('customEmails').value = '';
                } else {
                    errorDiv.textContent = data.error || "Failed to send.";
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                console.error(err);
                errorDiv.textContent = "Network error occurred.";
                errorDiv.classList.remove('hidden');
            } finally {
                btn.textContent = "🚀 Send Announcement";
                btn.disabled = false;
                btn.style.backgroundColor = "#2c3e50";
            }
        });
    }


    
    async function renderLeaderboard() {
        const mainContent = document.getElementById('mainContent');
        
        // Helper function to extract initials (e.g., "John Doe" -> "JD")
        const getInitials = (firstName, lastName) => {
            return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
        };

        // 1. Inject CSS and the main dark UI structure
        mainContent.innerHTML = `
            <style>
                /* Base dark theme & animations */
                .leaderboard-container {
                    background: linear-gradient(135deg, #101524 0%, #161c2e 100%);
                    color: #e2e8f0;
                    font-family: 'Poppins', sans-serif;
                    border-radius: 20px;
                    padding: 40px;
                    box-shadow: 0 15px 40px rgba(0,0,0,0.2);
                }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

                /* Summary metrics styling */
                .summary-label { font-size: 0.8rem; color: #7f8c8d; text-transform: uppercase; letter-spacing: 1px; }
                .summary-value { font-size: 2.2rem; font-weight: bold; color: #FF8C42; line-height: 1; margin-bottom: 5px; }

                /* --- PODIUM STYLES --- */
                .podium-container { display: flex; justify-content: center; align-items: flex-end; gap: 30px; margin-top: 60px; margin-bottom: 70px; animation: fadeIn 0.8s ease; }
                .podium-spot { text-align: center; }
                
                /* Avatar Circle Base */
                .podium-avatar { width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.8rem; color: #101524; background: #e2e8f0; position: relative; border: 4px solid #1c243a; margin-bottom: 20px; transition: transform 0.2s; cursor: pointer; }
                .podium-avatar:hover { transform: scale(1.05); }

                /* Rank Specific Avatar Styling */
                .rank-1 .podium-avatar { width: 140px; height: 140px; font-size: 2.5rem; background: #FF8C42; box-shadow: 0 0 25px rgba(255, 140, 66, 0.4); border-color: #FF8C42; }
                
                /* The Rank Number Box below the podium */
                .rank-num-box { padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 1.5rem; color: #101524; display: inline-block; background: #bdc3c7; }
                .rank-1 .rank-num-box { background: #FF8C42; color: #ffffff; }

                /* Text Styling on Podium */
                .podium-name { font-weight: bold; font-size: 1.1rem; color: #ffffff; margin-top: 10px; }
                .podium-hours { color: #FF8C42; font-weight: bold; font-size: 0.9rem; margin-bottom: 15px; }

                /* --- RANK CARD STYLES (Scrollable List) --- */
                .rankings-list { 
                    display: flex; 
                    flex-direction: column; 
                    gap: 15px; 
                    animation: slideUp 0.6s ease 0.4s forwards; 
                    opacity: 0; 
                    
                    /* 👇 NEW SCROLLING RULES 👇 */
                    max-height: 500px; 
                    overflow-y: auto;
                    padding-right: 15px;
                }

                /* Custom Dark Scrollbar */
                .rankings-list::-webkit-scrollbar { width: 8px; }
                .rankings-list::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
                .rankings-list::-webkit-scrollbar-thumb { background: rgba(255, 140, 66, 0.3); border-radius: 10px; }
                .rankings-list::-webkit-scrollbar-thumb:hover { background: rgba(255, 140, 66, 0.7); }

                .rank-card { background: #1c243a; border-radius: 12px; padding: 18px 25px; display: flex; align-items: center; justify-content: space-between; border: 1px solid transparent; transition: all 0.2s ease-in-out; cursor: pointer; }
                .rank-card:hover { border-color: rgba(255, 140, 66, 0.5); transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); }

                /* Initials in the card */
                .card-initials { width: 45px; height: 45px; border-radius: 50%; background: #e2e8f0; color: #101524; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; margin-right: 20px; }
                
                /* Punctuality Icon in card */
                .card-perf { font-size: 0.8rem; color: #27ae60; background: #e8f8f0; padding: 3px 8px; border-radius: 10px; font-weight: bold; margin-top: 5px; display: inline-block;}
                .card-perf.late { color: #c0392b; background: #fadbd8; }

                .btn-export { background: #1e293b; color: #bdc3c7; border: 1px solid #334155; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: bold; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
                .btn-export:hover { background: #334155; color: #ffffff; }
                .btn-export.hike:hover { border-color: #10b981; color: #10b981; }
                .btn-export.camp:hover { border-color: #FF8C42; color: #FF8C42; }
            </style>

            <div class="leaderboard-container">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                        <div>
                            <span style="background: rgba(255, 140, 66, 0.15); color: #FF8C42; padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; display: inline-flex; align-items: center; gap: 5px; margin-bottom: 10px;">
                                🏆 SEASON 2026
                            </span>
                            <h1 style="margin: 0; color: #ffffff; font-size: 2.2rem;">Volunteer Leaderboard</h1>
                            
                            <div style="display: flex; gap: 10px; margin-top: 15px;">
                                <button class="btn-export" onclick="window.exportToPDF('ALL')">📄 Export All</button>
                                <button class="btn-export hike" onclick="window.exportToPDF('HIKE')">🥾 Hike List (40+)</button>
                                <button class="btn-export camp" onclick="window.exportToPDF('CAMP')">🏕️ Camp List (80+)</button>
                            </div>
                        </div>
                        <div style="display: flex; gap: 30px; text-align: right;">
                            <div>
                                <div id="totalVolunteers" class="summary-value">0</div>
                                <div class="summary-label">Volunteers</div>
                            </div>
                            <div>
                                <div id="totalHours" class="summary-value">0</div>
                                <div class="summary-label">Total Hours</div>
                            </div>
                        </div>
                    </div>

                <div id="podiumContainer" class="podium-container">
                    <div style="color: #bdc3c7; text-align: center; width: 100%; padding: 40px;">
                        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px;"></i><br>
                        Calculating impact...
                    </div>
                </div>

                <div id="rankingsList" class="rankings-list"></div>
                
                <div style="margin-top: 30px; text-align: center; color: #7f8c8d; font-size: 0.85rem;">
                    <i class="fa-solid fa-bolt" style="color: #FF8C42; margin-right: 5px;"></i> Updated in real-time
                </div>
            </div>
        `;

        // Add CSS for modal (make sure this isn't duplicated in your main CSS file)
        if (!document.getElementById('modalGlobalStyles')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'modalGlobalStyles';
            styleTag.innerHTML = `
                @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .glass-modal { background: rgba(16, 21, 36, 0.85); backdrop-filter: blur(5px); animation: fadeIn 0.3s ease; }
                .modal-content { background: #1c243a; border-radius: 16px; width: 90%; max-width: 450px; padding: 30px; position: relative; border: 1px solid #FF8C42; animation: popIn 0.3s ease-out; color: #e2e8f0;}
                .modal-stat-card { background: #101524; padding: 20px; border-radius: 12px; text-align: center; }
                .modal-stat-value { font-size: 2.2rem; font-weight: bold; color: #FF8C42; line-height: 1; }
                .btn-modal-close { position: absolute; top: 15px; right: 15px; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #bdc3c7; transition: color 0.2s; }
                .btn-modal-close:hover { color: #FF8C42; }
            `;
            document.head.appendChild(styleTag);
        }

        // Add the hidden Modal skeleton to the body if it doesn't exist
        if (!document.getElementById('statsModal')) {
            const modalDiv = document.createElement('div');
            modalDiv.id = 'statsModal';
            modalDiv.className = 'glass-modal';
            modalDiv.style.cssText = "display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; align-items: center; justify-content: center;";
            modalDiv.innerHTML = `
                <div class="modal-content">
                    <button onclick="window.closeStatsModal()" class="btn-modal-close">&times;</button>
                    <div style="text-align: center; margin-bottom: 25px;">
                        <h2 id="modalStudentName" style="margin-top: 0; color: #ffffff;">Student Name</h2>
                        <div style="width: 60px; height: 3px; background: #FF8C42; margin: 0 auto; border-radius: 2px;"></div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
                        <div class="modal-stat-card">
                            <div class="summary-label">Total Hours</div>
                            <div id="modalTotalHours" class="modal-stat-value">0</div>
                        </div>
                        <div class="modal-stat-card">
                            <div class="summary-label">Events</div>
                            <div id="modalTotalEvents" class="modal-stat-value">0</div>
                        </div>
                    </div>

                    <h4 style="margin-bottom: 10px; color: #ffffff;">⏱️ Punctuality Stats</h4>
                    <div style="background: #101524; padding: 15px; border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                            <span>On Time / Early:</span>
                            <span id="modalOnTime" style="font-weight: bold; color: #27ae60;">0</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Late Arrivals:</span>
                            <span id="modalLate" style="font-weight: bold; color: #c0392b;">0</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modalDiv);
        }

        // 2. Fetch the updated data from backend
        try {
            const response = await fetch('/api/users/leaderboard/', {
                headers: { 'X-CSRFToken': getValidCsrfToken() }
            });
            
            if (!response.ok) throw new Error('Failed to fetch leaderboard');
            
            const data = await response.json();

            window.currentLeaderboardData = data.rankings;
            
            // Populate header summary metrics
            document.getElementById('totalVolunteers').textContent = data.summary.volunteers.toLocaleString();
            document.getElementById('totalHours').textContent = data.summary.hours.toLocaleString();

            let students = data.rankings;

            // 3. Sort students from most hours to least
            students.sort((a, b) => b.total_hours - a.total_hours);

            const podium = document.getElementById('podiumContainer');
            podium.innerHTML = ''; // Clear loading text

            const list = document.getElementById('rankingsList');
            list.innerHTML = '';

            if (students.length === 0) {
                podium.innerHTML = '<div style="color: #bdc3c7; text-align: center; width: 100%; padding: 40px;">No volunteer data available yet.</div>';
                return;
            }

            // --- RENDER PODIUM (TOP 3) ---
            const podiumSpots = students.slice(0, 3);
            
            // Define specific layouts for Rank 2, 1, 3
            const layout = [
                { rank: 2, order: 1, data: podiumSpots[1] },
                { rank: 1, order: 2, data: podiumSpots[0] },
                { rank: 3, order: 3, data: podiumSpots[2] }
            ];

            layout.forEach(spot => {
                if (!spot.data) return; 
                
                const student = spot.data;
                const initials = getInitials(student.first_name, student.last_name);
                const safeStudentJSON = JSON.stringify(student).replace(/"/g, '&quot;');

                const spotDiv = document.createElement('div');
                spotDiv.className = `podium-spot rank-${spot.rank}`;
                spotDiv.style.order = spot.order;

                spotDiv.innerHTML = `
                    ${spot.rank === 1 ? '<i class="fa-solid fa-crown" style="font-size: 1.5rem; color: #f1c40f; margin-bottom: 5px; display: block;"></i>' : ''}
                    <div class="podium-avatar" onclick="window.openStatsModal(${safeStudentJSON})">
                        ${initials}
                    </div>
                    <div class="podium-name">${student.first_name} ${student.last_name}</div>
                    <div class="podium-hours">${student.total_hours} hrs</div>
                    <div class="rank-num-box">${spot.rank}</div>
                `;
                podium.appendChild(spotDiv);
            });


            // 👇 THE FIX: Removed the '10' so it loads EVERY remaining student into the scroll box! 👇
            const otherStudents = students.slice(3);
            
            if (otherStudents.length === 0) {
                list.innerHTML = '<div style="color: #7f8c8d; text-align: center; padding: 20px;">More rankings will appear as students earn hours.</div>';
            } else {
                otherStudents.forEach((student, index) => {
                    const rank = index + 4; // Start rank at 4
                    const initials = getInitials(student.first_name, student.last_name);
                    const safeStudentJSON = JSON.stringify(student).replace(/"/g, '&quot;');
                    
                    let punctualityHTML = student.late_count > student.on_time_count ? 
                        `<span class="card-perf late"><i class="fa-solid fa-clock"></i> Usually Late</span>` :
                        `<span class="card-perf"><i class="fa-solid fa-circle-check"></i> Usually On Time</span>`;
                    
                    if (student.late_count === 0 && student.on_time_count === 0) punctualityHTML = '';

                    const card = document.createElement('div');
                    card.className = 'rank-card';
                    card.onclick = () => window.openStatsModal(JSON.parse(safeStudentJSON.replace(/&quot;/g, '"')));
                    
                    card.innerHTML = `
                        <div style="display: flex; align-items: center;">
                            <span style="border: 2px solid #FF8C42; color: #FF8C42; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; margin-right: 20px;">
                                ${rank}
                            </span>
                            <div class="card-initials">${initials}</div>
                            <div>
                                <div style="font-weight: bold; color: #ffffff; font-size: 1rem;">${student.first_name} ${student.last_name}</div>
                                <div style="color: #7f8c8d; font-size: 0.85rem; margin-top: 2px;">${student.campus}</div>
                                ${punctualityHTML}
                            </div>
                        </div>
                        <div style="text-align: right; border-right: 3px solid #FF8C42; padding-right: 15px;">
                            <div style="font-size: 1.6rem; font-weight: bold; color: #FF8C42; line-height: 1;">${student.total_hours}</div>
                            <div style="font-size: 0.75rem; color: #bdc3c7; text-transform: uppercase;">Hours</div>
                        </div>
                    `;
                    list.appendChild(card);
                });
            }

        } catch (error) {
            console.error(error);
            podium.innerHTML = '<div style="color: #e74c3c; text-align: center; width: 100%; padding: 40px;">Error calculating leaderboard. Please try again later.</div>';
        }
    }

    // --- MODAL LOGIC ---

    window.openStatsModal = function(student) {
        document.getElementById('modalStudentName').textContent = `${student.first_name} ${student.last_name}`;
        document.getElementById('modalTotalHours').textContent = student.total_hours;
        document.getElementById('modalTotalEvents').textContent = student.events_attended;
        document.getElementById('modalOnTime').textContent = student.on_time_count;
        document.getElementById('modalLate').textContent = student.late_count;

        // Show the modal
        document.getElementById('statsModal').style.display = 'flex';
    };

    window.closeStatsModal = function() {
        document.getElementById('statsModal').style.display = 'none';
    };


    // --- PDF EXPORT GENERATOR ---

window.exportToPDF = function(filterType) {
    // 1. Check if the jsPDF library has loaded
    if (!window.jspdf) {
        alert("PDF engine is still loading. Please try again in a moment.");
        return;
    }

    // Initialize the document
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    if (!window.currentLeaderboardData || window.currentLeaderboardData.length === 0) {
        alert("No data available to export.");
        return;
    }

    // 2. Filter the data based on the button clicked
    let filteredData = window.currentLeaderboardData;
    let title = "Full Volunteer Leaderboard";
    let filename = "Volunteer_Leaderboard.pdf";
    
    if (filterType === 'HIKE') {
        filteredData = window.currentLeaderboardData.filter(s => s.total_hours >= 40);
        title = "Hike Qualified Volunteers (40+ Hours)";
        filename = "Hike_Qualified_Volunteers.pdf";
    } else if (filterType === 'CAMP') {
        filteredData = window.currentLeaderboardData.filter(s => s.total_hours >= 80);
        title = "Camp Certified Volunteers (80+ Hours)";
        filename = "Camp_Certified_Volunteers.pdf";
    }

    if (filteredData.length === 0) {
        alert("No volunteers have reached this tier yet.");
        return;
    }

    // Sort from highest to lowest
    filteredData.sort((a, b) => b.total_hours - a.total_hours);

    // 3. Prepare the data arrays for the table
    const tableColumns = ["Rank", "Student Name", "Campus", "Total Hours", "Events"];
    const tableRows = [];

    filteredData.forEach((student, index) => {
        const rowData = [
            index + 1,
            `${student.first_name} ${student.last_name}`,
            student.campus,
            `${student.total_hours} hrs`,
            student.events_attended
        ];
        tableRows.push(rowData);
    });

    // 4. Style and draw the PDF
    // Add Title
    doc.setFontSize(18);
    doc.setTextColor(28, 36, 58); // Dark slate matching your UI
    doc.text(title, 14, 22);

    // Add Date
    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

    // Draw the styled table
    doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        startY: 36,
        theme: 'striped',
        headStyles: { 
            fillColor: [255, 140, 66], // Your #FF8C42 Orange
            textColor: 255,
            fontStyle: 'bold'
        },
        styles: { 
            fontSize: 10, 
            cellPadding: 6 
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', fontStyle: 'bold', textColor: [255, 140, 66] }, // Make hours orange
            4: { halign: 'center' }
        }
    });

    // 5. Instantly trigger the file download
    doc.save(filename);
};


// ==========================================
// CALENDAR VIEW LOGIC
// ==========================================
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let selectedDate = new Date();
let allCalendarEvents = []; // Global store for the fetched events

async function renderCalendar() {
    // 1. Setup the UI Shell
    mainContent.innerHTML = `
        <div class="header-section">
            <h1>Event Calendar</h1>
            <p>Select a date to view your upcoming events.</p>
        </div>
        <div class="calendar-wrapper">
            <div class="calendar-header">
                <button id="prevMonthBtn" class="cal-nav-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <h2 id="currentMonthYear">Loading...</h2>
                <button id="nextMonthBtn" class="cal-nav-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            </div>
            
            <div class="calendar-grid">
                <div class="cal-weekday">Sun</div>
                <div class="cal-weekday">Mon</div>
                <div class="cal-weekday">Tue</div>
                <div class="cal-weekday">Wed</div>
                <div class="cal-weekday">Thu</div>
                <div class="cal-weekday">Fri</div>
                <div class="cal-weekday">Sat</div>
            </div>
            <div id="calendarDays" class="calendar-grid"></div>

            <div class="agenda-container" id="agendaContainer">
                </div>
        </div>
    `;

    // 2. Attach Listeners for Month Navigation
    document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));

    // 3. Fetch Events from your Django API
    try {
        const response = await fetch('/api/activities/');
        if (response.ok) {
            allCalendarEvents = await response.json();
        }
    } catch (error) {
        console.error("Failed to load events", error);
    }

    // 4. Build the actual dates
    buildCalendarGrid();
}

// Logic to swap months
function changeMonth(direction) {
    currentMonth += direction;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    else if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    buildCalendarGrid();
}

// Logic to draw the days
function buildCalendarGrid() {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    document.getElementById('currentMonthYear').textContent = `${monthNames[currentMonth]} ${currentYear}`;

    const daysContainer = document.getElementById('calendarDays');
    daysContainer.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();

    // Add empty padding for the start of the month
    for (let i = 0; i < firstDay; i++) {
        daysContainer.innerHTML += `<div class="cal-day empty"></div>`;
    }

    // Build the actual days
    for (let i = 1; i <= daysInMonth; i++) {
        // We pad the month/day with a zero so it cleanly matches ISO standard dates
        const monthStr = String(currentMonth + 1).padStart(2, '0');
        const dayStr = String(i).padStart(2, '0');
        const dateString = `${currentYear}-${monthStr}-${dayStr}`; 
        
        const cellDate = new Date(currentYear, currentMonth, i);

        // Check if any events exist on this date string
        const dayEvents = allCalendarEvents.filter(ev => ev.date_time && ev.date_time.startsWith(dateString));
        const hasEventClass = dayEvents.length > 0 ? 'has-event' : '';
        const isToday = (cellDate.toDateString() === today.toDateString()) ? 'today' : '';
        const isSelected = (cellDate.toDateString() === selectedDate.toDateString()) ? 'selected' : '';

        daysContainer.innerHTML += `
            <div class="cal-day ${isToday} ${hasEventClass} ${isSelected}" data-date="${dateString}">
                ${i}
            </div>
        `;
    }

    // Add click functionality to each day
    document.querySelectorAll('.cal-day:not(.empty)').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
            // Remove selection from others
            document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
            this.classList.add('selected'); // Select this one
            
            selectedDate = new Date(this.dataset.date);
            renderAgenda(this.dataset.date);
        });
    });

    // Automatically render the agenda for the first valid day viewable
    let defaultRenderDate = new Date(currentYear, currentMonth, today.getDate());
    if (currentMonth !== today.getMonth() || currentYear !== today.getFullYear()) {
        defaultRenderDate = new Date(currentYear, currentMonth, 1);
    }
    
    // Convert default date to YYYY-MM-DD for the agenda renderer
    const defMonthStr = String(currentMonth + 1).padStart(2, '0');
    const defDayStr = String(defaultRenderDate.getDate()).padStart(2, '0');
    renderAgenda(`${currentYear}-${defMonthStr}-${defDayStr}`);
}

// Logic to draw the agenda list for the selected day
function renderAgenda(dateString) {
    const container = document.getElementById('agendaContainer');
    
    // Filter events that happen on this specific date
    const dayEvents = allCalendarEvents.filter(ev => ev.date_time && ev.date_time.startsWith(dateString));

    // Format the title (e.g., "17 June 2026")
    const dateObj = new Date(dateString);
    const day = dateObj.getDate();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = monthNames[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    const formattedDate = `${day} ${month} ${year}`;

    let html = `<h3 class="agenda-title">Schedule for ${formattedDate}</h3>`;

    if (dayEvents.length === 0) {
        // The minimal empty state for a single day
        html += `
            <div style="text-align:center; padding: 30px; color: var(--text-muted); background: #f8fafc; border-radius: 12px; border: 1px dashed rgba(0,0,0,0.1);">
                No activities scheduled on this date.
            </div>`;
    } else {
        // Map out the event cards
        dayEvents.forEach(ev => {
            // Determine time (from and to time)
            const startDate = new Date(ev.date_time);
            let timeString = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const duration = parseFloat(ev.duration_hours);
            if (!isNaN(duration) && duration > 0) {
                const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
                const toTimeString = endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                timeString = `${timeString} - ${toTimeString}`;
            }

            // Determine campus location
            let locationName = ev.campus || 'Campus';
            if (ev.campus === 'ALL') {
                locationName = 'All Campuses';
            } else if (ev.campus && ev.campus !== 'Campus') {
                locationName = ev.campus + ' Campus';
            }

            html += `
                <div class="agenda-event-card">
                    <div class="agenda-details">
                        <h4 class="agenda-event-title">${ev.title}</h4>
                        <div class="agenda-time-row">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span>${timeString}</span>
                        </div>
                        <div class="agenda-location-row">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            <span>${locationName}</span>
                        </div>
                    </div>
                </div>
            `;
        });
    }
    container.innerHTML = html;
}


async function renderCareerToolkit() {
    // 1. Update Navigation State
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    document.getElementById('nav-item-career').classList.add('active');

    // 2. Show Loading State immediately
    mainContent.innerHTML = `
        <div class="career-toolkit-container" style="text-align: center; padding: 60px;">
            <div style="color: #64748b; font-size: 1.1rem;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" style="margin-bottom: 10px;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                <br>Loading your verified volunteer data...
            </div>
        </div>
    `;

    try {
        // 3. Fetch data from your actual backend API
        const response = await fetch('/api/career-toolkit/stats/');
        
        if (!response.ok) {
            throw new Error(`Failed to load data (Status: ${response.status})`);
        }
        
        const stats = await response.json();
        
        // Save stats globally so we can view saved text without fetching the API again
        window.currentCareerStats = stats;

        // --- HELPER FUNCTION TO BUILD DYNAMIC CARDS ---
        const buildCard = (type, title, desc, iconSvg) => {
            // Default status if the backend hasn't implemented it yet
            const status = (stats.assetStatus && stats.assetStatus[type]) 
                ? stats.assetStatus[type] 
                : { exists: false, needs_update: false };

            // Primary Button: "View Saved" or "Generate"
            const primaryBtn = status.exists 
                ? `<button class="btn-toolkit" style="flex-grow: 1;" onclick="viewSaved('${type}', '${title}')">View Saved</button>`
                : `<button class="btn-toolkit" style="flex-grow: 1;" onclick="openGenerator('${type}', this)">Generate ${title}</button>`;

            // Secondary Button: Only show if they have new hours to add!
            const updateBtn = (status.exists && status.needs_update)
                ? `<button class="btn-toolkit" style="background: #eff6ff; border-color: #3b82f6; color: #3b82f6;" onclick="openGenerator('${type}', this, true)" title="You have logged new hours! Update to include them.">🔄 Update</button>`
                : ``;

            return `
                <div class="toolkit-card">
                    <div class="card-icon ${type}-icon">${iconSvg}</div>
                    <h3>${title}</h3>
                    <p>${desc}</p>
                    <div style="display: flex; gap: 10px; width: 100%;">
                        ${primaryBtn}
                        ${updateBtn}
                    </div>
                </div>
            `;
        };

        // 4. Render the Dashboard with real data
        mainContent.innerHTML = `
            <div class="career-toolkit-container">
                
                <div class="toolkit-header">
                    <div class="header-content">
                        <h1>AI Career Toolkit</h1>
                        <p>Transform your verified C-SHAW (Centre for Student Health and Wellness) experience into professional, career-ready content.</p>
                    </div>
                    
                    <div class="verified-data-bar">
                        <div class="data-badge"><span class="label">Verified Hours</span> <span class="value">${stats.totalHours}h</span></div>
                        <div class="data-badge"><span class="label">Events</span> <span class="value">${stats.eventsAttended}</span></div>
                        <div class="data-badge"><span class="label">Roles</span> <span class="value">${stats.roles}</span></div>
                        <div class="data-badge"><span class="label">Active</span> <span class="value">${stats.yearsActive}</span></div>
                    </div>
                </div>

                <div class="toolkit-grid">
                    
                    ${buildCard(
                        'cv', 
                        'CV Experience Section', 
                        'Instantly generate professional, ATS-friendly bullet points detailing your volunteer impact.', 
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'
                    )}

                    ${buildCard(
                        'linkedin', 
                        'LinkedIn Summary', 
                        'Create a compelling professional summary highlighting your leadership and community engagement.', 
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>'
                    )}

                    ${buildCard(
                        'scholarship', 
                        'Application Statement', 
                        'Draft application-ready statements emphasizing your social contribution and personal growth.', 
                        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
                    )}

                    <div class="toolkit-card highlight-card">
                        <div class="card-icon report-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        </div>
                        <h3>Official Impact Report</h3>
                        <p>Download a verified PDF portfolio of your C-SHAW volunteer history and achievements.</p>
                        <button class="btn-toolkit-primary" onclick="generateImpactReport(this)">Download PDF Report</button>
                    </div>

                </div>
                
                <div id="toolkitOutputArea" style="margin-top: 40px; display: none;"></div>

            </div>
        `;

    } catch (error) {
        console.error("Career Toolkit Error:", error);
        mainContent.innerHTML = `
            <div class="career-toolkit-container" style="text-align: center; padding: 60px;">
                <div style="color: #ef4444; font-size: 1.1rem; font-weight: bold;">
                    ⚠️ Could not load your volunteer data.
                </div>
                <p style="color: #64748b;">Please try refreshing the page or contact support if the issue persists.</p>
            </div>
        `;
    }
}

window.viewSaved = function(type, title) {
    const outputArea = document.getElementById('toolkitOutputArea');
    
    // Grab the text we saved globally during the render phase
    const content = window.currentCareerStats.assetStatus[type].content;
    const formattedContent = content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

    outputArea.style.display = 'block';
    outputArea.innerHTML = `
        <div class="ai-output-box success-box">
            <div class="output-header">
                <h4>✨ Saved ${title}</h4>
                <button class="btn-copy" onclick="copyToClipboard(this)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy
                </button>
            </div>
            <div class="output-content">
                <p>${formattedContent}</p>
            </div>
        </div>
    `;

    outputArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// --- AI GENERATION FUNCTION (Attached to window) ---
window.openGenerator = async function(type, btnElement) {
    const outputArea = document.getElementById('toolkitOutputArea');
    const originalText = btnElement.innerText;
    
    // 1. Set Loading State
    btnElement.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="animate-spin" style="margin-right: 8px; vertical-align: middle;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
        Generating...
    `;
    btnElement.disabled = true;
    
    // Smoothly reveal the output area in a "loading" state
    outputArea.style.display = 'block';
    outputArea.innerHTML = `
        <div class="ai-output-box loading-box">
            <div class="pulse-line"></div>
            <div class="pulse-line" style="width: 80%"></div>
            <div class="pulse-line" style="width: 60%"></div>
            <p style="color: #94a3b8; font-size: 0.9rem; margin-top: 16px;">AI is reviewing your verified volunteer history...</p>
        </div>
    `;

    try {
        // 2. Call your Django Backend
        const csrfToken = typeof getValidCsrfToken === 'function' ? getValidCsrfToken() : ''; 
        
        const response = await fetch('/api/career-toolkit/generate/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ type: type })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Generation failed.");
        }

        // 3. Format the Output
        const formattedContent = data.content.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');

        let title = "Generated Content";
        if (type === 'cv') title = "CV Experience Section";
        if (type === 'linkedin') title = "LinkedIn Professional Summary";
        if (type === 'scholarship') title = "Application Statement";

        outputArea.innerHTML = `
            <div class="ai-output-box success-box">
                <div class="output-header">
                    <h4>✨ ${title}</h4>
                    <button class="btn-copy" onclick="copyToClipboard(this)">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy
                    </button>
                </div>
                <div class="output-content">${data.content || content}</div>
            </div>
        `;

        outputArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        console.error(error);
        outputArea.innerHTML = `
            <div class="ai-output-box error-box">
                <h4 style="color: #ef4444; margin-top: 0;">Generation Error</h4>
                <p>${error.message}</p>
            </div>
        `;
    } finally {
        // 4. Reset Button
        btnElement.innerHTML = originalText;
        btnElement.disabled = false;
    }
};

// --- PDF REPORT FUNCTION (Attached to window) ---
window.generateImpactReport = async function(btnElement) {
    const originalText = btnElement.innerText;
    btnElement.innerText = "Preparing PDF...";
    btnElement.disabled = true;

    try {
        const response = await fetch('/api/career-toolkit/report/');
        
        if (!response.ok) throw new Error("Failed to generate report.");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'CSHAW_Volunteer_Impact_Report.pdf';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();

    } catch (error) {
        console.error(error);
        alert("Report generation is currently unavailable. Please try again later.");
    } finally {
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
};

// --- COPY TO CLIPBOARD HELPER (Attached to window) ---
window.copyToClipboard = function(btnElement) {
    const contentDiv = btnElement.closest('.ai-output-box').querySelector('.output-content');
    const textToCopy = contentDiv.innerText;

    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = `<span style="color: #10B981;">✓ Copied!</span>`;
        setTimeout(() => {
            btnElement.innerHTML = originalHtml;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};



    // Logout Logic
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            
            // 1. Try to grab it directly from the hidden HTML input first (most reliable)
            const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
            
            // 2. If not in the DOM, check the prod cookie, then the local cookie
            const csrfToken = csrfInput ? csrfInput.value : 
                              (getCookie('__Host-csrftoken') || getValidCsrfToken());

            if (!csrfToken) {
                console.error("❌ Could not find CSRF token for logout.");
                return;
            }

            try {
                const response = await fetch('/api/users/logout/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken }
                });
                
                if (response.ok) {
                    // Optional: Clear out any local storage you are using for the user
                    localStorage.removeItem('user_role'); 
                    
                    window.location.href = '/login/';
                } else {
                    console.error("❌ Logout failed with status:", response.status);
                }
            } catch (err) { 
                console.error("Network error during logout:", err); 
            }
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


    const linkAchievements = document.getElementById('link-achievements');
    if (linkAchievements) {
        linkAchievements.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active state from all items and links
            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
            
            // Highlight achievements
            const parentLi = linkAchievements.closest('.nav-item');
            if (parentLi) parentLi.classList.add('active');
            linkAchievements.classList.add('active');
            
            renderAchievements();
            
            // Close the sidebar if on mobile
            if (window.innerWidth < 1024) {
                document.getElementById('sidebar').classList.remove('open');
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) overlay.classList.remove('active');
            }
        });
    }

    async function renderAchievements() {
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = '<div class="loader"></div>';

        try {
            const response = await fetch('/api/users/stats/');
            if (!response.ok) throw new Error("Network response was not ok");
            const data = await response.json();
            
            const badges = data.badges || [];
            const awards = data.awards || [];
            const accolades = data.learning_accolades || [];
            const totalHours = data.total_hours || 0;
            
            const has40 = badges.find(b => b.type === '40_hours');
            const has80 = badges.find(b => b.type === '80_hours');

            const progress40Percent = Math.min(100, (totalHours / 40) * 100);
            const progress80Percent = Math.min(100, (totalHours / 80) * 100);
            
            const circ = 402.1; // 2 * PI * 64
            const offset40 = circ - (progress40Percent / 100) * circ;
            const offset80 = circ - (progress80Percent / 100) * circ;

            let html = `
                <div class="header-section">
                    <h2 class="section-title">Achievements & Milestones</h2>
                </div>
                
                <h3 style="margin-top: 20px; color: var(--text-main); font-weight: 800; font-family: var(--font-family);">Hours Milestones</h3>
                <div class="achievements-grid">
                    
                    <div class="achievement-card ${has40 ? 'unlocked' : 'locked'}">
                        <div class="badge-ring-wrapper">
                            <svg class="progress-ring" width="150" height="150">
                                <defs>
                                    <linearGradient id="grad-40" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="#FF8C42" />
                                        <stop offset="50%" stop-color="#FF5722" />
                                        <stop offset="100%" stop-color="#FF3D00" />
                                    </linearGradient>
                                    <filter id="metallic-glow-40" x="-20%" y="-20%" width="140%" height="140%">
                                        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#FF5722" flood-opacity="0.3" />
                                    </filter>
                                </defs>
                                <circle class="progress-ring__bg" stroke="#f1f5f9" stroke-width="10" fill="transparent" r="64" cx="75" cy="75"/>
                                <circle class="progress-ring__bar" stroke="url(#grad-40)" stroke-dasharray="402.1" stroke-dashoffset="${offset40}" stroke-width="10" stroke-linecap="round" fill="transparent" r="64" cx="75" cy="75" filter="${has40 ? 'url(#metallic-glow-40)' : ''}"/>
                            </svg>
                            <div class="badge-inner-circle">
                                <span class="badge-number">${has40 ? '40' : '🔒'}</span>
                                <span class="badge-unit">HRS</span>
                            </div>
                        </div>
                        <div class="badge-content">
                            <h4 class="badge-title">40 Hours Milestone</h4>
                            <div class="badge-status-pill ${has40 ? 'unlocked' : 'locked'}">
                                ${has40 ? `Earned ${has40.date_earned}` : `${Math.round(progress40Percent)}% Complete (${totalHours}/40h)`}
                            </div>
                        </div>
                    </div>

                    <div class="achievement-card ${has80 ? 'unlocked' : 'locked'}">
                        <div class="badge-ring-wrapper">
                            <svg class="progress-ring" width="150" height="150">
                                <defs>
                                    <linearGradient id="grad-80" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="#FFD700" />
                                        <stop offset="50%" stop-color="#FFA000" />
                                        <stop offset="100%" stop-color="#FF8C00" />
                                    </linearGradient>
                                    <filter id="metallic-glow-80" x="-20%" y="-20%" width="140%" height="140%">
                                        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#FFA000" flood-opacity="0.3" />
                                    </filter>
                                </defs>
                                <circle class="progress-ring__bg" stroke="#f1f5f9" stroke-width="10" fill="transparent" r="64" cx="75" cy="75"/>
                                <circle class="progress-ring__bar" stroke="url(#grad-80)" stroke-dasharray="402.1" stroke-dashoffset="${offset80}" stroke-width="10" stroke-linecap="round" fill="transparent" r="64" cx="75" cy="75" filter="${has80 ? 'url(#metallic-glow-80)' : ''}"/>
                            </svg>
                            <div class="badge-inner-circle">
                                <span class="badge-number">${has80 ? '80' : '🔒'}</span>
                                <span class="badge-unit">HRS</span>
                            </div>
                        </div>
                        <div class="badge-content">
                            <h4 class="badge-title">80 Hours Milestone</h4>
                            <div class="badge-status-pill ${has80 ? 'unlocked' : 'locked'}">
                                ${has80 ? `Earned ${has80.date_earned}` : `${Math.round(progress80Percent)}% Complete (${totalHours}/80h)`}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // --- LEARNING ACCOLADES ---
            html += `
                <hr style="margin: 40px 0; border: none; border-top: 1px solid var(--border-color);">
                <h3 style="margin-top: 20px; color: var(--text-main); font-weight: 800; font-family: var(--font-family);">Learning Accolades</h3>
                <div class="awards-gallery" style="margin-top: 20px;">
            `;

            if (accolades.length === 0) {
                html += `
                    <div class="no-awards-card">
                        <svg class="no-awards-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        </svg>
                        <p class="no-awards-text">No courses mastered yet. Score 100% on quizzes to earn learning accolades!</p>
                    </div>
                `;
            } else {
                accolades.forEach(acc => {
                    html += `
                        <div class="award-gallery-card">
                            <div class="award-trophy-container">
                                <div class="award-trophy-badge" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display:flex; justify-content:center; align-items:center;">
                                    <span style="font-size: 2rem;">🥇</span>
                                </div>
                            </div>
                            <div class="award-gallery-details">
                                <span class="award-gallery-date">Completed ${acc.date_completed}</span>
                                <h4 class="award-gallery-title">${acc.quiz_title}</h4>
                                <p class="award-gallery-desc">Mastered this course material with a perfect 100% score!</p>
                            </div>
                        </div>
                    `;
                });
            }
            html += '</div>';

            html += `
                <hr style="margin: 40px 0; border: none; border-top: 1px solid var(--border-color);">
                
                <h3 style="margin-top: 20px; color: var(--text-main); font-weight: 800; font-family: var(--font-family);">Special Awards</h3>
                <div class="awards-gallery" style="margin-top: 20px;">
            `;

            if (awards.length === 0) {
                html += `
                    <div class="no-awards-card">
                        <svg class="no-awards-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                        <p class="no-awards-text">No awards achieved yet. Keep up the dedication to unlock achievements!</p>
                    </div>
                `;
            } else {
                awards.forEach(a => {
                    html += `
                        <div class="award-gallery-card">
                            <div class="award-trophy-container">
                                <div class="award-trophy-badge" style="background: linear-gradient(135deg, ${a.color || '#fbbf24'} 0%, #b45309 100%);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="trophy-svg">
                                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                                        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                                        <path d="M4 22h16"></path>
                                        <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path>
                                        <path d="M12 2a6 6 0 0 1 6 6v1H6V8a6 6 0 0 1 6-6z"></path>
                                    </svg>
                                </div>
                            </div>
                            <div class="award-gallery-details">
                                <span class="award-gallery-date">Awarded ${a.date_awarded || '2026'}</span>
                                <h4 class="award-gallery-title">${a.name}</h4>
                                <p class="award-gallery-desc">${a.description || 'Recognized for outstanding contributions and commitment to the peer education program.'}</p>
                            </div>
                        </div>
                    `;
                });
            }
            html += '</div>';

            mainContent.innerHTML = html;

        } catch (err) {
            console.error("Error fetching achievements:", err);
            mainContent.innerHTML = '<p style="color:red; text-align:center;">Failed to load achievements.</p>';
        }
    }



    renderActivities();
});
