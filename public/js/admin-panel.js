import { db, auth } from '../firebase.js';
import { collection, getDocs, doc, deleteDoc, updateDoc, getDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Global data storage
let allUsers = [];
let allAgencies = [];
let allTrips = [];
let allBookings = [];
let allTestimonials = [];

// Admin email - ONLY this email can access admin panel
const ADMIN_EMAIL = 'admin@gmail.com';

// Check admin authentication
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Not logged in - redirect to login
        window.location.href = 'login.html';
        return;
    }
    
    // Check if user is admin - STRICT CHECK
    if (user.email !== ADMIN_EMAIL) {
        alert(' Access Denied! Only administrators can access this panel.');
        await signOut(auth);
        window.location.href = 'index.html';
        return;
    }
    
    // Admin verified - ensure admin data is correct
    await ensureAdminUser(user);
    
    // Load admin profile button
    loadAdminProfile(user);
    
    // Load all data
    await loadAllData();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to logout');
    }
});

// Load all data
async function loadAllData() {
    showLoading();
    try {
        await Promise.all([
            loadUsers(),
            loadAgencies(),
            loadTrips(),
            loadBookings(),
            loadTestimonials()
        ]);
        updateStatistics();
    } catch (error) {
        console.error('Error loading data:', error);
        alert('Failed to load data');
    }
    hideLoading();
}

// Load Users
async function loadUsers() {
    try {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(usersRef);
        allUsers = [];
        snapshot.forEach(doc => {
            allUsers.push({ id: doc.id, ...doc.data() });
        });
        renderUsers(allUsers);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Load Agencies
async function loadAgencies() {
    try {
        const agenciesRef = collection(db, 'agencies');
        const snapshot = await getDocs(agenciesRef);
        allAgencies = [];
        
        for (const docSnap of snapshot.docs) {
            const agencyData = { id: docSnap.id, ...docSnap.data() };
            
            // Get owner name
            if (agencyData.ownerId) {
                const userDoc = await getDoc(doc(db, 'users', agencyData.ownerId));
                if (userDoc.exists()) {
                    agencyData.ownerName = userDoc.data().name || 'Unknown';
                }
            }
            
            allAgencies.push(agencyData);
        }
        renderAgencies(allAgencies);
    } catch (error) {
        console.error('Error loading agencies:', error);
    }
}

// Load Trips
async function loadTrips() {
    try {
        const tripsRef = collection(db, 'trips');
        const snapshot = await getDocs(tripsRef);
        allTrips = [];
        
        for (const docSnap of snapshot.docs) {
            const tripData = { id: docSnap.id, ...docSnap.data() };
            
            // Get agency name
            if (tripData.agencyId) {
                const agencyDoc = await getDoc(doc(db, 'agencies', tripData.agencyId));
                if (agencyDoc.exists()) {
                    tripData.agencyName = agencyDoc.data().name || 'Unknown';
                }
            }
            
            allTrips.push(tripData);
        }
        renderTrips(allTrips);
    } catch (error) {
        console.error('Error loading trips:', error);
    }
}

// Load Bookings
async function loadBookings() {
    try {
        const bookingsRef = collection(db, 'bookings');
        const q = query(bookingsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        allBookings = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
            userName: 'Unknown',
            tripDescription: 'Unknown'
        }));
        
        // Batch load user names
        const userIds = [...new Set(allBookings.map(b => b.userId).filter(Boolean))];
        const userMap = {};
        if (userIds.length > 0) {
            const userDocs = await Promise.all(
                userIds.map(id => getDoc(doc(db, 'users', id)))
            );
            userDocs.forEach(userDoc => {
                if (userDoc.exists()) {
                    userMap[userDoc.id] = userDoc.data().name || 'Unknown';
                }
            });
        }
        
        // Batch load trip descriptions
        const tripIds = [...new Set(allBookings.map(b => b.tripId).filter(Boolean))];
        const tripMap = {};
        if (tripIds.length > 0) {
            const tripDocs = await Promise.all(
                tripIds.map(id => getDoc(doc(db, 'trips', id)))
            );
            tripDocs.forEach(tripDoc => {
                if (tripDoc.exists()) {
                    tripMap[tripDoc.id] = tripDoc.data().description || 'Unknown';
                }
            });
        }
        
        // Assign loaded data
        allBookings.forEach(booking => {
            if (booking.userId && userMap[booking.userId]) {
                booking.userName = userMap[booking.userId];
            }
            if (booking.tripId && tripMap[booking.tripId]) {
                booking.tripDescription = tripMap[booking.tripId];
            }
        });
        
        renderBookings(allBookings);
    } catch (error) {
        console.error('Error loading bookings:', error);
    }
}

// Load Testimonials
async function loadTestimonials() {
    try {
        const testimonialsRef = collection(db, 'testimonials');
        const q = query(testimonialsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        allTestimonials = [];
        snapshot.forEach(doc => {
            allTestimonials.push({ id: doc.id, ...doc.data() });
        });
        renderTestimonials(allTestimonials);
    } catch (error) {
        console.error('Error loading testimonials:', error);
    }
}

// Render Users
function renderUsers(users) {
    const tbody = document.getElementById('users-table-body');
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${user.name || 'N/A'}</td>
            <td>${user.email || 'N/A'}</td>
            <td>${user.city || 'N/A'}</td>
            <td>${user.phone || 'N/A'}</td>
            <td>${user.agencyId ? '✅ Yes' : '❌ No'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-view" onclick="viewUser('${user.id}')">View</button>
                    <button class="btn-small btn-delete" onclick="deleteUser('${user.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Render Agencies
function renderAgencies(agencies) {
    const tbody = document.getElementById('agencies-table-body');
    if (agencies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No agencies found</td></tr>';
        return;
    }
    
    tbody.innerHTML = agencies.map(agency => `
        <tr>
            <td>${agency.name || 'N/A'}</td>
            <td>${agency.ownerName || 'N/A'}</td>
            <td>${agency.location || 'N/A'}</td>
            <td>${agency.rating ? '⭐ ' + Number(agency.rating).toFixed(1) : 'N/A'}</td>
            <td>${agency.phone || 'N/A'}</td>
            <td>${agency.email || 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-view" onclick="viewAgency('${agency.id}')">View</button>
                    <button class="btn-small btn-delete" onclick="deleteAgency('${agency.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Render Trips
function renderTrips(trips) {
    const tbody = document.getElementById('trips-table-body');
    if (trips.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No trips found</td></tr>';
        return;
    }
    
    tbody.innerHTML = trips.map(trip => `
        <tr>
            <td>${trip.description || 'N/A'}</td>
            <td>${trip.agencyName || 'N/A'}</td>
            <td>${trip.location || 'N/A'}</td>
            <td>${trip.departure || 'N/A'}</td>
            <td>PKR ${trip.pricePerSeat || 'N/A'}</td>
            <td>${trip.totalSeats || 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-view" onclick="viewTrip('${trip.id}')">View</button>
                    <button class="btn-small btn-delete" onclick="deleteTrip('${trip.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Render Bookings
function renderBookings(bookings) {
    const tbody = document.getElementById('bookings-table-body');
    if (bookings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No bookings found</td></tr>';
        return;
    }
    
    tbody.innerHTML = bookings.map(booking => {
        // Payment status with color coding
        const paymentStatus = booking.paymentStatus || 'pending';
        let paymentColor, paymentDisplay;
        
        if (paymentStatus === 'completed' || paymentStatus === 'succeeded') {
            paymentColor = '#22c55e'; // Green
            paymentDisplay = ' Complete';
        } else if (paymentStatus === 'failed') {
            paymentColor = '#ef4444'; // Red
            paymentDisplay = ' Failed';
        } else {
            paymentColor = '#f59e0b'; // Orange
            paymentDisplay = ' Pending';
        }
        
        // Payment amount - use totalAmount from booking (this is what's actually saved)
        const paymentAmount = booking.totalAmount ? `PKR ${Number(booking.totalAmount).toLocaleString()}` : 'N/A';
        
        // Total price - use totalAmount or calculate from seatsBooked
        const totalPrice = booking.totalAmount || (booking.seatsBooked && booking.pricePerSeat ? booking.seatsBooked * booking.pricePerSeat : 'N/A');
        
        // Booking status
        const bookingStatus = booking.status || 'confirmed';
        const statusColor = bookingStatus === 'confirmed' ? '#22c55e' : '#f59e0b';
        
        return `
            <tr>
                <td>${booking.userName || 'N/A'}</td>
                <td>${booking.tripDescription || 'N/A'}</td>
                <td>${booking.seatsBooked || 'N/A'}</td>
                <td>PKR ${typeof totalPrice === 'number' ? totalPrice.toLocaleString() : totalPrice}</td>
                <td><span style="padding: 0.5rem 0.75rem; border-radius: 6px; background: ${paymentColor}20; color: ${paymentColor}; font-weight: 700; display: inline-block; min-width: 120px; text-align: center;">${paymentDisplay}</span></td>
                <td><strong>${paymentAmount}</strong></td>
                <td><span style="color: ${statusColor}; font-weight: 600;">${bookingStatus.toUpperCase()}</span></td>
                <td>${booking.createdAt ? new Date(booking.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-small btn-view" onclick="viewBooking('${booking.id}')">View</button>
                        <button class="btn-small btn-delete" onclick="deleteBooking('${booking.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Render Testimonials
function renderTestimonials(testimonials) {
    const tbody = document.getElementById('testimonials-table-body');
    if (testimonials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No testimonials found</td></tr>';
        return;
    }
    
    tbody.innerHTML = testimonials.map(testimonial => `
        <tr>
            <td>${testimonial.name || 'N/A'}</td>
            <td>${testimonial.title || 'N/A'}</td>
            <td>${testimonial.message ? testimonial.message.substring(0, 50) + '...' : 'N/A'}</td>
            <td>${'⭐'.repeat(testimonial.rating || 5)}</td>
            <td>${testimonial.createdAt ? new Date(testimonial.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-small btn-view" onclick="viewTestimonial('${testimonial.id}')">View</button>
                    <button class="btn-small btn-delete" onclick="deleteTestimonial('${testimonial.id}')">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update Statistics
function updateStatistics() {
    document.getElementById('stat-users').textContent = allUsers.length;
    document.getElementById('stat-agencies').textContent = allAgencies.length;
    document.getElementById('stat-trips').textContent = allTrips.length;
    document.getElementById('stat-bookings').textContent = allBookings.length;
    document.getElementById('stat-testimonials').textContent = allTestimonials.length;
}

// Tab switching
document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Search functionality
document.getElementById('search-users').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allUsers.filter(user => 
        (user.name || '').toLowerCase().includes(searchTerm) ||
        (user.email || '').toLowerCase().includes(searchTerm)
    );
    renderUsers(filtered);
});

document.getElementById('search-agencies').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allAgencies.filter(agency => 
        (agency.name || '').toLowerCase().includes(searchTerm) ||
        (agency.location || '').toLowerCase().includes(searchTerm)
    );
    renderAgencies(filtered);
});

document.getElementById('search-trips').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allTrips.filter(trip => 
        (trip.description || '').toLowerCase().includes(searchTerm) ||
        (trip.location || '').toLowerCase().includes(searchTerm)
    );
    renderTrips(filtered);
});

document.getElementById('search-bookings').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allBookings.filter(booking => 
        (booking.userName || '').toLowerCase().includes(searchTerm) ||
        (booking.tripDescription || '').toLowerCase().includes(searchTerm)
    );
    renderBookings(filtered);
});

document.getElementById('search-testimonials').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allTestimonials.filter(testimonial => 
        (testimonial.name || '').toLowerCase().includes(searchTerm) ||
        (testimonial.title || '').toLowerCase().includes(searchTerm)
    );
    renderTestimonials(filtered);
});

// Delete functions
window.deleteUser = async function(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    showLoading();
    try {
        await deleteDoc(doc(db, 'users', userId));
        await loadUsers();
        updateStatistics();
        alert('User deleted successfully');
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Failed to delete user');
    }
    hideLoading();
};

window.deleteAgency = async function(agencyId) {
    if (!confirm('Are you sure you want to delete this agency?')) return;
    
    showLoading();
    try {
        await deleteDoc(doc(db, 'agencies', agencyId));
        await loadAgencies();
        updateStatistics();
        alert('Agency deleted successfully');
    } catch (error) {
        console.error('Error deleting agency:', error);
        alert('Failed to delete agency');
    }
    hideLoading();
};

window.deleteTrip = async function(tripId) {
    if (!confirm('Are you sure you want to delete this trip?')) return;
    
    showLoading();
    try {
        await deleteDoc(doc(db, 'trips', tripId));
        await loadTrips();
        updateStatistics();
        alert('Trip deleted successfully');
    } catch (error) {
        console.error('Error deleting trip:', error);
        alert('Failed to delete trip');
    }
    hideLoading();
};

window.deleteBooking = async function(bookingId) {
    if (!confirm('Are you sure you want to delete this booking?')) return;
    
    showLoading();
    try {
        await deleteDoc(doc(db, 'bookings', bookingId));
        await loadBookings();
        updateStatistics();
        alert('Booking deleted successfully');
    } catch (error) {
        console.error('Error deleting booking:', error);
        alert('Failed to delete booking');
    }
    hideLoading();
};

window.deleteTestimonial = async function(testimonialId) {
    if (!confirm('Are you sure you want to delete this testimonial?')) return;
    
    showLoading();
    try {
        await deleteDoc(doc(db, 'testimonials', testimonialId));
        await loadTestimonials();
        updateStatistics();
        alert('Testimonial deleted successfully');
    } catch (error) {
        console.error('Error deleting testimonial:', error);
        alert('Failed to delete testimonial');
    }
    hideLoading();
};

// View functions (show alert with details)
window.viewUser = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    alert(`User Details:\n\nName: ${user.name || 'N/A'}\nEmail: ${user.email || 'N/A'}\nCity: ${user.city || 'N/A'}\nPhone: ${user.phone || 'N/A'}\nBio: ${user.bio || 'N/A'}\nHas Agency: ${user.agencyId ? 'Yes' : 'No'}`);
};

window.viewAgency = function(agencyId) {
    const agency = allAgencies.find(a => a.id === agencyId);
    if (!agency) return;
    
    alert(`Agency Details:\n\nName: ${agency.name || 'N/A'}\nOwner: ${agency.ownerName || 'N/A'}\nLocation: ${agency.location || 'N/A'}\nRating: ${agency.rating || 'N/A'}\nPhone: ${agency.phone || 'N/A'}\nEmail: ${agency.email || 'N/A'}\nDescription: ${agency.description || 'N/A'}`);
};

window.viewTrip = function(tripId) {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) return;
    
    alert(`Trip Details:\n\nDescription: ${trip.description || 'N/A'}\nAgency: ${trip.agencyName || 'N/A'}\nLocation: ${trip.location || 'N/A'}\nDeparture: ${trip.departure || 'N/A'}\nPrice: PKR ${trip.pricePerSeat || 'N/A'}\nTotal Seats: ${trip.totalSeats || 'N/A'}`);
};

window.viewBooking = function(bookingId) {
    const booking = allBookings.find(b => b.id === bookingId);
    if (!booking) return;
    
    alert(`Booking Details:\n\nUser: ${booking.userName || 'N/A'}\nTrip: ${booking.tripDescription || 'N/A'}\nSeats: ${booking.seatsBooked || 'N/A'}\nTotal Price: PKR ${booking.totalPrice || 'N/A'}\nStatus: ${booking.status || 'pending'}`);
};

window.viewTestimonial = function(testimonialId) {
    const testimonial = allTestimonials.find(t => t.id === testimonialId);
    if (!testimonial) return;
    
    alert(`Testimonial Details:\n\nName: ${testimonial.name || 'N/A'}\nTitle: ${testimonial.title || 'N/A'}\nMessage: ${testimonial.message || 'N/A'}\nRating: ${'⭐'.repeat(testimonial.rating || 5)}`);
};

// Ensure admin user exists in users collection
async function ensureAdminUser(user) {
    try {
        const { updateDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        const adminData = {
            email: user.email,
            name: 'Admin',
            role: 'admin',
            city: 'Islamabad',
            phone: '03001234567',
            bio: 'System Administrator'
        };
        
        if (!userDoc.exists()) {
            // Create admin user
            await setDoc(userRef, {
                ...adminData,
                createdAt: new Date()
            });
            console.log('Admin user created in users collection');
        } else {
            // Update existing admin user to ensure correct data
            await updateDoc(userRef, adminData);
            console.log('Admin user data updated');
        }
    } catch (error) {
        console.error('Error ensuring admin user:', error);
    }
}

// Load Admin Profile
function loadAdminProfile(user) {
    // Add profile button to header if not exists
    const navbar = document.querySelector('.navbar .nav-links');
    if (navbar && !document.getElementById('admin-profile-btn')) {
        const profileLi = document.createElement('li');
        profileLi.innerHTML = '<a class="nav-link" href="#" id="admin-profile-btn">My Profile</a>';
        navbar.appendChild(profileLi);
        
        document.getElementById('admin-profile-btn').addEventListener('click', (e) => {
            e.preventDefault();
            showAdminProfileModal(user);
        });
    }
}

// Show Admin Profile Modal
function showAdminProfileModal(user) {
    const modalHTML = `
        <div id="admin-profile-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="if(event.target.id==='admin-profile-modal') this.remove();">
            <div style="background: white; padding: 2rem; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation();">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h2 style="margin: 0; color: var(--text-dark);">Admin Profile</h2>
                    <button onclick="document.getElementById('admin-profile-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-light);">&times;</button>
                </div>
                
                <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px;">
                    <p style="margin: 0.5rem 0;"><strong>Email:</strong> ${user.email}</p>
                    <p style="margin: 0.5rem 0;"><strong>Role:</strong> Administrator</p>
                    <p style="margin: 0.5rem 0; color: var(--text-light); font-size: 0.9rem;">Last Login: ${new Date().toLocaleString()}</p>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <h3 style="color: var(--primary-color); margin-bottom: 1rem;">Change Email</h3>
                    <form id="change-email-form">
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">New Email</label>
                            <input type="email" id="new-email" required style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Current Password (for verification)</label>
                            <input type="password" id="email-password" required style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Update Email</button>
                    </form>
                    <div id="email-message" style="margin-top: 1rem; display: none;"></div>
                </div>
                
                <div style="margin-bottom: 1.5rem; border-top: 1px solid #e9ecef; padding-top: 1.5rem;">
                    <h3 style="color: var(--primary-color); margin-bottom: 1rem;">Change Password</h3>
                    <form id="change-password-form">
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Current Password</label>
                            <input type="password" id="current-password" required style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">New Password</label>
                            <input type="password" id="new-password" required minlength="6" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Confirm New Password</label>
                            <input type="password" id="confirm-password" required minlength="6" style="width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">Update Password</button>
                    </form>
                    <div id="password-message" style="margin-top: 1rem; display: none;"></div>
                </div>
                
                <div style="text-align: center;">
                    <button onclick="document.getElementById('admin-profile-modal').remove()" class="btn btn-secondary" style="width: 100%;">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('admin-profile-modal');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Setup email change form
    document.getElementById('change-email-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changeAdminEmail();
    });
    
    // Setup password change form
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await changeAdminPassword();
    });
}

// Change Admin Email
async function changeAdminEmail() {
    const newEmail = document.getElementById('new-email').value;
    const emailPassword = document.getElementById('email-password').value;
    const messageDiv = document.getElementById('email-message');
    
    // Validation
    if (!newEmail || !emailPassword) {
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
        messageDiv.textContent = 'Please fill in all fields!';
        return;
    }
    
    showLoading();
    
    try {
        // Import required functions
        const { EmailAuthProvider, reauthenticateWithCredential, updateEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        const user = auth.currentUser;
        
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(user.email, emailPassword);
        await reauthenticateWithCredential(user, credential);
        
        // Update email
        await updateEmail(user, newEmail);
        
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'green';
        messageDiv.textContent = 'Email updated successfully!';
        
        // Clear form
        document.getElementById('change-email-form').reset();
        
        // Close modal after 2 seconds
        setTimeout(() => {
            document.getElementById('admin-profile-modal').remove();
        }, 2000);
        
    } catch (error) {
        console.error('Email change error:', error);
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
        
        if (error.code === 'auth/wrong-password') {
            messageDiv.textContent = 'Current password is incorrect!';
        } else if (error.code === 'auth/email-already-in-use') {
            messageDiv.textContent = 'New email is already in use!';
        } else {
            messageDiv.textContent = 'Failed to update email. Please try again.';
        }
    }
    
    hideLoading();
}

// Change Admin Password
async function changeAdminPassword() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const messageDiv = document.getElementById('password-message');
    
    // Validation
    if (newPassword !== confirmPassword) {
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
        messageDiv.textContent = 'New passwords do not match!';
        return;
    }
    
    if (newPassword.length < 6) {
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
        messageDiv.textContent = 'Password must be at least 6 characters!';
        return;
    }
    
    showLoading();
    
    try {
        // Import required functions
        const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        
        const user = auth.currentUser;
        
        // Re-authenticate user
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        
        // Update password
        await updatePassword(user, newPassword);
        
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'green';
        messageDiv.textContent = 'Password updated successfully!';
        
        // Clear form
        document.getElementById('change-password-form').reset();
        
        // Close modal after 2 seconds
        setTimeout(() => {
            document.getElementById('admin-profile-modal').remove();
        }, 2000);
        
    } catch (error) {
        console.error('Password change error:', error);
        messageDiv.style.display = 'block';
        messageDiv.style.color = 'red';
        
        if (error.code === 'auth/wrong-password') {
            messageDiv.textContent = 'Current password is incorrect!';
        } else if (error.code === 'auth/weak-password') {
            messageDiv.textContent = 'New password is too weak!';
        } else {
            messageDiv.textContent = 'Failed to update password. Please try again.';
        }
    }
    
    hideLoading();
}

// Loading overlay
function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}