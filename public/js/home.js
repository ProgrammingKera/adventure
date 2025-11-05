import { db, auth } from '../firebase.js';
import { collection, getDocs, query, limit, orderBy, updateDoc, doc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Travel tips data (can be replaced with actual Firestore data)
const travelTips = [
    {
        title: "Best Time to Visit",
        content: "The best time to visit Pakistan is from October to April when the weather is pleasant."
    },
    {
        title: "Travel Insurance",
        content: "Always get travel insurance before your trip to protect yourself from unexpected events."
    },
    {
        title: "Local Currency",
        content: "Pakistani Rupee (PKR) is the local currency. Exchange rates vary, so check before traveling."
    },
    {
        title: "Respect Local Culture",
        content: "Pakistan has a rich cultural heritage. Dress modestly and respect local customs and traditions."
    }
];

// Load travel tips
function loadTravelTips() {
    const tipsContainer = document.getElementById('tips-container');
    tipsContainer.innerHTML = travelTips.map(tip => `
        <div class="tip-card">
            <h3>${tip.title}</h3>
            <p>${tip.content}</p>
        </div>
    `).join('');
}

// Load featured trips from Firestore
async function loadFeaturedTrips() {
    try {
        const tripsContainer = document.getElementById('trips-container');
        tripsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading trips...</p></div>';
        
        const tripsRef = collection(db, 'trips');
        // Don't use orderBy on date string - just get all and sort in memory
        const querySnapshot = await getDocs(tripsRef);
        
        if (querySnapshot.empty) {
            tripsContainer.innerHTML = '<p style="text-align: center; grid-column: 1/-1; padding: 2rem;">No trips available yet. Check back soon!</p>';
            return;
        }
        
        // Helper: parse stored trip date to Date object
        const parseTripDate = (dateVal) => {
            if (!dateVal) return null;
            if (typeof dateVal?.toDate === 'function') return dateVal.toDate();
            const tryNative = (s) => {
                const d = new Date(s);
                return isNaN(d.getTime()) ? null : d;
            };
            if (typeof dateVal === 'string') {
                // 1) Strip trailing UTC offset like " UTC+5"
                let s = dateVal.replace(/\sUTC[+-]\d+$/i, '').trim();
                // 2) Try native parse first
                let d = tryNative(s);
                if (d) return d;
                // 3) Handle formats like "December 5, 2025, 05:00:00 PM" or with "at"
                s = s.replace(/\sat\s/i, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
                // Extract MonthName Day Year optionally followed by time
                const monthNames = {
                    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
                    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
                };
                const m = s.match(/^(\w+)\s(\d{1,2})\s(\d{4})(?:\s(\d{1,2}):(\d{2})(?::(\d{2}))?\s?(AM|PM)?)?$/i);
                if (m) {
                    const mon = monthNames[m[1].toLowerCase()];
                    const day = parseInt(m[2]);
                    const year = parseInt(m[3]);
                    let hours = 0, minutes = 0, seconds = 0;
                    if (m[4] && m[5]) {
                        hours = parseInt(m[4]);
                        minutes = parseInt(m[5]);
                        seconds = m[6] ? parseInt(m[6]) : 0;
                        const ampm = (m[7] || '').toUpperCase();
                        if (ampm === 'PM' && hours < 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                    }
                    const built = new Date(year, mon, day, hours, minutes, seconds);
                    return isNaN(built.getTime()) ? null : built;
                }
                return null;
            }
            const d = new Date(dateVal);
            return isNaN(d.getTime()) ? null : d;
        };

        const now = new Date();

        // Background-migrate: convert string dates to Timestamp for mobile app compatibility
        (async () => {
            try {
                await Promise.all(querySnapshot.docs.map(async (d) => {
                    const data = d.data();
                    const updates = {};

                    // Convert string date to Timestamp
                    if (data && typeof data.date === 'string') {
                        const parsed = parseTripDate(data.date);
                        if (parsed) {
                            updates.date = Timestamp.fromDate(parsed);
                        }
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

        // Keep only upcoming/valid trips, sort by soonest date, then limit to 6
        const sortedDocs = querySnapshot.docs
            .filter(doc => {
                const d = parseTripDate(doc.data().date);
                return d && d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
            })
            .sort((a, b) => {
                const da = parseTripDate(a.data().date) || new Date(8640000000000000);
                const db = parseTripDate(b.data().date) || new Date(8640000000000000);
                return da.getTime() - db.getTime(); // earliest first
            })
            .slice(0, 6);
        
        tripsContainer.innerHTML = sortedDocs.map(doc => {
            const trip = doc.data();
            const availableSeats = Math.max(0, (trip.totalSeats || 0) - (trip.bookedSeats || 0));
            const dateObj = parseTripDate(trip.date);
            const dateDisplay = dateObj ? dateObj.toLocaleDateString() : 'N/A';
            const priceStr = `PKR ${Number(trip.pricePerSeat || 0).toLocaleString()} / seat`;
            const titleLocation = trip.location || 'N/A';
            const subtitle = trip.description || '';
            const departure = trip.departure || 'N/A';

            return `
                <div class="card">
                    ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${subtitle || 'Trip'}" class="card-image">` : ''}
                    <div class="card-content">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap: .75rem;">
                            <h3 class="card-title" style="margin:0;">${titleLocation}</h3>
                            <div class="card-price" style="white-space:nowrap;">${priceStr.replace(' / seat','')} <span style="color:#6c757d; font-weight:500;">/ seat</span></div>
                        </div>
                        ${subtitle ? `<div class="card-text" style="margin-top:.35rem;">${subtitle}</div>` : ''}
                        <div class="card-meta" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:.5rem; margin-top:.5rem;">
                            <div><strong>Departure:</strong> ${departure}</div>
                            <div><strong>Seats:</strong> ${availableSeats} available</div>
                            <div><strong>Date:</strong> ${dateDisplay}</div>
                        </div>
                        <div style="display:flex; justify-content:flex-end; align-items:center; margin-top: .75rem;">
                            ${availableSeats > 0 ? `
                                <a class="btn btn-primary" style="min-width: 140px;" href="booking.html?tripId=${doc.id}">Book Now</a>
                            ` : `
                                <button class="btn btn-secondary" disabled>Sold Out</button>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading trips:', error);
        document.getElementById('trips-container').innerHTML = 
            '<p style="text-align: center; grid-column: 1/-1; color: red;">Error loading trips. Please try again later.</p>';
    }
}

// Book trip function for home page
window.bookTripFromHome = async function(tripId) {
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
        
        // Show booking modal/form
        const userLocation = prompt('Enter your location/address:');
        if (!userLocation || userLocation.trim() === '') {
            alert('Location is required to complete booking');
            return;
        }
        
        const seatsInput = prompt(`How many seats would you like to book?\n\nAvailable: ${availableSeats}\nPrice per seat: PKR ${trip.pricePerSeat || 0}`);
        
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
        
        // Calculate total cost
        const totalCost = (trip.pricePerSeat || 0) * seatsToBook;
        
        // Confirm booking
        const confirmBooking = confirm(
            `Confirm Booking:\n\n` +
            `Trip: ${trip.description || 'Trip'}\n` +
            `Location: ${trip.location || 'N/A'}\n` +
            `Seats: ${seatsToBook}\n` +
            `Price per seat: PKR ${trip.pricePerSeat || 0}\n` +
            `Total Cost: PKR ${totalCost}\n` +
            `Your Location: ${userLocation}\n\n` +
            `Click OK to confirm booking.`
        );
        
        if (!confirmBooking) return;
        
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
            userLocation: userLocation.trim(),
            seatsBooked: seatsToBook,
            createdAt: serverTimestamp()
        });
        
        // Update trip booked seats
        await updateDoc(doc(db, 'trips', tripId), {
            bookedSeats: increment(seatsToBook)
        });
        
        alert(`✅ Successfully booked ${seatsToBook} seat(s)!\n\nTotal Cost: PKR ${totalCost}\n\nYour booking has been confirmed.`);
        
        // Reload trips to update seat counts
        loadFeaturedTrips();
    } catch (error) {
        console.error('Error booking trip:', error);
        alert('Failed to book trip: ' + error.message);
    }
};

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        const profileLink = document.getElementById('profile-link');
        profileLink.textContent = 'Profile';
    }
});

// Initialize page
loadTravelTips();
loadFeaturedTrips();

