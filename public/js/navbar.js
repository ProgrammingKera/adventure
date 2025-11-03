import { auth } from '../firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

function initNavbarAuth() {
    const authBtn = document.getElementById('auth-btn');
    if (!authBtn) return;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            authBtn.textContent = 'Logout';
            authBtn.classList.remove('btn-secondary');
            authBtn.classList.add('btn-secondary');
            authBtn.onclick = async () => {
                try {
                    await signOut(auth);
                    window.location.href = 'index.html';
                } catch (e) {
                    alert('Error logging out: ' + (e.message || e));
                }
            };
        } else {
            authBtn.textContent = 'Login';
            authBtn.classList.remove('btn-secondary');
            authBtn.classList.add('btn-secondary');
            authBtn.onclick = () => {
                window.location.href = 'profile.html';
            };
        }
    });
}

initNavbarAuth();


