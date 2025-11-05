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


// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        alert('Logged out successfully!');
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error logging out: ' + error.message);
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
            imageUrl: document.getElementById('edit-image-url').value.trim() || null,
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
        document.getElementById('edit-image-url').value = userData.imageUrl || '';

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

        const plan = planDoc.data();
        const formattedPlan = escapeHtml(plan.plan).replace(/\n/g, '<br>');

        const newWindow = window.open('', '_blank');
        newWindow.document.write(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Saved Trip Plan - ${escapeHtml(plan.destination)}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
                    h1 { color: #006734; border-bottom: 2px solid #006734; padding-bottom: 0.5rem; }
                    .info { margin: 1rem 0; }
                    .info strong { display: inline-block; width: 120px; }
                    hr { margin: 2rem 0; border: 1px solid #eee; }
                </style>
            </head>
            <body>
                <h1>Trip Plan: ${escapeHtml(plan.destination)}</h1>
                <div class="info"><strong>Duration:</strong> ${escapeHtml(plan.startDate)} to ${escapeHtml(plan.endDate)}</div>
                <div class="info"><strong>Travelers:</strong> ${plan.numberOfPeople}</div>
                <div class="info"><strong>Budget:</strong> ${escapeHtml(plan.budget)}</div>
                <hr>
                <div>${formattedPlan}</div>
            </body>
            </html>
        `);
        newWindow.document.close();
    } catch (error) {
        console.error('Error viewing plan:', error);
        alert('Failed to load plan.');
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