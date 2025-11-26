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
    deleteDoc,
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
                statusDiv.textContent = 'Uploading...';
                statusDiv.style.color = 'var(--primary-color)';
                profileUploadBtn.disabled = true;
                
                // Upload to Cloudinary (same as mobile)
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', 'jtgeeyis');
                
                const response = await fetch('https://api.cloudinary.com/v1_1/dow1tbstn/image/upload', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) throw new Error('Upload failed');
                
                const data = await response.json();
                urlInput.value = data.secure_url;
                
                statusDiv.textContent = '✓ Image uploaded successfully!';
                statusDiv.style.color = 'green';
                
                setTimeout(() => {
                    statusDiv.textContent = '';
                }, 3000);
            } catch (error) {
                console.error('Upload error:', error);
                statusDiv.textContent = '✗ Upload failed. Please try again.';
                statusDiv.style.color = 'red';
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
const editProfileBtn = document.getElementById('edit-profile-btn');
if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
        const form = document.getElementById('edit-profile-form');
        if (form) {
            form.classList.toggle('hidden');
            console.log('Edit profile form toggled:', form.classList.contains('hidden') ? 'hidden' : 'shown');
        }
    });
}

// Change Password Button
document.getElementById('change-password-btn')?.addEventListener('click', () => {
    showChangePasswordModal();
});

// Show Change Password Modal
function showChangePasswordModal() {
    const user = auth.currentUser;
    const isGoogleUser = user?.providerData?.some(provider => provider.providerId === 'google.com');
    
    const modalHTML = `
        <div id="change-password-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="if(event.target.id==='change-password-modal') this.remove();">
            <div style="background: white; padding: 2rem; border-radius: 12px; max-width: 450px; width: 90%;" onclick="event.stopPropagation();">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h2 style="margin: 0; color: var(--text-dark);">${isGoogleUser ? 'Set Password' : 'Change Password'}</h2>
                    <button onclick="document.getElementById('change-password-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-light);">&times;</button>
                </div>
                
                ${isGoogleUser ? `
                    <div style="padding: 0.75rem; background: #e7f3ff; border-left: 4px solid #2196F3; margin-bottom: 1rem; border-radius: 4px;">
                        <p style="margin: 0; font-size: 0.9rem; color: #1976D2;">
                            <strong>Note:</strong> You signed in with Google. Set a password to enable email/password login.
                        </p>
                    </div>
                ` : ''}
                
                <form id="user-change-password-form">
                    ${!isGoogleUser ? `
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Current Password</label>
                            <input type="password" id="user-current-password" required style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                    ` : ''}
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">New Password</label>
                        <input type="password" id="user-new-password" required minlength="6" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Confirm New Password</label>
                        <input type="password" id="user-confirm-password" required minlength="6" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                    </div>
                    <div id="user-password-message" style="margin-bottom: 1rem; display: none; padding: 0.75rem; border-radius: 4px;"></div>
                    <button type="submit" class="btn btn-primary" style="width: 100%; margin-bottom: 0.5rem;">${isGoogleUser ? 'Set Password' : 'Update Password'}</button>
                    <button type="button" onclick="document.getElementById('change-password-modal').remove()" class="btn btn-secondary" style="width: 100%;">Cancel</button>
                </form>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('change-password-modal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Setup form handler
    document.getElementById('user-change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changeUserPassword();
    });
}

// Change User Password
async function changeUserPassword() {
    const user = auth.currentUser;
    const isGoogleUser = user?.providerData?.some(provider => provider.providerId === 'google.com');
    
    const currentPasswordInput = document.getElementById('user-current-password');
    const currentPassword = currentPasswordInput ? currentPasswordInput.value : null;
    const newPassword = document.getElementById('user-new-password').value;
    const confirmPassword = document.getElementById('user-confirm-password').value;
    const messageDiv = document.getElementById('user-password-message');
    
    // Validation
    if (newPassword !== confirmPassword) {
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#fee';
        messageDiv.style.color = 'red';
        messageDiv.textContent = 'New passwords do not match!';
        return;
    }
    
    if (newPassword.length < 6) {
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#fee';
        messageDiv.style.color = 'red';
        messageDiv.textContent = 'Password must be at least 6 characters!';
        return;
    }
    
    try {
        // Import required functions
        const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        // For Google users, directly set password (no re-authentication needed)
        if (isGoogleUser) {
            await updatePassword(user, newPassword);
            
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#efe';
            messageDiv.style.color = 'green';
            messageDiv.textContent = 'Password set successfully! You can now login with email/password.';
        } else {
            // For email/password users, re-authenticate first
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            
            // Update password
            await updatePassword(user, newPassword);
            
            messageDiv.style.display = 'block';
            messageDiv.style.background = '#efe';
            messageDiv.style.color = 'green';
            messageDiv.textContent = 'Password updated successfully!';
        }
        
        // Clear form
        document.getElementById('user-change-password-form').reset();
        
        // Close modal after 2 seconds
        setTimeout(() => {
            document.getElementById('change-password-modal').remove();
        }, 2000);
        
    } catch (error) {
        console.error('Password change error:', error);
        messageDiv.style.display = 'block';
        messageDiv.style.background = '#fee';
        messageDiv.style.color = 'red';
        
        if (error.code === 'auth/wrong-password') {
            messageDiv.textContent = 'Current password is incorrect!';
        } else if (error.code === 'auth/weak-password') {
            messageDiv.textContent = 'New password is too weak!';
        } else if (error.code === 'auth/requires-recent-login') {
            messageDiv.textContent = 'Please logout and login again before setting password.';
        } else {
            messageDiv.textContent = 'Failed to update password. Please try again.';
        }
    }
}

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
        if (typeof loadMyBookings === 'function') {
            await loadMyBookings();
        }
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
                <div class="card" style="position: relative; margin-bottom: 1.5rem;">
                    <button onclick="deleteSavedPlan('${docSnap.id}')" style="position: absolute; top: 10px; right: 10px; background: #ff4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.3s;" onmouseover="this.style.background='#cc0000'; this.style.transform='scale(1.1)'" onmouseout="this.style.background='#ff4444'; this.style.transform='scale(1)'" title="Delete">🗑️</button>
                    <div class="card-content">
                        <h3 class="card-title">${escapeHtml(plan.departure || 'Your Location')} → ${escapeHtml(plan.destination || 'Trip Plan')}</h3>
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
                    departure: savedPlan.departure,
                    destination: savedPlan.destination,
                    startDate: savedPlan.startDate,
                    endDate: savedPlan.endDate,
                    numberOfPeople: savedPlan.numberOfPeople,
                    budget: savedPlan.budget
                };
                formattedContent = formatStructuredPlan(savedPlan.planData, formData);
                // Remove the Save Trip button since this is already a saved plan
                formattedContent = formattedContent.replace(/<div style="text-align: center; margin-top: 3rem;[^>]*>.*?onclick="savePlan\(\)"[^>]*>.*?<\/button>.*?<\/div>/s, '');
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
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
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
                        --white: #ffffff;
                        --shadow: 0 8px 20px rgba(0,0,0,0.05);
                        --shadow-hover: 0 12px 30px rgba(0,0,0,0.1);
                        --primary-gradient: linear-gradient(135deg, #006734 0%, #004d26 100%);
                    }
                    body { 
                        font-family: 'Outfit', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        margin: 0;
                        padding: 0;
                        background: #f9f9f9;
                        line-height: 1.6;
                        color: #333;
                    }
                    .plan-container {
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 2rem;
                    }
                    .plan-section {
                        margin-bottom: 3rem;
                        animation: fadeIn 0.8s ease-out;
                    }
                    .section-title {
                        display: flex;
                        align-items: center;
                        gap: 1rem;
                        margin-bottom: 2rem;
                        font-size: 1.8rem;
                        font-weight: 700;
                        background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary-light) 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                    }
                    .glass-panel {
                        background: rgba(255, 255, 255, 0.7);
                        backdrop-filter: blur(10px);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 24px;
                        box-shadow: var(--shadow);
                    }
                    .card {
                        background: white;
                        border-radius: 16px;
                        padding: 1.5rem;
                        box-shadow: var(--shadow);
                        transition: all 0.3s ease;
                        border: 1px solid rgba(0,0,0,0.05);
                    }
                    .card:hover {
                        box-shadow: var(--shadow-hover);
                        transform: translateY(-2px);
                    }
                    .card-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                        gap: 2rem;
                    }
                    .card-image-wrapper {
                        width: 100%;
                        height: 200px;
                        overflow: hidden;
                        background: #f0f4f2;
                        border-radius: 12px 12px 0 0;
                        margin: -1.5rem -1.5rem 1rem -1.5rem;
                    }
                    .card-image {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        display: block;
                    }
                    .card-content {
                        padding: 0;
                    }
                    .card-title {
                        font-size: 1.3rem;
                        font-weight: 700;
                        color: var(--primary-dark);
                        margin-bottom: 1rem;
                    }
                    .card-text {
                        color: var(--text-dark);
                        line-height: 1.6;
                        margin-bottom: 0.5rem;
                    }
                    .btn {
                        display: inline-block;
                        padding: 0.75rem 2rem;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 1rem;
                        font-weight: 600;
                        transition: all 0.3s ease;
                        font-family: 'Outfit', sans-serif;
                    }
                    .btn-primary {
                        background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
                        color: white;
                        box-shadow: 0 4px 15px rgba(0, 103, 52, 0.3);
                    }
                    .btn-primary:hover {
                        background: linear-gradient(135deg, var(--primary-dark) 0%, #003d1f 100%);
                        transform: translateY(-2px);
                        box-shadow: 0 6px 25px rgba(0, 103, 52, 0.4);
                    }
                    .uniform-cards {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                        gap: 2rem;
                    }
                    .card-grid.uniform-cards .card {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                    }
                    .card-grid.uniform-cards .card-image-wrapper {
                        margin: -1.5rem -1.5rem 1rem -1.5rem;
                        flex-shrink: 0;
                    }
                    .card-grid.uniform-cards .card-content {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @media print {
                        .no-print { display: none !important; }
                        body { background: white; }
                        .card { page-break-inside: avoid; }
                    }
                </style>
            </head>
            <body>
                <div style="padding: 2rem 1rem; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 2rem;" class="no-print">
                    <button onclick="window.print()" style="padding: 0.75rem 2rem; background: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: 600;">Print Plan</button>
                    <button onclick="window.close()" style="padding: 0.75rem 2rem; background: #666; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1rem; font-weight: 600; margin-left: 1rem;">Close</button>
                </div>
                ${formattedContent}
                <script>
                    // Load attraction images after page loads
                    window.addEventListener('load', function() {
                        const attractionImages = document.querySelectorAll('[id^="attraction-img-"]');
                        attractionImages.forEach(img => {
                            // Replace placeholder SVG with actual image
                            img.src = 'assets/attraction.jpg';
                            img.onerror = function() {
                                // Fallback if image not found
                                this.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22250%22%3E%3Crect fill=%22%23f0f4f2%22 width=%22400%22 height=%22250%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2224%22 fill=%22%23006734%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 font-family=%22sans-serif%22 font-weight=%22bold%22%3EAttraction%3C/text%3E%3C/svg%3E';
                            };
                        });
                    });
                </script>
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