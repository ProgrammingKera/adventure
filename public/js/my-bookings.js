import { db, auth } from '../firebase.js';
import { collection, query, where, getDocs, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let currentUser = null;

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    currentUser = user;
    loadMyBookings();
});

async function loadMyBookings() {
    const container = document.getElementById('bookings-container');
    
    try {
        // Get all bookings for current user
        const bookingsRef = collection(db, 'bookings');
        const q = query(bookingsRef, where('userId', '==', currentUser.uid));
        const bookingsSnapshot = await getDocs(q);
        
        if (bookingsSnapshot.empty) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">No bookings yet. <a href="explore.html" style="color: var(--primary-color); text-decoration: none; font-weight: 600;">Explore trips</a></p>';
            return;
        }
        
        // Get trip details for each booking
        const bookingsWithTrips = [];
        for (const bookingDoc of bookingsSnapshot.docs) {
            const booking = { id: bookingDoc.id, ...bookingDoc.data() };
            
            // Get trip details
            const tripDoc = await getDoc(doc(db, 'trips', booking.tripId));
            if (tripDoc.exists()) {
                booking.trip = { id: tripDoc.id, ...tripDoc.data() };
            }
            
            bookingsWithTrips.push(booking);
        }
        
        // Render bookings
        renderBookings(bookingsWithTrips);
        
    } catch (error) {
        console.error('Error loading bookings:', error);
        container.innerHTML = '<div class="alert alert-error">Error loading bookings. Please try again.</div>';
    }
}

function renderBookings(bookings) {
    const container = document.getElementById('bookings-container');
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
            ${bookings.map(booking => {
                const trip = booking.trip || {};
                const bookingDate = booking.createdAt?.toDate ? booking.createdAt.toDate().toLocaleDateString() : 'N/A';
                
                return `
                    <div class="card" style="display: flex; flex-direction: column; height: 100%;">
                        ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 8px 8px 0 0;">` : ''}
                        <div class="card-content" style="flex: 1; display: flex; flex-direction: column;">
                            <h4 class="card-title" style="margin-bottom: 0.75rem;">${trip.description || 'Trip'}</h4>
                            <div class="card-text" style="margin-bottom: 0.5rem;"><strong><i class="fa-solid fa-location-dot" style="color: var(--primary-color); margin-right: 0.5rem;"></i>Location:</strong> ${trip.location || 'N/A'}</div>
                            <div class="card-text" style="margin-bottom: 0.5rem;"><strong><i class="fa-solid fa-calendar" style="color: var(--primary-color); margin-right: 0.5rem;"></i>Departure:</strong> ${trip.departure || 'N/A'}</div>
                            <div class="card-text" style="margin-bottom: 0.5rem;"><strong><i class="fa-solid fa-chair" style="color: var(--primary-color); margin-right: 0.5rem;"></i>Seats:</strong> ${booking.seatsBooked || 0}</div>
                            <div class="card-text" style="margin-bottom: 0.5rem;"><strong><i class="fa-solid fa-tag" style="color: var(--primary-color); margin-right: 0.5rem;"></i>Price/Seat:</strong> PKR ${Number(trip.pricePerSeat || 0).toLocaleString()}</div>
                            <div class="card-text" style="margin-bottom: 0.5rem; color: var(--primary-color); font-weight: 700;"><strong><i class="fa-solid fa-receipt" style="margin-right: 0.5rem;"></i>Total:</strong> PKR ${Number((trip.pricePerSeat || 0) * (booking.seatsBooked || 0)).toLocaleString()}</div>
                            <div class="card-text" style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 1rem;"><i class="fa-solid fa-clock" style="margin-right: 0.5rem;"></i>Booked: ${bookingDate}</div>
                            <div style="margin-top: auto; padding-top: 1rem; border-top: 1px solid #e9ecef;">
                                <button class="btn btn-primary" style="width: 100%; cursor: pointer;" onclick="viewTripDetails('${booking.tripId}')">View Details</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Make function global so it can be called from HTML
window.viewTripDetails = async function(tripId) {
    try {
        // Get trip details from Firestore
        const tripDoc = await getDoc(doc(db, 'trips', tripId));
        if (!tripDoc.exists()) {
            alert('Trip not found');
            return;
        }
        
        const trip = { id: tripDoc.id, ...tripDoc.data() };
        
        // Get booking details for this trip
        const bookingsRef = collection(db, 'bookings');
        const q = query(bookingsRef, where('tripId', '==', tripId), where('userId', '==', currentUser.uid));
        const bookingsSnapshot = await getDocs(q);
        
        let bookedSeats = 0;
        if (!bookingsSnapshot.empty) {
            bookedSeats = bookingsSnapshot.docs[0].data().seatsBooked || 0;
        }
        
        showTripDetailsModal(trip, bookedSeats);
    } catch (error) {
        console.error('Error loading trip details:', error);
        alert('Error loading trip details');
    }
};

function showTripDetailsModal(trip, bookedSeats = 0) {
    const modalHTML = `
        <div id="trip-details-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 1rem;" onclick="if(event.target.id==='trip-details-modal') this.remove();">
            <div style="background: white; border-radius: 16px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3);" onclick="event.stopPropagation();">
                <div style="position: sticky; top: 0; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); color: white; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; border-radius: 16px 16px 0 0;">
                    <h2 style="margin: 0; font-size: 1.5rem;">${trip.description || 'Trip Details'}</h2>
                    <button onclick="document.getElementById('trip-details-modal').remove()" style="background: none; border: none; color: white; font-size: 1.8rem; cursor: pointer; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">&times;</button>
                </div>
                
                <div style="padding: 2rem;">
                    ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description}" style="width: 100%; height: 250px; object-fit: cover; border-radius: 12px; margin-bottom: 1.5rem;">` : ''}
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="background: #f8f9ff; padding: 1rem; border-radius: 10px; border-left: 4px solid var(--primary-color);">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem;"><i class="fa-solid fa-location-dot" style="margin-right: 0.5rem;"></i>Location</div>
                            <div style="font-weight: 700; color: #1a202c;">${trip.location || 'N/A'}</div>
                        </div>
                        <div style="background: #f8f9ff; padding: 1rem; border-radius: 10px; border-left: 4px solid var(--primary-color);">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem;"><i class="fa-solid fa-calendar" style="margin-right: 0.5rem;"></i>Departure</div>
                            <div style="font-weight: 700; color: #1a202c;">${trip.departure || 'N/A'}</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 1rem; border-radius: 10px; border-left: 4px solid var(--primary-color);">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem;"><i class="fa-solid fa-check-circle" style="margin-right: 0.5rem;"></i>My Booked Seats</div>
                            <div style="font-weight: 700; color: var(--primary-color); font-size: 1.2rem;">${bookedSeats}</div>
                        </div>
                        <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 1rem; border-radius: 10px; border-left: 4px solid #FF9800;">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem;"><i class="fa-solid fa-money-bill" style="margin-right: 0.5rem;"></i>Amount Paid</div>
                            <div style="font-weight: 700; color: #FF9800; font-size: 1.2rem;">PKR ${Number((trip.pricePerSeat || 0) * bookedSeats).toLocaleString()}</div>
                        </div>
                    </div>
                    
                    ${trip.duration ? `
                        <div style="background: #f8f9ff; padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.5rem;"><i class="fa-solid fa-hourglass-end" style="margin-right: 0.5rem;"></i>Duration</div>
                            <div style="font-weight: 600; color: #1a202c;">${trip.duration}</div>
                        </div>
                    ` : ''}
                    
                    ${trip.description ? `
                        <div style="background: #f8f9ff; padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.5rem; font-weight: 600;"><i class="fa-solid fa-info-circle" style="margin-right: 0.5rem;"></i>Description</div>
                            <div style="color: #4a5568; line-height: 1.6;">${trip.description}</div>
                        </div>
                    ` : ''}
                    
                    ${trip.itinerary ? `
                        <div style="background: #f8f9ff; padding: 1rem; border-radius: 10px; margin-bottom: 1.5rem;">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.5rem; font-weight: 600;"><i class="fa-solid fa-list" style="margin-right: 0.5rem;"></i>Itinerary</div>
                            <div style="color: #4a5568; line-height: 1.6; white-space: pre-wrap;">${trip.itinerary}</div>
                        </div>
                    ` : ''}
                    
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button onclick="document.getElementById('trip-details-modal').remove()" class="btn btn-secondary" style="flex: 1; cursor: pointer;">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}