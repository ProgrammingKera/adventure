import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp,
    orderBy,
    Timestamp,
    setDoc
,
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentAgencyId = null;
let currentEditingTripId = null;

// Check auth and load agency
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        alert('Please login to access agency dashboard');
        window.location.href = 'profile.html';
        return;
    }
    
    const profileLink = document.getElementById('profile-link');
    if (profileLink) {
        profileLink.textContent = 'Profile';
    }

    // Disable add trip until agency is loaded
    const addTripBtn = document.getElementById('add-trip-btn');
    addTripBtn?.setAttribute('disabled', 'true');
    
    await loadAgency(user.uid);
    // Re-enable once agency decision is made
    addTripBtn?.removeAttribute('disabled');
});

async function loadAgency(userId) {
    try {
        const agenciesRef = collection(db, 'agencies');
        const q = query(agenciesRef, where('ownerId', '==', userId));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            document.getElementById('dashboard-content').classList.add('hidden');
            document.getElementById('no-agency-message').classList.remove('hidden');
            return;
        }
        
        const agencyDoc = querySnapshot.docs[0];
        currentAgencyId = agencyDoc.id;
        const agencyData = agencyDoc.data();
        
        document.getElementById('agency-name-header').textContent = `${agencyData.name} - Dashboard`;
        
        // Load stats
        await loadStats(currentAgencyId);
        
        // Load trips
        await loadTrips(currentAgencyId);
    } catch (error) {
        console.error('Error loading agency:', error);
        alert('Error loading agency: ' + error.message);
    }
}

async function loadStats(agencyId) {
    try {
        // Count trips
        const tripsRef = collection(db, 'trips');
        const tripsQuery = query(tripsRef, where('agencyId', '==', agencyId));
        const tripsSnapshot = await getDocs(tripsQuery);
        document.getElementById('total-trips').textContent = tripsSnapshot.size;
        
        // Count bookings
        let totalBookings = 0;
        const bookingsRef = collection(db, 'bookings');
        tripsSnapshot.forEach(async (tripDoc) => {
            const bookingsQuery = query(bookingsRef, where('tripId', '==', tripDoc.id));
            const bookingsSnapshot = await getDocs(bookingsQuery);
            totalBookings += bookingsSnapshot.size;
        });
        
        // Get agency rating
        const agencyDoc = await getDoc(doc(db, 'agencies', agencyId));
        if (agencyDoc.exists()) {
            const agencyData = agencyDoc.data();
            document.getElementById('agency-rating').textContent = 
                (agencyData.averageRating || 0).toFixed(1);
        }
        
        // Update bookings count (async operation)
        setTimeout(async () => {
            let count = 0;
            const allTrips = await getDocs(query(collection(db, 'trips'), where('agencyId', '==', agencyId)));
            for (const tripDoc of allTrips.docs) {
                const bookingsQuery = query(collection(db, 'bookings'), where('tripId', '==', tripDoc.id));
                const bookingsSnapshot = await getDocs(bookingsQuery);
                count += bookingsSnapshot.size;
            }
            document.getElementById('total-bookings').textContent = count;
        }, 1000);
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadTrips(agencyId) {
    try {
        const tripsRef = collection(db, 'trips');
        // Don't use orderBy on date string - get all trips and sort in memory
        const q = query(tripsRef, where('agencyId', '==', agencyId));
        const querySnapshot = await getDocs(q);
        
        const container = document.getElementById('trips-container');
        // Clear any initial loading UI
        container.innerHTML = '';
        
        // Helper: safely get Date from any date field format
        const getTripDate = (trip) => {
            // Priority 1: Use date field if it's a Timestamp
            if (trip.date?.toDate) {
                return trip.date.toDate();
            }
            // Priority 2: Parse string date if exists
            if (typeof trip.date === 'string') {
                let s = trip.date.replace(/\sUTC[+-]\d+$/i, '');
                s = s.replace(/\sat\s/i, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
                const d = new Date(s);
                if (!isNaN(d.getTime())) return d;
            }
            return null;
        };

        // Background-migrate: convert string dates to Timestamp and ensure location fields
        (async () => {
            try {
                await Promise.all(querySnapshot.docs.map(async (docSnap) => {
                    const data = docSnap.data();
                    const updates = {};

                    // Convert string date to Timestamp
                    if (data && typeof data.date === 'string') {
                        const parsed = getTripDate(data);
                        if (parsed) {
                            updates.date = Timestamp.fromDate(parsed);
                            updates.dateTimestamp = parsed.getTime();
                        }
                    }

                    // Add dateTimestamp if missing (for existing Timestamp dates)
                    if (data && data.date?.toDate && !data.dateTimestamp) {
                        const dateObj = data.date.toDate();
                        updates.dateTimestamp = dateObj.getTime();
                    }

                    // Normalize duplicate date fields for mobile schemas
                    if (data && data.date?.toDate && !data.startDate) {
                        updates.startDate = data.date;
                    }
                    if (data && (data.dateTimestamp || data.date?.toDate) && !data.startDateMillis) {
                        const millis = data.dateTimestamp || data.date.toDate().getTime();
                        updates.startDateMillis = millis;
                    }

                    // Visibility/status defaults expected by some mobile apps
                    if (data && typeof data.isPublished === 'undefined') {
                        updates.isPublished = true;
                    }
                    if (data && !data.status) {
                        updates.status = 'active';
                    }

                    // Created/updated millis for mobile orderBy queries
                    if (data && data.createdAt?.toMillis && !data.createdAtMillis) {
                        updates.createdAtMillis = data.createdAt.toMillis();
                    }
                    if (data && data.updatedAt?.toMillis && !data.updatedAtMillis) {
                        updates.updatedAtMillis = data.updatedAt.toMillis();
                    }

                    // Ensure location fields exist
                    if (data && data.location) {
                        const locationStr = String(data.location).trim();
                        const locationLower = locationStr.toLowerCase();
                        updates.locationNormalized = locationLower;
                        updates.city = locationStr;
                        updates.cityLower = locationLower;
                    }

                    // Apply updates if any
                    if (Object.keys(updates).length > 0) {
                        try {
                            await updateDoc(doc(db, 'trips', docSnap.id), updates);
                        } catch (_) {}
                    }
                }));
            } catch (_) {}
        })();

        if (querySnapshot.empty) {
            container.innerHTML = `
                <div class="card" style="text-align:center; padding: 2rem; border-radius: 12px; border:1px solid #e9ecef;">
                    <p style="color: var(--text-light); margin-bottom: 1rem;">No trips added yet.</p>
                    <button class="btn btn-primary" onclick="document.getElementById('add-trip-btn').click()">Add Your First Trip</button>
                </div>
            `;
            return;
        }
        
        // Sort trips by date in memory (most recent first)
        const sortedDocs = querySnapshot.docs.sort((a, b) => {
            const da = getTripDate(a.data()) || new Date(0);
            const db = getTripDate(b.data()) || new Date(0);
            return db.getTime() - da.getTime();
        });

        container.innerHTML = sortedDocs.map(docSnap => {
            const trip = docSnap.data();
            const availableSeats = Math.max(0, (trip.totalSeats || 0) - (trip.bookedSeats || 0));
            const tripDate = getTripDate(trip);
            const dateStr = tripDate ? tripDate.toLocaleDateString() : 'N/A';
            const priceStr = `PKR ${Number(trip.pricePerSeat || 0).toLocaleString()}`;
            const title = trip.description || 'Trip';
            const location = trip.location || 'N/A';
            const departure = trip.departure || 'N/A';

            return `
                <div class="trip-card">
                    <div class="trip-media">${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${title}">` : ''}</div>
                    <div class="trip-content">
                        <h3 class="trip-title">${title}</h3>
                        <div class="trip-sub">${location}</div>
                        <div class="trip-price">${priceStr} <span style="font-weight:500;color:#6c757d">/ seat</span></div>
                        <div class="chip-row">
                            <span class="chip">${dateStr}</span>
                            <span class="chip">${departure}</span>
                            <span class="chip">${availableSeats}/${trip.totalSeats || 0} seats</span>
                        </div>
                        <div class="trip-actions" style="display:grid; grid-template-columns: 1fr 1fr; gap:.5rem;">
                            <button class="btn btn-secondary" onclick="viewTripBookings('${docSnap.id}')">View Bookings</button>
                            <button class="btn btn-secondary" onclick="editTrip('${docSnap.id}')">Edit</button>
                            <button class="btn btn-secondary" style="grid-column: 1 / -1; border-color:#dc3545; color:#dc3545;" onclick="deleteTrip('${docSnap.id}')">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading trips:', error);
        const container = document.getElementById('trips-container');
        container.innerHTML = '<p style="text-align: center; color: red;">Error loading trips.</p>';
    }
}


// Cloudinary Upload Handler
const cloudinaryUploadBtn = document.getElementById('cloudinary-upload-btn');
if (cloudinaryUploadBtn) {
    cloudinaryUploadBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validate file
            if (file.size > 10 * 1024 * 1024) {
                alert('Image size should be less than 10MB');
                return;
            }
            
            const statusDiv = document.getElementById('upload-status');
            const urlInput = document.getElementById('trip-image-url');
            
            try {
                statusDiv.textContent = 'Uploading...';
                statusDiv.style.color = 'var(--primary-color)';
                cloudinaryUploadBtn.disabled = true;
                
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
                cloudinaryUploadBtn.disabled = false;
            }
        };
        
        input.click();
    });
}

// Add Trip Form Toggle
document.getElementById('add-trip-btn').addEventListener('click', () => {
    const form = document.getElementById('add-trip-form');
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth' });
    
    // Reset image preview
    selectedTripImageBase64 = null;
    if (tripImageFileInput) tripImageFileInput.value = '';
    if (tripImagePreview) tripImagePreview.style.display = 'none';
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('trip-date').setAttribute('min', today);
});

document.getElementById('cancel-trip-btn').addEventListener('click', () => {
    document.getElementById('add-trip-form').classList.add('hidden');
    document.getElementById('trip-form').reset();
    document.getElementById('trip-error').classList.add('hidden');
    document.getElementById('trip-success').classList.add('hidden');
    // Reset edit mode UI
    currentEditingTripId = null;
    const formWrap = document.getElementById('add-trip-form');
    const titleEl = formWrap.querySelector('h3');
    const submitBtn = document.querySelector('#trip-form button[type="submit"]');
    if (titleEl) titleEl.textContent = 'Add New Trip';
    if (submitBtn) submitBtn.textContent = '+ Add Trip';
});

// Submit Trip Form
document.getElementById('trip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentAgencyId) {
        const errorDiv = document.getElementById('trip-error');
        errorDiv.textContent = 'Agency not loaded yet. Please wait a moment and try again.';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    const errorDiv = document.getElementById('trip-error');
    const successDiv = document.getElementById('trip-success');
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Store date as Firestore Timestamp (mobile apps need this)
    const dateInput = document.getElementById('trip-date').value; // YYYY-MM-DD
    const dateObj = dateInput ? new Date(dateInput + 'T00:00:00') : null;

    // Create Timestamp for Firestore
    const firestoreTimestamp = dateObj ? Timestamp.fromDate(dateObj) : null;

    const nowMillis = Date.now();
    const tripData = {
        agencyId: currentAgencyId,
        description: document.getElementById('trip-description').value.trim(),
        location: document.getElementById('trip-location').value.trim(),
        locationNormalized: document.getElementById('trip-location').value.trim().toLowerCase(),
        city: document.getElementById('trip-location').value.trim(),
        cityLower: document.getElementById('trip-location').value.trim().toLowerCase(),
        imageUrl: document.getElementById('trip-image-url').value.trim(),
        // Dates
        date: firestoreTimestamp, // Firestore Timestamp for mobile compatibility
        dateTimestamp: dateObj ? dateObj.getTime() : null, // Milliseconds timestamp for mobile queries
        startDate: firestoreTimestamp, // duplicate for mobile schemas expecting startDate
        startDateMillis: dateObj ? dateObj.getTime() : null,
        // Meta
        departure: document.getElementById('trip-departure').value.trim(),
        totalSeats: parseInt(document.getElementById('trip-total-seats').value),
        pricePerSeat: parseInt(document.getElementById('trip-price').value),
        bookedSeats: 0,
        status: 'active',
        isPublished: true,
        visibleFrom: serverTimestamp(),
        // IDs & timestamps
        id: '', // Will be set after creation
        createdAt: serverTimestamp(),
        createdAtMillis: nowMillis,
        updatedAt: serverTimestamp(),
        updatedAtMillis: nowMillis
    };
    
    try {
        if (currentEditingTripId) {
            // Update existing trip
            const ref = doc(db, 'trips', currentEditingTripId);
            await updateDoc(ref, {
                ...tripData,
                id: currentEditingTripId,
                updatedAt: serverTimestamp(),
                updatedAtMillis: nowMillis
            });
            successDiv.textContent = 'Trip updated successfully!';
        } else {
            // Create with a known ID so 'id' is present immediately (helps mobile apps)
            const newRef = doc(collection(db, 'trips'));
            await setDoc(newRef, { ...tripData, id: newRef.id });
            successDiv.textContent = 'Trip added successfully!';
        }

        successDiv.classList.remove('hidden');
        
        // Reload trips and stats FIRST (so user sees new trip immediately)
        await loadTrips(currentAgencyId);
        await loadStats(currentAgencyId);
        
        // Reset form
        document.getElementById('trip-form').reset();
        document.getElementById('add-trip-form').classList.add('hidden');
        currentEditingTripId = null;
        const formWrap = document.getElementById('add-trip-form');
        const titleEl = formWrap.querySelector('h3');
        const submitBtn = document.querySelector('#trip-form button[type="submit"]');
        if (titleEl) titleEl.textContent = 'Add New Trip';
        if (submitBtn) submitBtn.textContent = 'Add Trip';
        
        setTimeout(() => {
            successDiv.classList.add('hidden');
        }, 3000);
    } catch (error) {
        console.error('Error saving trip:', error);
        errorDiv.textContent = 'Failed to save trip: ' + error.message;
        errorDiv.classList.remove('hidden');
    }
});

// Edit trip
window.editTrip = async function(tripId) {
    try {
        const ref = doc(db, 'trips', tripId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            alert('Trip not found');
            return;
        }
        const t = snap.data();
        // Prefill form
        document.getElementById('trip-description').value = t.description || '';
        document.getElementById('trip-location').value = t.location || '';
        
        document.getElementById('trip-image-url').value = t.imageUrl || '';
        // Date input in YYYY-MM-DD
        const dateObj = (t.startDate?.toDate && t.startDate.toDate()) || (t.date?.toDate && t.date.toDate()) || (typeof t.startDateMillis === 'number' ? new Date(t.startDateMillis) : (typeof t.dateTimestamp === 'number' ? new Date(t.dateTimestamp) : null));
        if (dateObj && !isNaN(dateObj.getTime())) {
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            document.getElementById('trip-date').value = `${yyyy}-${mm}-${dd}`;
        } else {
            document.getElementById('trip-date').value = '';
        }
        document.getElementById('trip-departure').value = t.departure || '';
        document.getElementById('trip-total-seats').value = t.totalSeats || '';
        document.getElementById('trip-price').value = t.pricePerSeat || '';

        // Switch to edit mode UI
        currentEditingTripId = tripId;
        const formWrap = document.getElementById('add-trip-form');
        const titleEl = formWrap.querySelector('h3');
        const submitBtn = document.querySelector('#trip-form button[type="submit"]');
        if (titleEl) titleEl.textContent = 'Edit Trip';
        if (submitBtn) submitBtn.textContent = 'Update Trip';
        formWrap.classList.remove('hidden');
        formWrap.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        console.error('Error editing trip:', e);
        alert('Failed to load trip for editing.');
    }
};

// Delete trip
window.deleteTrip = async function(tripId) {
    try {
        if (!confirm('Are you sure you want to delete this trip?')) return;
        await deleteDoc(doc(db, 'trips', tripId));
        await loadTrips(currentAgencyId);
        await loadStats(currentAgencyId);
    } catch (e) {
        console.error('Error deleting trip:', e);
        alert('Failed to delete trip: ' + (e.message || e));
    }
};

// View Trip Bookings
window.viewTripBookings = async function(tripId) {
    const modal = document.getElementById('bookings-modal');
    const body = document.getElementById('bookings-modal-body');
    const title = document.getElementById('bookings-modal-title');
    if (!modal || !body) return;

    body.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading bookings...</p></div>';
    modal.classList.remove('hidden');

    try {
        // Try to get trip title for header
        try {
            const tripDoc = await getDoc(doc(db, 'trips', tripId));
            if (tripDoc.exists()) {
                const t = tripDoc.data();
                title.textContent = `Bookings — ${t.description || 'Trip'}`;
            } else {
                title.textContent = 'Trip Bookings';
            }
        } catch (_) {
            title.textContent = 'Trip Bookings';
        }

        const bookingsRef = collection(db, 'bookings');
        const qBookings = query(bookingsRef, where('tripId', '==', tripId));
        const snapshot = await getDocs(qBookings);

        if (snapshot.empty) {
            body.innerHTML = '<p class="muted" style="padding: .5rem 0;">No bookings for this trip yet.</p>';
            return;
        }

        const rows = snapshot.docs.map(d => {
            const b = d.data();
            const bookedAt = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString() : '';
            const totalAmount = b.totalAmount ? `PKR ${b.totalAmount.toLocaleString()}` : '-';
            const paymentStatus = b.paymentStatus || 'pending';
            const statusColor = paymentStatus === 'completed' ? '#28a745' : '#ffc107';
            const statusBadge = `<span style="background: ${statusColor}; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${paymentStatus}</span>`;
            
            return `
                <tr class="table-row">
                    <td>${b.userName || 'Unknown'}</td>
                    <td>${b.userEmail || 'N/A'}</td>
                    <td>${b.userPhone || '-'}</td>
                    <td>${b.userLocation || '-'}</td>
                    <td><span class="badge">${b.seatsBooked || 0}</span></td>
                    <td style="font-weight: 600; color: #28a745;">${totalAmount}</td>
                    <td>${statusBadge}</td>
                    <td class="muted" style="font-size: 0.85rem;">${bookedAt}</td>
                </tr>
            `;
        }).join('');

        body.innerHTML = `
            <div style="overflow:auto;">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Location</th>
                            <th>Seats</th>
                            <th>Amount</th>
                            <th>Payment</th>
                            <th>Booked On</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading bookings:', error);
        body.innerHTML = '<p style="color:red;">Error loading bookings.</p>';
    }
};

// Modal close handlers
document.getElementById('bookings-modal-close')?.addEventListener('click', () => {
    document.getElementById('bookings-modal')?.classList.add('hidden');
});
document.getElementById('bookings-modal-backdrop')?.addEventListener('click', () => {
    document.getElementById('bookings-modal')?.classList.add('hidden');
});

