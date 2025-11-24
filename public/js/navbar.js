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

        // Show/hide My Bookings link based on login status
        const myBookingsNav = document.getElementById('my-bookings-nav');
        if (myBookingsNav) {
            if (user) {
                myBookingsNav.style.display = 'block';
            } else {
                myBookingsNav.style.display = 'none';
            }
        }

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

        // Update mobile menu button if it exists
        updateMobileAuthButton();
    });
}

function updateMobileAuthButton() {
    const authBtn = document.getElementById('auth-btn');
    const authBtnMobile = document.getElementById('auth-btn-mobile');

    if (authBtnMobile && authBtn) {
        authBtnMobile.textContent = authBtn.textContent;
        authBtnMobile.onclick = authBtn.onclick;
    }
}

initNavbarAuth();

// Mobile Menu Toggle
function initMobileMenu() {
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links.center');
    const authBtn = document.getElementById('auth-btn');

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

        // Handle Mobile Auth Button
        const handleMobileAuthBtn = () => {
            if (!authBtn) return;

            const existingMobileBtn = document.getElementById('auth-btn-mobile');

            if (window.innerWidth <= 768) {
                // Add if not exists
                if (!existingMobileBtn) {
                    const authBtnClone = authBtn.cloneNode(true);
                    authBtnClone.id = 'auth-btn-mobile';
                    authBtnClone.style.width = '100%';
                    authBtnClone.style.marginTop = '1rem';
                    authBtnClone.style.marginLeft = '0';
                    authBtnClone.className = authBtn.className; // Ensure classes are copied

                    // Copy click handler wrapper
                    authBtnClone.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (authBtn.onclick) {
                            authBtn.onclick();
                        }
                        mobileToggle.classList.remove('active');
                        navLinks.classList.remove('active');
                    });
                    navLinks.appendChild(authBtnClone);
                } else {
                    // Update text/classes if they changed
                    existingMobileBtn.textContent = authBtn.textContent;
                    existingMobileBtn.className = authBtn.className;
                }
            } else {
                // Remove if exists
                if (existingMobileBtn) {
                    existingMobileBtn.remove();
                }
                // Ensure menu is closed when switching to desktop
                mobileToggle.classList.remove('active');
                navLinks.classList.remove('active');
            }
        };

        // Initial check
        handleMobileAuthBtn();

        // Listen for resize
        window.addEventListener('resize', handleMobileAuthBtn);

        // Listen for auth changes to update mobile button text
        const observer = new MutationObserver(() => {
            const mobileBtn = document.getElementById('auth-btn-mobile');
            if (mobileBtn && authBtn) {
                mobileBtn.textContent = authBtn.textContent;
                mobileBtn.className = authBtn.className;
            }
        });

        if (authBtn) {
            observer.observe(authBtn, { attributes: true, childList: true, subtree: true });
        }

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
