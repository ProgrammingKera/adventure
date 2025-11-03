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
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentAgencyId = null;

// Check auth and load agency
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        alert('Please login to access agency dashboard');
        window.location.href = 'profile.html';
        return;
    }
    
    const profileLink = document.getElementById('profile-link');
    profileLink.textContent = 'Profile';
    
    await loadAgency(user.uid);
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
        
        if (querySnapshot.empty) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <p style="color: var(--text-light); margin-bottom: 1rem;">No trips added yet.</p>
                    <button class="btn btn-primary" onclick="document.getElementById('add-trip-btn').click()">
                        Add Your First Trip
                    </button>
                </div>
            `;
            return;
        }
        
        // Sort trips by date in memory (most recent first)
        const sortedDocs = querySnapshot.docs.sort((a, b) => {
            const dateA = a.data().date || '';
            const dateB = b.data().date || '';
            
            // Ensure both are strings before comparing
            const dateAStr = typeof dateA === 'string' ? dateA : String(dateA || '');
            const dateBStr = typeof dateB === 'string' ? dateB : String(dateB || '');
            
            // If dates are empty, put them at the end
            if (!dateAStr && !dateBStr) return 0;
            if (!dateAStr) return 1;
            if (!dateBStr) return -1;
            
            // Compare strings (most recent first)
            return dateBStr.localeCompare(dateAStr);
        });
        
        container.innerHTML = sortedDocs.map(doc => {
            const trip = doc.data();
            const availableSeats = (trip.totalSeats || 0) - (trip.bookedSeats || 0);
            
            return `
                <div class="card">
                    ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" class="card-image">` : ''}
                    <div class="card-content">
                        <h3 class="card-title">${trip.description || 'Trip'}</h3>
                        <p class="card-text">📍 ${trip.location || 'N/A'}</p>
                        <p class="card-text">🚌 ${trip.departure || 'N/A'}</p>
                        <p class="card-price">PKR ${trip.pricePerSeat || 0} per seat</p>
                        <div class="card-meta">
                            <span>👥 ${availableSeats}/${trip.totalSeats || 0} seats available</span>
                            <span>📅 ${trip.date ? (typeof trip.date === 'string' ? trip.date.split(' at ')[0] : new Date(trip.date).toLocaleDateString()) : 'N/A'}</span>
                        </div>
                        <button class="btn btn-secondary" onclick="viewTripBookings('${doc.id}')" style="width: 100%; margin-top: 1rem;">
                            View Bookings
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading trips:', error);
        document.getElementById('trips-container').innerHTML = 
            '<p style="text-align: center; color: red;">Error loading trips.</p>';
    }
}

// Add Trip Form Toggle
document.getElementById('add-trip-btn').addEventListener('click', () => {
    const form = document.getElementById('add-trip-form');
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth' });
    
    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('trip-date').setAttribute('min', today);
});

document.getElementById('cancel-trip-btn').addEventListener('click', () => {
    document.getElementById('add-trip-form').classList.add('hidden');
    document.getElementById('trip-form').reset();
    document.getElementById('trip-error').classList.add('hidden');
    document.getElementById('trip-success').classList.add('hidden');
});

// Submit Trip Form
document.getElementById('trip-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentAgencyId) {
        alert('Agency not found. Please create an agency first.');
        return;
    }
    
    const errorDiv = document.getElementById('trip-error');
    const successDiv = document.getElementById('trip-success');
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Format date as string (matching Firebase structure)
    const dateInput = document.getElementById('trip-date').value;
    const dateObj = new Date(dateInput);
    const formattedDate = dateObj.toLocaleString('en-US', { 
        timeZone: 'Asia/Karachi',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }) + ' UTC+5';
    
    const tripData = {
        agencyId: currentAgencyId,
        description: document.getElementById('trip-description').value.trim(),
        location: document.getElementById('trip-location').value.trim(),
        imageUrl: document.getElementById('trip-image-url').value.trim(),
        date: formattedDate, // String format matching your database
        departure: document.getElementById('trip-departure').value.trim(),
        totalSeats: parseInt(document.getElementById('trip-total-seats').value),
        pricePerSeat: parseInt(document.getElementById('trip-price').value),
        bookedSeats: 0,
        id: '', // Will be set after creation
        createdAt: serverTimestamp()
    };
    
    try {
        const docRef = await addDoc(collection(db, 'trips'), tripData);
        
        // Update the trip with its ID (matching your database structure)
        await updateDoc(doc(db, 'trips', docRef.id), { id: docRef.id });
        
        successDiv.textContent = 'Trip added successfully!';
        successDiv.classList.remove('hidden');
        
        // Reset form
        document.getElementById('trip-form').reset();
        document.getElementById('add-trip-form').classList.add('hidden');
        
        // Reload trips and stats
        await loadTrips(currentAgencyId);
        await loadStats(currentAgencyId);
        
        setTimeout(() => {
            successDiv.classList.add('hidden');
        }, 3000);
    } catch (error) {
        console.error('Error adding trip:', error);
        errorDiv.textContent = 'Failed to add trip: ' + error.message;
        errorDiv.classList.remove('hidden');
    }
});

// View Trip Bookings
window.viewTripBookings = async function(tripId) {
    try {
        const bookingsRef = collection(db, 'bookings');
        const q = query(bookingsRef, where('tripId', '==', tripId));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            alert('No bookings for this trip yet.');
            return;
        }
        
        const bookings = querySnapshot.docs.map(doc => {
            const booking = doc.data();
            return `
                <div class="card" style="margin-bottom: 1rem;">
                    <div class="card-content">
                        <h4>${booking.userName || 'Unknown'}</h4>
                        <p><strong>Email:</strong> ${booking.userEmail || 'N/A'}</p>
                        <p><strong>Phone:</strong> ${booking.userPhone || 'N/A'}</p>
                        <p><strong>Location:</strong> ${booking.userLocation || 'N/A'}</p>
                        <p><strong>Seats:</strong> ${booking.seatsBooked || 0}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        const newWindow = window.open('', '_blank');
        newWindow.document.write(`
            <html>
                <head>
                    <title>Trip Bookings</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; }
                        h1 { color: #006734; }
                    </style>
                </head>
                <body>
                    <h1>Trip Bookings</h1>
                    ${bookings}
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error loading bookings:', error);
        alert('Error loading bookings: ' + error.message);
    }
};

