import { db, auth } from '../firebase.js';
import {
    signOut,
    onAuthStateChanged,
    updateProfile as updateAuthProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { formatStructuredPlan } from './plan-trip.js';

// Cloudinary Upload Handler for Profile
const profileUploadBtn = document.getElementById('profile-upload-btn');
if (profileUploadBtn) {
    profileUploadBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (file.size > 10 * 1024 * 1024) {
                alert('Image size should be less than 10MB');
                return;
            }
            
            const statusDiv = document.getElementById('profile-upload-status');
            const urlInput = document.getElementById('profile-image-url');
            
            try {
                statusDiv.textContent = 'Processing...';
                statusDiv.style.color = 'var(--primary-color)';
                profileUploadBtn.disabled = true;
                
                // Convert to base64 for mobile compatibility
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const base64String = event.target.result;
                    urlInput.value = base64String;
                    
                    statusDiv.textContent = '✓ Image ready!';
                    statusDiv.style.color = 'green';
                    
                    setTimeout(() => {
                        statusDiv.textContent = '';
                    }, 3000);
                };
                reader.readAsDataURL(file);
            } finally {
                profileUploadBtn.disabled = false;
            }
        };
        
        input.click();
    });
}

// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        alert('Logout failed: ' + error.message);
    }
});

// Edit Profile Button
document.getElementById('edit-profile-btn')?.addEventListener('click', () => {
    const form = document.getElementById('edit-profile-form');
    form.classList.toggle('hidden');
});

// Cancel Edit
document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
    document.getElementById('edit-profile-form').classList.add('hidden');
});

// Update Profile Form Submit
document.getElementById('update-profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('update-error');
    errorDiv.classList.add('hidden');
    
    const user = auth.currentUser;
    if (!user) {
        alert('You must be logged in to update profile.');
        return;
    }
    
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = {
            name: document.getElementById('edit-name').value.trim(),
            city: document.getElementById('edit-city').value.trim() || null,
            phone: document.getElementById('edit-phone').value.trim() || null,
            bio: document.getElementById('edit-bio').value.trim() || null,
            imageUrl: document.getElementById('profile-image-url').value.trim() || null,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(userDocRef, userDoc);
        await updateAuthProfile(user, { displayName: userDoc.name });
        
        document.getElementById('edit-profile-form').classList.add('hidden');
        await loadUserProfile();
        alert('Profile updated successfully!');
    } catch (error) {
        console.error('Update profile error:', error);
        errorDiv.textContent = error.message || 'Failed to update profile.';
        errorDiv.classList.remove('hidden');
    }
});

// Load user profile from Firestore
async function loadUserProfile() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        // Default state: show Create, hide Dashboard (avoid flash)
        const defaultCreateBtn = document.getElementById('create-agency-btn');
        const defaultDashboardBtn = document.getElementById('agency-dashboard-btn');
        defaultCreateBtn?.classList.remove('hidden');
        defaultDashboardBtn?.classList.add('hidden');

        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        // Build user data source (fallback to auth info if Firestore doc missing)
        let userData = userDocSnap.exists() ? userDocSnap.data() : {
            id: user.uid,
            name: user.displayName || 'User',
            email: user.email || '',
            imageUrl: null,
            phone: null,
            bio: null,
            city: null,
            userType: 'USER'
        };

        // If doc missing, upsert a minimal user document so subsequent features work
        if (!userDocSnap.exists()) {
            try {
                await setDoc(userDocRef, userData, { merge: true });
            } catch (e) {
                console.warn('Could not upsert minimal user profile:', e);
            }
        }

        // Update profile display
        document.getElementById('profile-name').textContent = userData.name || user.displayName || 'User';
        document.getElementById('profile-email').textContent = userData.email || user.email || '-';
        document.getElementById('profile-city').textContent = userData.city || '-';
        document.getElementById('profile-phone').textContent = userData.phone || '-';
        document.getElementById('profile-bio').textContent = userData.bio || '-';

        const avatar = document.getElementById('profile-avatar');
        if (userData.imageUrl) {
            avatar.src = userData.imageUrl;
        } else {
            avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name || 'User')}&background=006734&color=fff&size=120`;
        }

        // Populate edit form
        document.getElementById('edit-name').value = userData.name || '';
        document.getElementById('edit-email').value = userData.email || user.email || '';
        document.getElementById('edit-city').value = userData.city || '';
        document.getElementById('edit-phone').value = userData.phone || '';
        document.getElementById('edit-bio').value = userData.bio || '';
        
        // Populate image URL if exists
        const profileImageUrlInput = document.getElementById('profile-image-url');
        if (profileImageUrlInput && userData.imageUrl) {
            profileImageUrlInput.value = userData.imageUrl;
        }

        // Check if user owns an agency and toggle buttons accordingly
        const agenciesRef = collection(db, 'agencies');
        const q = query(agenciesRef, where('ownerId', '==', user.uid));
        const querySnapshot = await getDocs(q);

        const createAgencyBtn = document.getElementById('create-agency-btn');
        const agencyDashboardBtn = document.getElementById('agency-dashboard-btn');

        if (!querySnapshot.empty) {
            agencyDashboardBtn?.classList.remove('hidden');
            createAgencyBtn?.classList.add('hidden');
        } else {
            createAgencyBtn?.classList.remove('hidden');
            agencyDashboardBtn?.classList.add('hidden');
        }
        
        await loadSavedPlans();
        await loadMyBookings();
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Load Saved Trip Plans
async function loadSavedPlans() {
    const user = auth.currentUser;
    if (!user) return;
    
    const container = document.getElementById('saved-plans-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading saved plans...</p></div>';
    
    try {
        const savedPlansRef = collection(db, 'savedPlans');
        const q = query(savedPlansRef, where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-light);">No saved plans yet. Generate a plan and save it!</p>';
            return;
        }
        
        container.innerHTML = querySnapshot.docs.map(docSnap => {
            const plan = docSnap.data();
            return `
                <div class="card">
                    <div class="card-content">
                        <h3 class="card-title">${escapeHtml(plan.destination || 'Trip Plan')}</h3>
                        <p class="card-text"><strong>Duration:</strong> ${escapeHtml(plan.startDate)} to ${escapeHtml(plan.endDate)}</p>
                        <p class="card-text"><strong>Travelers:</strong> ${plan.numberOfPeople}</p>
                        <p class="card-text"><strong>Budget:</strong> ${escapeHtml(plan.budget)}</p>
                        <button class="btn btn-primary" onclick="viewSavedPlan('${docSnap.id}')">View Plan</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading saved plans:', error);
        container.innerHTML = '<p style="text-align:center;color:red;">Error loading saved plans.</p>';
    }
}

// Load My Bookings
async function loadMyBookings() {
    const user = auth.currentUser;
    if (!user) return;
    
    const container = document.getElementById('my-bookings-container');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading bookings...</p></div>';

    try {
        const bookingsRef = collection(db, 'bookings');
        const q = query(bookingsRef, where('userId', '==', user.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-light);">No bookings yet.</p>';
            return;
        }

        const cards = await Promise.all(snapshot.docs.map(async (docSnap) => {
            const b = docSnap.data();
            const tripSnap = await getDoc(doc(db, 'trips', b.tripId));
            const trip = tripSnap.exists() ? tripSnap.data() : {};

            const dateStr = trip.date 
                ? (typeof trip.date.toDate === 'function' ? trip.date.toDate().toLocaleDateString() : trip.date)
                : 'N/A';

            const bookedOn = b.createdAt 
                ? (b.createdAt.toDate ? b.createdAt.toDate().toLocaleString() : '')
                : '';

            return `
                <div class="card">
                    <div class="card-content">
                        <h3 class="card-title">${escapeHtml(trip.description || 'Trip')}</h3>
                        <p class="card-text"><strong>Destination:</strong> ${escapeHtml(trip.location || 'N/A')}</p>
                        <p class="card-text"><strong>Date:</strong> ${dateStr}</p>
                        <p class="card-text"><strong>Seats:</strong> ${b.seatsBooked}</p>
                        <p class="card-text"><strong>Your Location:</strong> ${escapeHtml(b.userLocation || '-')}</p>
                        <p class="card-text"><strong>Booked On:</strong> ${bookedOn}</p>
                    </div>
                </div>
            `;
        }));

        container.innerHTML = cards.join('');
    } catch (e) {
        console.error('Error loading bookings:', e);
        container.innerHTML = '<p style="text-align:center;color:red;">Error loading bookings.</p>';
    }
}

// View Saved Plan in New Tab
window.viewSavedPlan = async function(planId) {
    try {
        const planDoc = await getDoc(doc(db, 'savedPlans', planId));
        if (!planDoc.exists()) {
            alert('Plan not found.');
            return;
        }

        const savedPlan = planDoc.data();
        
        // Check if we have structured planData
        let formattedContent;
        if (savedPlan.planData) {
            // Use the same beautiful format
            try {
                const formData = {
                    destination: savedPlan.destination,
                    startDate: savedPlan.startDate,
                    endDate: savedPlan.endDate,
                    numberOfPeople: savedPlan.numberOfPeople,
                    budget: savedPlan.budget
                };
                formattedContent = formatStructuredPlan(savedPlan.planData, formData);
            } catch (formatError) {
                console.error('Error formatting plan:', formatError);
                alert('Error displaying plan. Please try again.');
                return;
            }
        } else {
            // Fallback for old text-based plans
            formattedContent = `
                <div style="padding: 2rem; max-width: 800px; margin: 0 auto;">
                    <h1 style="color: #006734;">Trip Plan: ${escapeHtml(savedPlan.destination)}</h1>
                    <div style="margin: 1rem 0;"><strong>Duration:</strong> ${escapeHtml(savedPlan.startDate)} to ${escapeHtml(savedPlan.endDate)}</div>
                    <div style="margin: 1rem 0;"><strong>Travelers:</strong> ${savedPlan.numberOfPeople}</div>
                    <div style="margin: 1rem 0;"><strong>Budget:</strong> ${escapeHtml(savedPlan.budget)}</div>
                    <hr style="margin: 2rem 0;">
                    <div>${escapeHtml(savedPlan.plan || '').replace(/\n/g, '<br>')}</div>
                </div>
            `;
        }

        const newWindow = window.open('', '_blank');
        newWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Saved Trip Plan - ${escapeHtml(savedPlan.destination)}</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    :root {
                        --primary-color: #006734;
                        --primary-dark: #004d26;
                        --primary-light: #008045;
                        --text-dark: #333;
                        --text-light: #666;
                    }
                    body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        margin: 0;
                        padding: 0;
                        background: #f9f9f9;
                        line-height: 1.6;
                        color: #333;
                    }
                    .btn {
                        display: inline-block;
                        padding: 0.75rem 2rem;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 600;
                        transition: all 0.3s ease;
                    }
                    .btn-primary {
                        background: var(--primary-color);
                        color: white;
                    }
                    .btn-primary:hover {
                        background: var(--primary-dark);
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0,103,52,0.3);
                    }
                    @media print {
                        .no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div style="padding: 2rem 1rem; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 2rem;" class="no-print">
                    <button onclick="window.print()" style="padding: 0.75rem 2rem; background: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: 600;">Print Plan</button>
                    <button onclick="window.close()" style="padding: 0.75rem 2rem; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: 600; margin-left: 1rem;">Close</button>
                </div>
                ${formattedContent}
            </body>
            </html>
        `);
        newWindow.document.close();
    } catch (error) {
        alert('Failed to load plan: ' + error.message);
    }
};

// Simple HTML escape to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Agency Buttons
document.getElementById('create-agency-btn')?.addEventListener('click', () => {
    window.location.href = 'create-agency.html';
});

document.getElementById('agency-dashboard-btn')?.addEventListener('click', () => {
    window.location.href = 'agency-dashboard.html';
});

// Auth State Listener
let authCheckComplete = false;

onAuthStateChanged(auth, (user) => {
    if (!authCheckComplete) {
        authCheckComplete = true;

        if (user) {
            loadUserProfile();
        } else {
            window.location.href = 'login.html';
        }
    }
});