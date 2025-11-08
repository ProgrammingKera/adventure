import { auth } from '../firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

function initNavbarAuth() {
    const authBtn = document.getElementById('auth-btn');
    if (!authBtn) return;

    onAuthStateChanged(auth, (user) => {
        // Show/hide profile link based on login status
        const profileLinks = document.querySelectorAll('a[href="profile.html"]');
        profileLinks.forEach(link => {
            const listItem = link.closest('li');
            if (listItem) {
                if (user) {
                    listItem.style.display = 'block';
                } else {
                    listItem.style.display = 'none';
                }
            }
        });

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
                window.location.href = 'login.html';
            };
        }
    });
}

initNavbarAuth();

// Mobile Menu Toggle
function initMobileMenu() {
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links.center');
    
    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', () => {
            mobileToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        const links = navLinks.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                mobileToggle.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!mobileToggle.contains(e.target) && !navLinks.contains(e.target)) {
                mobileToggle.classList.remove('active');
                navLinks.classList.remove('active');
            }
        });
    }
}

// Set Active Page
function setActivePage() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

initMobileMenu();
setActivePage();
