// 1. CLOUD CONFIGURATION (REAL ENCRYPTED URL ENDPOINTS)
const SUPABASE_URL = "https://brooyrbsllnlsqtgohtg.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_PZi69pAWccthnk2-owPv1Q_EQQlpEcD";

// Recover secure access data objects passed from the primary board workspace view via localStorage
const sessionToken = localStorage.getItem('marketplace_token');
const userId = localStorage.getItem('marketplace_userId');
const userEmail = localStorage.getItem('marketplace_email');
const userRole = localStorage.getItem('marketplace_role');

// PORTAL GATEWAY PROTECTION LAYER: Instantly bounce log entries to login screens if state is empty
if (!sessionToken || !userId) {
    alert("Session data missing or expired. Re-routing to secure validation portal gateway.");
    window.location.href = "index.html";
}

document.addEventListener('DOMContentLoaded', () => {
    const profViewEmail = document.getElementById('profViewEmail');
    const profViewRole = document.getElementById('profViewRole');
    const profViewRating = document.getElementById('profViewRating');
    const credentialsInput = document.getElementById('profileCredentialsInput');
    const experienceInput = document.getElementById('profileExperienceInput');
    const profileEditForm = document.getElementById('profileEditForm');
    const profileStatusMsg = document.getElementById('profileStatusMsg');
    const reviewsContainer = document.getElementById('profileReviewsContainer');

    // POPULATE LOCAL PROFILE DATA INSTANTLY
    if (profViewEmail) profViewEmail.textContent = userEmail;
    if (profViewRole) profViewRole.textContent = userRole === 'client' ? 'Client (Employer)' : 'Freelancer (Coach)';

        // BACKEND CLOUD DIRECT FLOW RECORD CONSUMERS
    async function fetchAndPopulateProfileData() {
        try {
            // 1. Fetch profile data rows matching logged in User ID string token 
            const profResponse = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
                method: 'GET',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${sessionToken}` }
            });
            const profData = await profResponse.json();
            
            if (profData && profData.length > 0) {
                const targetProfile = profData[0]; // Extract the precise row object
                if (credentialsInput) credentialsInput.value = targetProfile.credentials || "";
                if (experienceInput) experienceInput.value = targetProfile.experience || "";
            }

            // 2. FIXED RELATIONAL COUPLING PIPELINE: Fetch feedback reviews cleanly via independent queries
            const revResponse = await fetch(`${SUPABASE_URL}/rest/v1/reviews?recipient_id=eq.${userId}`, {
                method: 'GET',
                headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${sessionToken}` }
            });
            
            // Safety structural evaluation check block
            if (!revResponse.ok) {
                console.warn(`Reviews logging table query bypass state active: Server code ${revResponse.status}`);
                if (reviewsContainer) reviewsContainer.innerHTML = `<p style="color: #888; font-style: italic; text-align: center; padding: 15px;">No client references logged for this account yet.</p>`;
                if (profViewRating) profViewRating.textContent = "⭐ Unrated (New Account)";
                return;
            }

            const reviewsList = await revResponse.json();

            // FIXED PROTECTION: Guaranteeing reviewsList compiles as an iterable data array matrix
            if (!reviewsList || !Array.isArray(reviewsList) || reviewsList.length === 0) {
                if (reviewsContainer) reviewsContainer.innerHTML = `<p style="color: #888; font-style: italic; text-align: center; padding: 15px;">No client references logged for this account yet.</p>`;
                if (profViewRating) profViewRating.textContent = "⭐ Unrated (New Account)";
                return;
            }

            // Iterate and map stars calculation parameters safely
            let totalRatingScore = 0;
            reviewsList.forEach(r => totalRatingScore += parseFloat(r.rating_score || 0));
            const scoreAverage = (totalRatingScore / reviewsList.length).toFixed(1);
            if (profViewRating) profViewRating.textContent = `⭐ ${scoreAverage} / 5.0 (${reviewsList.length} global entries)`;

            // Inject historical review records templates dynamically
            if (reviewsContainer) {
                reviewsContainer.innerHTML = reviewsList.map(r => `
                    <div class="history-item" style="border-left: 4px solid #ffc107; background: #fffdf9;">
                        <div style="font-weight: bold; color: #ffc107; font-size: 0.95rem; margin-bottom: 4px;">
                            ${'⭐'.repeat(Math.round(r.rating_score || 5))} (${r.rating_score || 5}/5)
                        </div>
                        <div style="color: #444; font-style: italic; line-height:1.4;">"${escapeHTML(r.comment_text)}"</div>
                        <div style="font-size: 0.75rem; color: #888; margin-top: 6px; text-align: right;">
                            Assignment Logged: ${new Date(r.created_at).toLocaleDateString()}
                        </div>
                    </div>
                `).join('');
            }

        } catch (err) {
            console.error("Cloud synchronizer tracking error loop closure warning:", err);
        }
    }


    // SECURE DATA RE-WRITE ENGINE SUBMISSIONS
    if (profileEditForm) {
        profileEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (profileStatusMsg) {
                profileStatusMsg.style.color = "black";
                profileStatusMsg.textContent = "Writing parameters to Supabase Cloud infrastructure...";
            }

            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
                    method: 'PATCH',
                    headers: { 
                        'apikey': SUPABASE_ANON_KEY, 
                        'Authorization': `Bearer ${sessionToken}`, 
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({ 
                        credentials: credentialsInput.value.trim(), 
                        experience: experienceInput.value.trim() 
                    })
                });

                if (!response.ok) throw new Error(`Write operation failed with status ${response.status}`);

                if (profileStatusMsg) {
                    profileStatusMsg.style.color = "green";
                    profileStatusMsg.textContent = "Success! Professional biography records active.";
                    setTimeout(() => { profileStatusMsg.textContent = ""; }, 3000);
                }

            } catch (error) {
                if (profileStatusMsg) {
                    profileStatusMsg.style.color = "red";
                    profileStatusMsg.textContent = `Sync Error: ${error.message}`;
                }
            }
        });
    }

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    // Execute application script startup routine
    fetchAndPopulateProfileData();
});
