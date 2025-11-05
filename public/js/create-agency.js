import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Check if user is logged in
onAuthStateChanged(auth, (user) => {
    if (!user) {
        alert('Please login to create an agency');
        window.location.href = 'profile.html';
        return;
    }
    
    const profileLink = document.getElementById('profile-link');
    profileLink.textContent = 'Profile';
    
    // Check if user already has an agency
    checkExistingAgency(user.uid);
});

async function checkExistingAgency(userId) {
    try {
        const agenciesRef = collection(db, 'agencies');
        const q = query(agenciesRef, where('ownerId', '==', userId));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            document.getElementById('create-agency-form').innerHTML = `
                <div class="alert alert-success">
                    <h3>You already have an agency!</h3>
                    <p>Go to your dashboard to manage your agency and add trips.</p>
                    <a href="agency-dashboard.html" class="btn btn-primary" style="margin-top: 1rem;">Go to Dashboard</a>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error checking existing agency:', error);
    }
}

document.getElementById('create-agency-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
        alert('Please login to create an agency');
        window.location.href = 'profile.html';
        return;
    }

    const errorDiv = document.getElementById('agency-error');
    const successDiv = document.getElementById('agency-success');
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Check if user already has an agency
    try {
        const agenciesRef = collection(db, 'agencies');
        const q = query(agenciesRef, where('ownerId', '==', user.uid));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            errorDiv.textContent = 'You already have an agency. Go to your dashboard to manage it.';
            errorDiv.classList.remove('hidden');
            return;
        }
    } catch (error) {
        console.error('Error checking agency:', error);
    }

    const agencyData = {
        name: document.getElementById('agency-name').value.trim(),
        location: document.getElementById('agency-location').value.trim(),
        email: document.getElementById('agency-email').value.trim(),
        phone: document.getElementById('agency-phone').value.trim(),
        description: document.getElementById('agency-description').value.trim(),
        ownerId: user.uid,
        averageRating: 0,
        ratingCount: 0,
        createdAt: serverTimestamp()
    };

    try {
        // Create agency
        const agencyDocRef = await addDoc(collection(db, 'agencies'), agencyData);
        const agencyId = agencyDocRef.id;

        // Upsert user document to set userType to AGENCY (create if missing)
        const userDocRef = doc(db, 'users', user.uid);
        await updateDoc(userDocRef, {
            userType: 'AGENCY',
            agencyId: agencyId
        }).catch(async () => {
            // If user document doesn't exist, create it
            await setDoc(userDocRef, {
                id: user.uid,
                name: user.displayName || 'User',
                email: user.email || '',
                userType: 'AGENCY',
                agencyId: agencyId,
                createdAt: serverTimestamp()
            });
        });

        successDiv.innerHTML = `
            <h3>Agency created successfully!</h3>
            <p>Your travel agency has been created. You can now add trips to your agency.</p>
            <a href="agency-dashboard.html" class="btn btn-primary" style="margin-top: 1rem;">Go to Dashboard</a>
        `;
        successDiv.classList.remove('hidden');

        // Reset form
        document.getElementById('create-agency-form').reset();
    } catch (error) {
        console.error('Error creating agency:', error);
        errorDiv.textContent = 'Failed to create agency: ' + error.message;
        errorDiv.classList.remove('hidden');
    }
});

