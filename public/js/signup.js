import { db, auth } from '../firebase.js';
import {
    createUserWithEmailAndPassword,
    updateProfile,
    signInWithPopup,
    GoogleAuthProvider,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    doc,
    setDoc,
    getDoc,
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

// Password toggle functionality for signup password
const toggleSignupPassword = document.getElementById('toggle-signup-password');
const signupPasswordInput = document.getElementById('signup-password');
const eyeIconSignup = document.querySelector('.eye-icon-signup');
const eyeOffIconSignup = document.querySelector('.eye-off-icon-signup');

if (toggleSignupPassword && signupPasswordInput && eyeIconSignup && eyeOffIconSignup) {
    toggleSignupPassword.addEventListener('click', () => {
        const type = signupPasswordInput.type === 'password' ? 'text' : 'password';
        signupPasswordInput.type = type;
        
        // Toggle icons
        if (type === 'password') {
            eyeIconSignup.style.display = 'block';
            eyeOffIconSignup.style.display = 'none';
        } else {
            eyeIconSignup.style.display = 'none';
            eyeOffIconSignup.style.display = 'block';
        }
    });
}

// Password toggle functionality for confirm password
const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
const confirmPasswordInput = document.getElementById('signup-confirm-password');
const eyeIconConfirm = document.querySelector('.eye-icon-confirm');
const eyeOffIconConfirm = document.querySelector('.eye-off-icon-confirm');

if (toggleConfirmPassword && confirmPasswordInput && eyeIconConfirm && eyeOffIconConfirm) {
    toggleConfirmPassword.addEventListener('click', () => {
        const type = confirmPasswordInput.type === 'password' ? 'text' : 'password';
        confirmPasswordInput.type = type;
        
        // Toggle icons
        if (type === 'password') {
            eyeIconConfirm.style.display = 'block';
            eyeOffIconConfirm.style.display = 'none';
        } else {
            eyeIconConfirm.style.display = 'none';
            eyeOffIconConfirm.style.display = 'block';
        }
    });
}

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
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Signup error:', error);
        errorDiv.textContent = getFirebaseErrorMessage(error) || 'Failed to create account. Please try again.';
        errorDiv.classList.remove('hidden');
    }
});

// Google Sign-Up
const googleSignupBtn = document.getElementById('google-signup-btn');
if (googleSignupBtn) {
    googleSignupBtn.addEventListener('click', async () => {
        const errorDiv = document.getElementById('signup-error');
        errorDiv.classList.add('hidden');
        
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // Check if user document exists
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (!userDoc.exists()) {
                // Create user document for new Google sign-up users
                await setDoc(userDocRef, {
                    id: user.uid,
                    name: user.displayName || 'User',
                    email: user.email,
                    imageUrl: user.photoURL || null,
                    phone: null,
                    bio: null,
                    city: null,
                    userType: 'USER',
                    activeRole: 'TRAVELER',
                    roles: ['TRAVELER'],
                    authProvider: 'google',
                    createdAt: serverTimestamp()
                });
            }
            
            // Redirect based on user type
            if (user.email === 'admin@gmail.com') {
                window.location.href = 'admin-panel.html';
            } else {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error('Google Sign-Up error:', error);
            if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
                errorDiv.textContent = 'Failed to sign up with Google. Please try again.';
                errorDiv.classList.remove('hidden');
            }
        }
    });
}

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
