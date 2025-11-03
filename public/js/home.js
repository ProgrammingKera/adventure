import { db, auth } from '../firebase.js';
import { collection, getDocs, query, limit, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
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
        
        // Sort trips by date (most recent first) and limit to 6
        const sortedDocs = querySnapshot.docs
            .sort((a, b) => {
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
            })
            .slice(0, 6);
        
        tripsContainer.innerHTML = sortedDocs.map(doc => {
            const trip = doc.data();
            const availableSeats = (trip.totalSeats || 0) - (trip.bookedSeats || 0);
            
            return `
                <div class="card">
                    ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" class="card-image">` : ''}
                    <div class="card-content">
                        <h3 class="card-title">${trip.description || 'Trip'}</h3>
                        <div class="card-text"><strong>Location:</strong> ${trip.location || 'N/A'}</div>
                        <div class="card-text"><strong>Departure:</strong> ${trip.departure || 'N/A'}</div>
                        <div class="card-meta">
                            <span><strong>Seats:</strong> ${availableSeats} available</span>
                            <span><strong>Date:</strong> ${trip.date ? (typeof trip.date === 'string' ? trip.date.split(' at ')[0] : new Date(trip.date).toLocaleDateString()) : 'N/A'}</span>
                        </div>
                        <div style="display:flex; justify-content: space-between; align-items:center; margin-top: .5rem;">
                            <div class="card-price">PKR ${trip.pricePerSeat || 0} / seat</div>
                            ${availableSeats > 0 ? `
                                <a class="btn btn-primary" style="min-width: 140px;" href="booking.html?tripId=${doc.id}">
                                    Book Now
                                </a>
                            ` : `
                                <button class="btn btn-secondary" disabled>
                                    Sold Out
                                </button>
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

