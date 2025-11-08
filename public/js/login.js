import { db, auth } from '../firebase.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

onAuthStateChanged(auth, async (user) => {
	if (user) {
		await redirectAfterLogin(user.uid);
	}
});

document.getElementById('login-form-element').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = document.getElementById('login-error');
    errorDiv.classList.add('hidden');

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
		const cred = await signInWithEmailAndPassword(auth, email, password);
		await redirectAfterLogin(cred.user.uid);
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = getFirebaseErrorMessage(error) || 'Failed to login. Please check your credentials.';
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
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        default:
            return null;
    }
}

async function redirectAfterLogin(userId) {
	try {
		// Check if user is admin
		const user = auth.currentUser;
		if (user && user.email === 'admin@gmail.com') {
			window.location.href = 'admin-panel.html';
			return;
		}
		
		// Check if user has agency
		const agenciesRef = collection(db, 'agencies');
		const q = query(agenciesRef, where('ownerId', '==', userId));
		const snapshot = await getDocs(q);
		if (!snapshot.empty) {
			window.location.href = 'agency-dashboard.html';
			return;
		}
		
		// Regular user without agency
		window.location.href = 'index.html';
	} catch (e) {
		console.error('Redirect error:', e);
		window.location.href = 'index.html';
	}
}
