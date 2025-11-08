import { db, auth } from '../firebase.js';
import {
    createUserWithEmailAndPassword,
    updateProfile,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc,
    setDoc,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

onAuthStateChanged(auth, (user) => {
    if (user) {
        // Check if admin
        if (user.email === 'admin@gmail.com') {
            window.location.href = 'admin-panel.html';
        } else {
            window.location.href = 'index.html';
        }
    }
});

document.getElementById('signup-form-element').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('signup-error');
    errorDiv.classList.add('hidden');

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;

    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });

        const userDoc = {
            id: userCredential.user.uid,
            name: name,
            email: email,
            imageUrl: null,
            phone: null,
            bio: null,
            city: null,
            userType: 'USER',
            activeRole: 'TRAVELER',
            roles: ['TRAVELER'],
            createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', userCredential.user.uid), userDoc);
        window.location.href = 'profile.html';
    } catch (error) {
        console.error('Signup error:', error);
        errorDiv.textContent = getFirebaseErrorMessage(error) || 'Failed to create account. Please try again.';
        errorDiv.classList.remove('hidden');
    }
});

function getFirebaseErrorMessage(error) {
    const code = error.code;
    switch (code) {
        case 'auth/email-already-in-use':
            return 'This email is already registered. Please log in.';
        case 'auth/weak-password':
            return 'Password is too weak.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        default:
            return null;
    }
}
