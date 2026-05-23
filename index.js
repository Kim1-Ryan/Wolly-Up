// GLOBAL DATABASE CREDENTIAL PARAMETERS
const SUPABASE_URL = "https://brooyrbsllnlsqtgohtg.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_PZi69pAWccthnk2-owPv1Q_EQQlpEcD";

// MEMORY STORAGE POOLS FOR SESSION TRANSITIONS
let currentUserSessionToken = null;
let loggedInUserId = null;
let loggedInUserEmail = null;
let loggedInUserRole = null; 
let cachedJobsList = [];      
let selectedJobId = null;     
let activeHistoryTab = 'left';

// THE SAFETY WINDOW WRAPPER: Delays processing until full DOM tree elements paint
document.addEventListener('DOMContentLoaded', () => {
    let authMode = 'signup'; 

    // DOM ELEMENTS LOOKUP OBJECT MATRIX
    const authForm = document.getElementById('authForm');
    const authTitle = document.getElementById('authTitle');
    const authBtn = document.getElementById('authBtn');
    const toggleAuthBtn = document.getElementById('toggleAuthBtn');
    const accountTypeContainer = document.getElementById('accountTypeContainer');
    const authStatus = document.getElementById('status');
    const authBox = document.getElementById('authBox');
    const userDashboard = document.getElementById('userDashboard');
    const userEmailSpan = document.getElementById('userEmail');
    const userRoleBadge = document.getElementById('userRoleBadge');
    const roleSwapBtn = document.getElementById('roleSwapBtn');
    const logoutBtn = document.getElementById('logoutBtn');    
    const lockMessage = document.getElementById('lockMessage');
    const jobBox = document.getElementById('jobBox');
    const jobForm = document.getElementById('jobForm');
    const formStatus = document.getElementById('formStatus');
    const applyBox = document.getElementById('applyBox');
    const applyJobTitle = document.getElementById('applyJobTitle');
    const submitBidBtn = document.getElementById('submitBidBtn');
    const bidStatus = document.getElementById('bidStatus');
    const historyBox = document.getElementById('historyBox');
    const historyList = document.getElementById('historyList');
    const tabLeft = document.getElementById('tabLeft');
    const tabRight = document.getElementById('tabRight');
    const feedContainer = document.getElementById('feed');
    const searchBar = document.getElementById('searchBar');
    const filterCategory = document.getElementById('filterCategory');
    const userProfileIcon = document.getElementById('userProfileIcon');
    // =========================================================================
    // 🔥 AUTOMATIC SESSION RECOVERY ENGINE (FIXES THE BACK-TO-FEED LOGOUT BUG)
    // =========================================================================
    function tryRestoreActiveSession() {
        const savedToken = localStorage.getItem('marketplace_token');
        const savedUserId = localStorage.getItem('marketplace_userId');
        const savedEmail = localStorage.getItem('marketplace_email');
        const savedRole = localStorage.getItem('marketplace_role');

        if (savedToken && savedUserId && savedEmail) {
            // Restore global memory states from local disk cache properties
            currentUserSessionToken = savedToken;
            loggedInUserId = savedUserId;
            loggedInUserEmail = savedEmail;
            loggedInUserRole = savedRole || 'freelancer';

            // Mutate interface panel visibilities instantly to hide logging alerts
            if (authBox) authBox.classList.add('hidden');
            if (userDashboard) userDashboard.classList.remove('hidden');
            if (historyBox) historyBox.classList.remove('hidden');
            if (userProfileIcon) userProfileIcon.classList.remove('hidden');
            if (userEmailSpan) userEmailSpan.textContent = loggedInUserEmail;

            updateDashboardLayoutView();
        }
    }
    // 1. SECURE FEED QUERIES & REAL-TIME SEARCH INDEXERS
    async function fetchAndRenderFeed() {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs?select=*&order=created_at.desc`, {
                method: 'GET',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
            });
            if (!response.ok) throw new Error(`HTTP error status ${response.status}`);
            cachedJobsList = await response.json();
            applyFiltersAndRender();
        } catch (err) { 
            if (feedContainer) feedContainer.innerHTML = `<p style="color: red; text-align: center;">Feed Connection Failed: ${err.message}</p>`;
        }
    }
    function applyFiltersAndRender() {
        if (!feedContainer) return;
        const searchKeyword = searchBar ? searchBar.value.toLowerCase() : '';
        const categorySelection = filterCategory ? filterCategory.value : 'ALL';

        const filteredJobs = cachedJobsList.filter(job => {
            const matchesSearch = job.title.toLowerCase().includes(searchKeyword) || job.description.toLowerCase().includes(searchKeyword);
            const matchesCategory = (categorySelection === 'ALL') || (job.category === categorySelection);
            return matchesSearch && matchesCategory;
        });

        if (filteredJobs.length === 0) {
            feedContainer.innerHTML = `<p style="color: #999; text-align: center; font-style: italic;">No active marketplace matches found.</p>`;
            return;
        }

        feedContainer.innerHTML = filteredJobs.map(job => `
            <div class="job-card ${selectedJobId === job.id ? 'selected' : ''}" onclick="handleJobCardSelection('${job.id}', '${escapeHTML(job.title)}')">
                <span class="category-badge">${escapeHTML(job.category || 'General')}</span>
                <h3 class="job-card-title">${escapeHTML(job.title)}</h3>
                <p style="margin: 0; color: #555; font-size: 0.9rem; line-height: 1.4;">${escapeHTML(job.description)}</p>
                <div class="job-card-budget">Est. Budget: $${job.budget}</div>
            </div>
        `).join('');
    }

    if (searchBar) searchBar.addEventListener('input', applyFiltersAndRender);
    if (filterCategory) filterCategory.addEventListener('change', applyFiltersAndRender);
    // 2. INTERACTIVE CARD CLICK SELECTION PIPELINES
    window.handleJobCardSelection = function(jobId, jobTitle) {
        selectedJobId = jobId;
        applyFiltersAndRender(); 
        
        if (currentUserSessionToken && loggedInUserRole === 'freelancer') {
            if (applyBox) applyBox.classList.remove('hidden');
            if (lockMessage) lockMessage.classList.add('hidden');
            if (applyJobTitle) applyJobTitle.textContent = jobTitle;
            if (bidStatus) bidStatus.textContent = "";
        } else if (currentUserSessionToken && loggedInUserRole === 'client') {
            if (applyBox) applyBox.classList.add('hidden');
            if (lockMessage) {
                lockMessage.innerHTML = `ℹ️ You are logged in as a Client. Switch view to Freelancer to apply for positions.`;
                lockMessage.classList.remove('hidden');
            }
        } else {
            if (applyBox) applyBox.classList.add('hidden');
            if (lockMessage) {
                lockMessage.innerHTML = `⚠️ <strong>Access Denied:</strong> Log in as a Freelancer to apply for <em>"${jobTitle}"</em>.`;
                lockMessage.classList.remove('hidden');
            }
        }
    };
    // 3. TRANSMIT FREELANCER PITCH APPLICATIONS TO THE CLOUD
    if (submitBidBtn) {
        submitBidBtn.addEventListener('click', async () => {
            const bidText = document.getElementById('bidText').value;
            const bidAmount = parseInt(document.getElementById('bidAmount').value);
            if (!bidText || !bidAmount || !selectedJobId) return;

            bidStatus.style.color = "black";
            bidStatus.textContent = "Transmitting pitch to Supabase...";

            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/bids`, {
                    method: 'POST',
                    headers: { 
                        'apikey': SUPABASE_ANON_KEY, 
                        'Authorization': `Bearer ${currentUserSessionToken}`, 
                        'Content-Type': 'application/json', 
                        'Prefer': 'return=minimal' 
                    },
                    body: JSON.stringify({ 
                        job_id: selectedJobId, 
                        freelancer_email: loggedInUserEmail, 
                        proposal_text: bidText, 
                        bid_amount: bidAmount, 
                        user_id: loggedInUserId, 
                        status: 'pending' 
                    })
                });
                if (!response.ok) throw new Error("Database rejected submission parameters");
                bidStatus.style.color = "green";
                bidStatus.textContent = "Application saved to database!";
                document.getElementById('bidText').value = '';
                document.getElementById('bidAmount').value = '';
                fetchAndRenderHistory();
            } catch (err) { 
                bidStatus.style.color = "red"; 
                bidStatus.textContent = err.message; 
            }
        });
    }
    // 4. INTEGRATED HISTORICAL LOG TRACKING HOOKS
    async function fetchAndRenderHistory() {
        if (!currentUserSessionToken || !historyList || !tabLeft || !tabRight) return;
        try {
            if (loggedInUserRole === 'freelancer') {
                tabLeft.textContent = "Positions Applied For";
                tabRight.textContent = "Active Quotes Given";

                if (activeHistoryTab === 'left') {
                    const resp = await fetch(`${SUPABASE_URL}/rest/v1/bids?user_id=eq.${loggedInUserId}&select=*,jobs(title,category)`, {
                        method: 'GET',
                        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}` }
                    });
                    const data = await resp.json();
                    historyList.innerHTML = (!data || data.length === 0) ? '<p>You have not applied to any jobs yet.</p>' :
                        data.map(b => `
                            <div class="history-item">
                                Applied to <strong>${escapeHTML(b.jobs?.title)}</strong><br>
                                Quote: $${b.bid_amount} - "${escapeHTML(b.proposal_text)}"<br>
                                <span class="status-pill status-${b.status || 'pending'}">${b.status || 'pending'}</span>
                            </div>
                        `).join('');
                } else {
                    historyList.innerHTML = '<p>No custom billing offer tokens pending at this stage.</p>';
                }
            } else {
                tabLeft.textContent = "My Posted Listings";
                tabRight.textContent = "Applications Received";

                if (activeHistoryTab === 'left') {
                    const resp = await fetch(`${SUPABASE_URL}/rest/v1/jobs?user_id=eq.${loggedInUserId}&select=*`, {
                        method: 'GET',
                        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}` }
                    });
                    const data = await resp.json();
                    historyList.innerHTML = (!data || data.length === 0) ? '<p>You have not published any listings yet.</p>' :
                        data.map(j => `<div class="history-item">Listed: <strong>${escapeHTML(j.title)}</strong> [${escapeHTML(j.category)}] - Budget: $${j.budget}</div>`).join('');
                } else {
                    const resp = await fetch(`${SUPABASE_URL}/rest/v1/bids?select=*,jobs!inner(title,user_id)`, {
                        method: 'GET',
                        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}` }
                    });
                    const data = await resp.json();
                    const filtered = data.filter(b => b.jobs?.user_id === loggedInUserId);
                    
                    historyList.innerHTML = (filtered.length === 0) ? '<p>No applications received yet.</p>' :
                        filtered.map(b => `
                            <div class="history-item">
                                <strong style="color: #10a37f;">${escapeHTML(b.freelancer_email)}</strong> bid $${b.bid_amount} on <em>"${escapeHTML(b.jobs?.title || 'Your Post')}"</em><br>
                                "${escapeHTML(b.proposal_text)}"<br>
                                <div style="margin-top: 8px;">
                                    ${b.status === 'pending' ? `
                                        <button class="action-accept" onclick="updateBidStatusDirectly('\${b.id}', 'accepted')">Accept</button>
                                        <button class="action-reject" onclick="updateBidStatusDirectly('\${b.id}', 'rejected')">Reject</button>
                                    ` : `<span class="status-pill status-\({b.status}">\){b.status}</span>`}
                                </div>
                            </div>
                        `).join('');
                }
            }
        } catch (e) { console.error(e); }
    }

    window.updateBidStatusDirectly = async function(bidId, statusValue) {
        const actionText = statusValue === 'accepted' ? 'ACCEPT this proposal' : 'REJECT this application';
        if (!confirm(`Are you sure you want to ${actionText}?`)) return;

        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/bids?id=eq.${bidId}`, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: statusValue })
            });
            if (!response.ok) throw new Error("Status patch failed");
            fetchAndRenderHistory(); 
        } catch (e) { alert(e.message); }
    };

    if (tabLeft && tabRight) {
        tabLeft.addEventListener('click', () => { activeHistoryTab = 'left'; tabLeft.classList.add('active'); tabRight.classList.remove('active'); fetchAndRenderHistory(); });
        tabRight.addEventListener('click', () => { activeHistoryTab = 'right'; tabRight.classList.add('active'); tabLeft.classList.remove('active'); fetchAndRenderHistory(); });
    }
    if (userProfileIcon) {
        userProfileIcon.addEventListener('click', () => {
            if (!currentUserSessionToken) return;
            localStorage.setItem('marketplace_token', currentUserSessionToken);
            localStorage.setItem('marketplace_userId', loggedInUserId);
            localStorage.setItem('marketplace_email', loggedInUserEmail);
            localStorage.setItem('marketplace_role', loggedInUserRole);
            window.location.href = "userProfile.html";
        });
    }

    // 5. LIVE LOGGED-IN ROLE SWAPPER
    if (roleSwapBtn) {
        roleSwapBtn.addEventListener('click', async () => {
            loggedInUserRole = (loggedInUserRole === 'client') ? 'freelancer' : 'client';
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${loggedInUserId}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ account_type: loggedInUserRole })
                });
                localStorage.setItem('marketplace_role', loggedInUserRole); // Update token reference cache
                updateDashboardLayoutView();
            } catch (e) { console.error(e); }
        });
    }

    function updateDashboardLayoutView() {
        if (!userRoleBadge || !tabLeft || !tabRight || !jobBox || !applyBox || !lockMessage || !historyBox) return;
        userRoleBadge.textContent = loggedInUserRole;
        userRoleBadge.style.color = loggedInUserRole === 'client' ? '#10a37f' : '#007bff';
        activeHistoryTab = 'left';
        tabLeft.classList.add('active');
        tabRight.classList.remove('active');
        selectedJobId = null;

        if (loggedInUserRole === 'client') {
            if (jobBox) jobBox.classList.remove('hidden');
            if (applyBox) applyBox.classList.add('hidden');
            if (lockMessage) lockMessage.classList.add('hidden'); 
        } else {
            if (jobBox) jobBox.classList.add('hidden');
            if (applyBox) applyBox.classList.add('hidden');
            if (lockMessage) {
                lockMessage.innerHTML = "ℹ️ Freelancer Dashboard active. Click any active job card listing on the right to read details and apply.";
                lockMessage.classList.remove('hidden'); 
            }
        }
        applyFiltersAndRender();
        fetchAndRenderHistory();
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    if (toggleAuthBtn) {
        toggleAuthBtn.addEventListener('click', () => {
            if (authMode === 'signup') {
                authMode = 'login'; 
                authTitle.textContent = "Account Log In"; 
                authBtn.textContent = "Log In"; 
                if (accountTypeContainer) accountTypeContainer.classList.add('hidden');
            } else {
                authMode = 'signup'; 
                authTitle.textContent = "Create Marketplace Account"; 
                authBtn.textContent = "Sign Up"; 
                if (accountTypeContainer) accountTypeContainer.classList.remove('hidden');
            }
        });
    }
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (authStatus) { authStatus.style.color = "black"; authStatus.textContent = "Syncing profiles..."; }
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const selectedType = document.querySelector('input[name="accountType"]:checked').value;
            const targetEndpoint = authMode === 'signup' ? 'signup' : 'token?grant_type=password';

            try {
                const response = await fetch(`${SUPABASE_URL}/auth/v1/${targetEndpoint}`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.msg || payload.message || "Authentication details invalid.");

                currentUserSessionToken = payload.access_token;
                loggedInUserId = payload.user.id;
                loggedInUserEmail = payload.user.email;

                if (authMode === 'signup') {
                    await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
                        method: 'POST',
                        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: loggedInUserId, email: email, account_type: selectedType, credentials: 'Verified Professional', experience: 'Background bio parameters pending.' })
                    });
                    loggedInUserRole = selectedType;
                } else {
                    const roleResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${loggedInUserId}&select=account_type`, {
                        method: 'GET',
                        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}` }
                    });
                    const profileData = await roleResponse.json();
                    loggedInUserRole = (profileData && profileData.length > 0) ? profileData.account_type : 'freelancer';
                }

                localStorage.setItem('marketplace_token', currentUserSessionToken);
                localStorage.setItem('marketplace_userId', loggedInUserId);
                localStorage.setItem('marketplace_email', loggedInUserEmail);
                localStorage.setItem('marketplace_role', loggedInUserRole);

                if (authBox) authBox.classList.add('hidden');
                if (userDashboard) userDashboard.classList.remove('hidden');
                if (historyBox) historyBox.classList.remove('hidden');
                if (userProfileIcon) userProfileIcon.classList.remove('hidden');
                if (userEmailSpan) userEmailSpan.textContent = loggedInUserEmail;
                
                updateDashboardLayoutView();
                if (authStatus) authStatus.textContent = "";

            } catch (error) { 
                if (authStatus) { authStatus.style.color = "red"; authStatus.textContent = error.message; } 
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            currentUserSessionToken = null; loggedInUserId = null; loggedInUserEmail = null; loggedInUserRole = null; selectedJobId = null;
            if (authBox) authBox.classList.remove('hidden'); 
            if (userDashboard) userDashboard.classList.add('hidden'); 
            if (jobBox) jobBox.classList.add('hidden'); 
            if (applyBox) applyBox.classList.add('hidden'); 
            
            localStorage.removeItem('marketplace_token');
            localStorage.removeItem('marketplace_userId');
            localStorage.removeItem('marketplace_email');
            localStorage.removeItem('marketplace_role');
            
            if (historyBox) historyBox.classList.add('hidden');
            if (userProfileIcon) userProfileIcon.classList.add('hidden');
            if (authForm) authForm.reset(); 
            if (lockMessage) {
                lockMessage.classList.remove('hidden'); 
                lockMessage.innerHTML = `⚠️ Log in to unlock your dashboard choices. Click any active job on the right to view its details.`;
            }
            applyFiltersAndRender();
        });
    }

    if (jobForm) {
        jobForm.addEventListener('submit', async (e) => {  
            e.preventDefault();  
            if (formStatus) { formStatus.style.color = "black"; formStatus.textContent = "Publishing listing details to Supabase..."; }
            const title = document.getElementById('title').value;   
            const description = document.getElementById('description').value;   
            const budget = parseInt(document.getElementById('budget').value);
            const category = document.getElementById('category').value;

            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentUserSessionToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, description, budget, category, user_id: loggedInUserId })
                });
                if (!response.ok) throw new Error("Row insertion rejected");
                if (formStatus) { formStatus.style.color = "green"; formStatus.textContent = "Success! Your job listing is active."; }
                jobForm.reset();
                fetchAndRenderFeed();
                fetchAndRenderHistory();
            } catch (error) { 
                if (formStatus) { formStatus.style.color = "red"; formStatus.textContent = error.message; } 
            }
        });
    }

    // Fire application session check loop and feed parsing routines cleanly on load
    tryRestoreActiveSession();
    fetchAndRenderFeed();
}); // CLOSES DOMCONTENTLOADED WRAPPER BLOCK SAFELY
