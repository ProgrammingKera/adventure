import { db, auth } from '../firebase.js';
import { collection, getDocs, query, where, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Navigation state
let currentView = 'cities'; // 'cities', 'agencies', 'trips'
let selectedCity = null;
let selectedAgency = null;
let allTrips = [];
let allAgencies = [];

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

// Load all data
async function loadDestinations() {
    try {
        const citiesContainer = document.getElementById('cities-container');
        
        // Get all trips
        const tripsRef = collection(db, 'trips');
        const tripsSnapshot = await getDocs(tripsRef);
        
        // Get all agencies
        const agenciesRef = collection(db, 'agencies');
        const agenciesSnapshot = await getDocs(agenciesRef);
        
        // Store agencies globally
        allAgencies = [];
        const agenciesMap = {};
        agenciesSnapshot.forEach(doc => {
            const agency = { id: doc.id, ...doc.data() };
            agenciesMap[doc.id] = agency;
            allAgencies.push(agency);
        });
        
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        // Background-migrate: convert string dates to Timestamp for mobile app compatibility
        (async () => {
            try {
                await Promise.all(tripsSnapshot.docs.map(async (d) => {
                    const data = d.data();
                    const updates = {};

                    // Convert string date to Timestamp
                    if (data && typeof data.date === 'string') {
                        const parsed = parseTripDate(data.date);
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

                    // Ensure location fields for mobile compatibility
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
                            await updateDoc(doc(db, 'trips', d.id), updates);
                        } catch (_) {}
                    }
                }));
            } catch (_) {}
        })();

        // Store trips globally
        allTrips = [];
        tripsSnapshot.forEach(doc => {
            const trip = doc.data();
            const d = parseTripDate(trip.date);
            allTrips.push({
                id: doc.id,
                ...trip,
                _parsedDate: d,
                agency: agenciesMap[trip.agencyId]
            });
        });
        
        // Group trips by city
        const tripsByCity = {};
        allTrips.forEach(trip => {
            const city = String(trip.location || 'Other').trim();
            if (!tripsByCity[city]) {
                tripsByCity[city] = [];
            }
            tripsByCity[city].push(trip);
        });
        
        // Build list of cities
        const cityEntries = Object.entries(tripsByCity)
            .map(([city, trips]) => ({ city, count: trips.length }))
            .sort((a, b) => b.count - a.count);

        if (cityEntries.length === 0) {
            citiesContainer.innerHTML = '<p style="padding:1rem; color: var(--text-light);">No destinations available yet.</p>';
            return;
        }
        
        // Render cities
        renderCities(cityEntries);
        
    } catch (error) {
        console.error('Error loading destinations:', error);
        document.getElementById('cities-container').innerHTML = `
            <div class="alert alert-error">
                Error loading destinations. Please try again later.
            </div>
        `;
    }
}

// Render cities list
function renderCities(cityEntries) {
    currentView = 'cities';
    selectedCity = null;
    selectedAgency = null;
    
    // Update breadcrumb
    document.getElementById('breadcrumb-home').style.fontWeight = '700';
    document.getElementById('breadcrumb-home').style.color = 'var(--text-dark)';
    document.getElementById('breadcrumb-sep1').style.display = 'none';
    document.getElementById('breadcrumb-city').style.display = 'none';
    document.getElementById('breadcrumb-sep2').style.display = 'none';
    document.getElementById('breadcrumb-agency').style.display = 'none';
    
    // Show cities, hide agencies
    document.getElementById('cities-container').style.display = 'grid';
    document.getElementById('agencies-container').style.display = 'none';
    
    const citiesContainer = document.getElementById('cities-container');
    citiesContainer.innerHTML = cityEntries.map((item, idx) => `
        <div class="city-card" data-city="${item.city}">
            <div class="city-name">${item.city}</div>
            <div class="city-meta">${item.count} trip(s)</div>
        </div>
    `).join('');
    
    // Update content area
    document.getElementById('content-title').textContent = 'Select a City';
    document.getElementById('content-area').innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">Click on a city to view agencies</p>';
    
    // Attach click handlers
    document.querySelectorAll('.city-card').forEach(card => {
        card.addEventListener('click', () => {
            const city = card.getAttribute('data-city');
            showAgenciesForCity(city);
        });
    });
}

// Show agencies for selected city
function showAgenciesForCity(city) {
    currentView = 'agencies';
    selectedCity = city;
    selectedAgency = null;
    
    // Update breadcrumb
    document.getElementById('breadcrumb-home').style.fontWeight = '600';
    document.getElementById('breadcrumb-home').style.color = 'var(--primary-color)';
    document.getElementById('breadcrumb-sep1').style.display = 'inline';
    document.getElementById('breadcrumb-city').style.display = 'inline';
    document.getElementById('breadcrumb-city').textContent = city;
    document.getElementById('breadcrumb-city').style.fontWeight = '700';
    document.getElementById('breadcrumb-city').style.color = 'var(--text-dark)';
    document.getElementById('breadcrumb-sep2').style.display = 'none';
    document.getElementById('breadcrumb-agency').style.display = 'none';
    
    // Get agencies that have trips in this city
    const cityTrips = allTrips.filter(t => String(t.location || '').trim() === city);
    const agencyIds = [...new Set(cityTrips.map(t => t.agencyId).filter(Boolean))];
    const cityAgencies = allAgencies.filter(a => agencyIds.includes(a.id));
    
    // Count trips per agency
    const agenciesWithCount = cityAgencies.map(agency => {
        const count = cityTrips.filter(t => t.agencyId === agency.id).length;
        return { ...agency, tripCount: count };
    }).sort((a, b) => b.tripCount - a.tripCount);
    
    // Hide cities, show agencies
    document.getElementById('cities-container').style.display = 'none';
    document.getElementById('agencies-container').style.display = 'grid';
    
    const agenciesContainer = document.getElementById('agencies-container');
    if (agenciesWithCount.length === 0) {
        agenciesContainer.innerHTML = '<p style="padding:1rem; color: var(--text-light);">No agencies found for this city.</p>';
        document.getElementById('content-area').innerHTML = '';
        return;
    }
    
    agenciesContainer.innerHTML = agenciesWithCount.map(agency => `
        <div class="city-card" data-agency-id="${agency.id}">
            <div class="city-name">${agency.name || 'Agency'}</div>
            <div class="city-meta">${agency.tripCount} trip(s)</div>
        </div>
    `).join('');
    
    // Update content area
    document.getElementById('content-title').textContent = `${city} - Select Agency`;
    document.getElementById('content-area').innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">Click on an agency to view their trips</p>';
    
    // Attach click handlers
    document.querySelectorAll('[data-agency-id]').forEach(card => {
        card.addEventListener('click', () => {
            const agencyId = card.getAttribute('data-agency-id');
            const agency = allAgencies.find(a => a.id === agencyId);
            showTripsForAgency(city, agency);
        });
    });
}

// Show trips for selected agency in selected city
function showTripsForAgency(city, agency) {
    currentView = 'trips';
    selectedAgency = agency;
    
    // Update breadcrumb
    document.getElementById('breadcrumb-city').style.fontWeight = '600';
    document.getElementById('breadcrumb-city').style.color = 'var(--primary-color)';
    document.getElementById('breadcrumb-sep2').style.display = 'inline';
    document.getElementById('breadcrumb-agency').style.display = 'inline';
    document.getElementById('breadcrumb-agency').textContent = agency.name || 'Agency';
    
    // Filter trips
    const trips = allTrips.filter(t => 
        String(t.location || '').trim() === city && t.agencyId === agency.id
    );
    
    // Update content
    document.getElementById('content-title').textContent = `${agency.name || 'Agency'} - ${city} Trips`;
    renderTrips(trips);
}

// Render trips
function renderTrips(trips) {
    const container = document.getElementById('content-area');
    
    if (!trips || trips.length === 0) {
        container.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">No trips available.</p>';
        return;
    }
    
    // Sort trips
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const sorted = [...trips].sort((a, b) => {
        const da = a._parsedDate;
        const db = b._parsedDate;
        const group = (d) => (d ? (d >= startOfToday ? 0 : 1) : 2);
        const ga = group(da);
        const gb = group(db);
        if (ga !== gb) return ga - gb;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return ga === 0 ? da - db : db - da;
    });
    
    container.innerHTML = sorted.map(trip => {
        const availableSeats = Math.max(0, (trip.totalSeats || 0) - (trip.bookedSeats || 0));
        const d = trip._parsedDate;
        const dateDisplay = d ? d.toLocaleDateString() : 'N/A';
        const priceStr = `PKR ${Number(trip.pricePerSeat || 0).toLocaleString()} / seat`;
        return `
            <div class="card">
                ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" class="card-image">` : ''}
                <div class="card-content">
                    <h4 class="card-title">${trip.description || 'Trip'}</h4>
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

// Breadcrumb navigation
document.getElementById('breadcrumb-home').addEventListener('click', () => {
    if (currentView !== 'cities') {
        loadDestinations();
    }
});

document.getElementById('breadcrumb-city').addEventListener('click', () => {
    if (currentView === 'trips' && selectedCity) {
        showAgenciesForCity(selectedCity);
    }
});

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

