import { db, auth } from '../firebase.js';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, query, where, getDocs, doc, setDoc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

onAuthStateChanged(auth, async (user) => {
	if (user) {
		await redirectAfterLogin(user.uid);
	}
});

// Password toggle functionality
const togglePasswordBtn = document.getElementById('toggle-login-password');
const passwordInput = document.getElementById('login-password');
const eyeIcon = document.getElementById('eye-icon');
const eyeOffIcon = document.getElementById('eye-off-icon');

if (togglePasswordBtn && passwordInput && eyeIcon && eyeOffIcon) {
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        
        // Toggle icons
        if (type === 'password') {
            eyeIcon.style.display = 'block';
            eyeOffIcon.style.display = 'none';
        } else {
            eyeIcon.style.display = 'none';
            eyeOffIcon.style.display = 'block';
        }
    });
}

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

// Google Sign-In
const googleSignInBtn = document.getElementById('google-signin-btn');
if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
        const errorDiv = document.getElementById('login-error');
        errorDiv.classList.add('hidden');
        
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // Check if user document exists, if not create one
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (!userDoc.exists()) {
                // Create user document for new Google sign-in users
                await setDoc(userDocRef, {
                    name: user.displayName || 'User',
                    email: user.email,
                    photoURL: user.photoURL || null,
                    createdAt: serverTimestamp(),
                    authProvider: 'google'
                });
            }
            
            await redirectAfterLogin(user.uid);
        } catch (error) {
            console.error('Google Sign-In error:', error);
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                errorDiv.textContent = 'Failed to sign in with Google. Please try again.';
                errorDiv.classList.remove('hidden');
            }
        }
    });
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
