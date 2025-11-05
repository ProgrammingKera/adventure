import { db, auth } from '../firebase.js';
import { collection, getDocs, query, where, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Popular cities in Pakistan
const cities = ['Islamabad', 'Lahore', 'Karachi', 'Hunza', 'Skardu', 'Swat', 'Naran', 'Murree'];

// Shared date parser for both loaders and renderers
function parseTripDate(dateVal) {
    if (!dateVal) return null;
    if (typeof dateVal?.toDate === 'function') return dateVal.toDate();
    if (typeof dateVal === 'string') {
        let s = dateVal
            .replace(/\sUTC[+-]\d+$/i, ' ')
            .replace(/\sat\s/i, ' ')
            .replace(/,/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(dateVal);
    return isNaN(d.getTime()) ? null : d;
}

// Load all trips and group by city
async function loadDestinations() {
    try {
        const citiesContainer = document.getElementById('cities-container');
        
        // Get all trips
        const tripsRef = collection(db, 'trips');
        const tripsSnapshot = await getDocs(tripsRef);
        
        // Get all agencies
        const agenciesRef = collection(db, 'agencies');
        const agenciesSnapshot = await getDocs(agenciesRef);
        
        const agenciesMap = {};
        agenciesSnapshot.forEach(doc => {
            const agency = doc.data();
            agenciesMap[doc.id] = agency;
        });
        
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // Background-migrate: if legacy string dates exist, add parallel Timestamp field without overwriting
        (async () => {
            try {
                await Promise.all(tripsSnapshot.docs.map(async (d) => {
                    const data = d.data();
                    if (data && typeof data.date === 'string' && !data.dateTs) {
                        const parsed = parseTripDate(data.date);
                        if (parsed) {
                            try { await updateDoc(doc(db, 'trips', d.id), { dateTs: Timestamp.fromDate(parsed) }); } catch (_) {}
                        }
                    }
                }));
            } catch (_) {}
        })();

        // Group trips by location
        const tripsByCity = {};
        
        tripsSnapshot.forEach(doc => {
            const trip = doc.data();
            const rawLocation = trip.location || 'Other';
            const displayLocation = String(rawLocation).trim();
            const d = parseTripDate(trip.date);

            if (!tripsByCity[displayLocation]) {
                tripsByCity[displayLocation] = [];
            }

            tripsByCity[displayLocation].push({
                id: doc.id,
                ...trip,
                _parsedDate: d, // attach parsed date for sorting
                agency: agenciesMap[trip.agencyId]
            });
        });
        
        // Build list of cities sorted by number of trips
        const cityEntries = Object.entries(tripsByCity)
            .map(([city, arr]) => ({ city, trips: arr }))
            .sort((a, b) => b.trips.length - a.trips.length);

        if (cityEntries.length === 0) {
            citiesContainer.innerHTML = '<p style="padding:1rem; color: var(--text-light);">No trips available yet.</p>';
            return;
        }
        
        // Render city cards
        citiesContainer.innerHTML = cityEntries.map((item, idx) => `
            <div class="city-card ${idx===0 ? 'active' : ''}" data-city="${item.city}">
                <div class="city-name">${item.city}</div>
                <div class="city-meta">${item.trips.length} trip(s)</div>
            </div>
        `).join('');

        // Render first city by default
        renderCityTrips(cityEntries[0].city, cityEntries[0].trips);

        // Attach handlers
        document.querySelectorAll('.city-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.city-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                const name = card.getAttribute('data-city');
                renderCityTrips(name, tripsByCity[name]);
            });
        });
        
    } catch (error) {
        console.error('Error loading destinations:', error);
        document.getElementById('cities-container').innerHTML = `
            <div class="alert alert-error">
                Error loading destinations. Please try again later.
            </div>
        `;
    }
}

function renderCityTrips(city, trips) {
    document.getElementById('city-title').textContent = city + ' Trips';
    const container = document.getElementById('city-trips');
    if (!trips || trips.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light);">No trips for this city yet.</p>';
        return;
    }
    // Sort: upcoming first (earliest to latest), then past (latest to earliest), then undated
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const getDate = (t) => t._parsedDate ?? parseTripDate(t.date);
    const sorted = [...trips].sort((a, b) => {
        const da = a.dateTs?.toDate ? a.dateTs.toDate() : getDate(a);
        const db = b.dateTs?.toDate ? b.dateTs.toDate() : getDate(b);
        const group = (d) => (d ? (d >= startOfToday ? 0 : 1) : 2);
        const ga = group(da);
        const gb = group(db);
        if (ga !== gb) return ga - gb;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        // Upcoming: earlier first; Past: later first
        return ga === 0 ? da - db : db - da;
    });

    container.innerHTML = sorted.map(trip => {
        const availableSeats = Math.max(0, (trip.totalSeats || 0) - (trip.bookedSeats || 0));
        const d = parseTripDate(trip.date);
        const dateDisplay = d ? d.toLocaleDateString() : 'N/A';
        const priceStr = `PKR ${Number(trip.pricePerSeat || 0).toLocaleString()} / seat`;
        return `
            <div class="card">
                ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" class="card-image">` : ''}
                <div class="card-content">
                    <h4 class="card-title">${trip.description || 'Trip'}</h4>
                    <div class="card-text"><strong>Agency:</strong> ${trip.agency?.name || 'N/A'}</div>
                    <div class="card-text"><strong>Departure:</strong> ${trip.departure || 'N/A'}</div>
                    <div class="card-meta">
                        <span><strong>Seats:</strong> ${availableSeats}/${trip.totalSeats || 0}</span>
                        <span><strong>Date:</strong> ${dateDisplay}</span>
                    </div>
                    <div style="display:flex; justify-content: space-between; align-items:center; margin-top: .5rem;">
                        <div class="card-price">${priceStr}</div>
                        ${availableSeats > 0 ? `
                            <a class="btn btn-primary" style="min-width: 140px;" href="booking.html?tripId=${trip.id}">Book Now</a>
                        ` : `
                            <button class="btn btn-secondary" disabled>Sold Out</button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Global function for booking
window.bookTrip = async function(tripId) {
    const user = auth.currentUser;
    if (!user) {
        alert('Please login to book a trip');
        window.location.href = 'profile.html';
        return;
    }
    
    try {
        // Get trip details
        const tripDoc = await getDoc(doc(db, 'trips', tripId));
        
        if (!tripDoc.exists()) {
            alert('Trip not found');
            return;
        }
        
        const trip = tripDoc.data();
        const availableSeats = (trip.totalSeats || 0) - (trip.bookedSeats || 0);
        
        if (availableSeats <= 0) {
            alert('Sorry, this trip is fully booked.');
            return;
        }
        
        const seatsInput = prompt(`How many seats would you like to book? (Available: ${availableSeats})`);
        if (!seatsInput) return;
        
        const seatsToBook = parseInt(seatsInput);
        if (isNaN(seatsToBook) || seatsToBook <= 0) {
            alert('Please enter a valid number of seats');
            return;
        }
        
        if (seatsToBook > availableSeats) {
            alert(`Only ${availableSeats} seat(s) available.`);
            return;
        }
        
        // Get user details
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : {};
        
        // Create booking
        await addDoc(collection(db, 'bookings'), {
            tripId: tripId,
            userId: user.uid,
            userName: userData.name || user.displayName || 'Unknown',
            userEmail: userData.email || user.email || 'N/A',
            userPhone: userData.phone || null,
            userLocation: userData.city || null,
            seatsBooked: seatsToBook,
            createdAt: serverTimestamp()
        });
        
        // Update trip booked seats
        await updateDoc(doc(db, 'trips', tripId), {
            bookedSeats: increment(seatsToBook)
        });
        
        alert(`Successfully booked ${seatsToBook} seat(s)!`);
        
        // Reload destinations to update seat counts
        loadDestinations();
    } catch (error) {
        console.error('Error booking trip:', error);
        alert('Failed to book trip: ' + error.message);
    }
};

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        const profileLink = document.getElementById('profile-link');
        if (profileLink) {
            profileLink.textContent = 'Profile';
        }
    }
});

// Initialize page
loadDestinations();

