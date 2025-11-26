import { db, auth } from '../firebase.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
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
                const paymentStatus = booking.paymentStatus || 'pending';
                
                // Determine payment status badge color and text
                let paymentBadgeColor, paymentBadgeText, paymentBadgeIcon;
                if (paymentStatus === 'completed' || paymentStatus === 'succeeded') {
                    paymentBadgeColor = '#22c55e';
                    paymentBadgeText = 'Paid';
                    paymentBadgeIcon = 'fa-check-circle';
                } else if (paymentStatus === 'failed') {
                    paymentBadgeColor = '#ef4444';
                    paymentBadgeText = 'Failed';
                    paymentBadgeIcon = 'fa-times-circle';
                } else {
                    paymentBadgeColor = '#f59e0b';
                    paymentBadgeText = 'Pending';
                    paymentBadgeIcon = 'fa-clock';
                }
                
                return `
                    <div class="card" style="display: flex; flex-direction: column; height: 100%; position: relative;">
                        ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" style="width: 100%; height: 180px; object-fit: cover; border-radius: 8px 8px 0 0;">` : ''}
                        <div style="position: absolute; top: 10px; right: 10px; background: ${paymentBadgeColor}; color: white; padding: 0.4rem 0.8rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700; display: flex; align-items: center; gap: 0.4rem; box-shadow: 0 2px 8px rgba(0,0,0,0.2);"><i class="fa-solid ${paymentBadgeIcon}"></i>${paymentBadgeText}</div>
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
        
        let booking = {};
        let bookingId = null;
        if (!bookingsSnapshot.empty) {
            bookingId = bookingsSnapshot.docs[0].id;
            booking = bookingsSnapshot.docs[0].data();
        }
        
        showTripDetailsModal(trip, booking, bookingId);
    } catch (error) {
        console.error('Error loading trip details:', error);
        alert('Error loading trip details');
    }
};

function showTripDetailsModal(trip, booking = {}, bookingId = null) {
    const bookedSeats = booking.seatsBooked || 0;
    const paymentStatus = booking.paymentStatus || 'pending';
    const totalAmount = (trip.pricePerSeat || 0) * bookedSeats;
    const isManualPayment = paymentStatus === 'pending' || paymentStatus === 'manual';
    
    const tripTotalSeats = trip.totalSeats || 0;
    const tripBookedSeats = trip.bookedSeats || 0;
    const availableSeats = Math.max(0, tripTotalSeats - tripBookedSeats);
    const maxSeatsForUser = Math.max(1, bookedSeats + availableSeats);
    
    // Determine payment status for display
    let amountDisplayText, amountDisplayColor;
    if (paymentStatus === 'completed' || paymentStatus === 'succeeded') {
        amountDisplayText = `PKR ${Number(totalAmount).toLocaleString()}`;
        amountDisplayColor = '#FF9800';
    } else if (paymentStatus === 'failed') {
        amountDisplayText = `PKR ${Number(totalAmount).toLocaleString()} (Failed)`;
        amountDisplayColor = '#ef4444';
    } else {
        amountDisplayText = `PKR ${Number(totalAmount).toLocaleString()} (Pending - Manual)`;
        amountDisplayColor = '#f59e0b';
    }
    
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
                        <div style="background: linear-gradient(135deg, ${amountDisplayColor}20 0%, ${amountDisplayColor}10 100%); padding: 1rem; border-radius: 10px; border-left: 4px solid ${amountDisplayColor};">
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem;"><i class="fa-solid fa-money-bill" style="margin-right: 0.5rem;"></i>Amount</div>
                            <div style="font-weight: 700; color: ${amountDisplayColor}; font-size: 1.2rem;">${amountDisplayText}</div>
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
                        ${isManualPayment && bookingId ? `
                            <button onclick="window.editBooking('${bookingId}', '${trip.id}', ${bookedSeats}, ${maxSeatsForUser}, ${trip.pricePerSeat || 0})" class="btn btn-primary" style="flex: 1; cursor: pointer;">
                                <i class="fa-solid fa-edit" style="margin-right: 0.5rem;"></i>Edit Booking
                            </button>
                        ` : ''}
                        <button onclick="document.getElementById('trip-details-modal').remove()" class="btn btn-secondary" style="flex: 1; cursor: pointer;">Close</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Custom modal helper functions
function showCustomModal(title, message, type = 'info') {
    const modalId = 'custom-modal-' + Date.now();
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    const colors = {
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    const modalHTML = `
        <div id="${modalId}" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1rem;">
            <div style="background: white; border-radius: 12px; max-width: 400px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.2); animation: modalSlideIn 0.3s ease-out;">
                <div style="padding: 2rem; text-align: center;">
                    <div style="width: 60px; height: 60px; margin: 0 auto 1.5rem; background: ${colors[type]}20; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid ${icons[type]}" style="font-size: 1.8rem; color: ${colors[type]};"></i>
                    </div>
                    <h3 style="margin: 0 0 1rem 0; color: #1a202c; font-size: 1.3rem;">${title}</h3>
                    <p style="margin: 0 0 2rem 0; color: #6b7280; line-height: 1.6; white-space: pre-line;">${message}</p>
                    <button onclick="document.getElementById('${modalId}').remove()" style="background: ${colors[type]}; color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: all 0.2s;">
                        OK
                    </button>
                </div>
            </div>
        </div>
        <style>
            @keyframes modalSlideIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
        </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Auto-remove after 3 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            const modalElement = document.getElementById(modalId);
            if (modalElement) modalElement.remove();
        }, 3000);
    }
}

function showEditModal(currentSeats, totalSeats, pricePerSeat) {
    return new Promise((resolve) => {
        const modalId = 'edit-modal-' + Date.now();
        
        // Store resolve function globally for this modal
        window[`editModalResolve_${modalId}`] = resolve;
        
        const modalHTML = `
            <div id="${modalId}" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1rem;">
                <div style="background: white; border-radius: 16px; max-width: 450px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: modalSlideIn 0.3s ease-out;">
                    <div style="padding: 2rem;">
                        <div style="text-align: center; margin-bottom: 2rem;">
                            <div style="width: 70px; height: 70px; margin: 0 auto 1rem; background: linear-gradient(135deg, #006734 0%, #004d26 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fa-solid fa-chair" style="font-size: 2rem; color: white;"></i>
                            </div>
                            <h3 style="margin: 0 0 0.5rem 0; color: #1a202c; font-size: 1.5rem;">Edit Your Booking</h3>
                            <p style="margin: 0; color: #6b7280;">Change the number of seats for your trip</p>
                        </div>
                        
                        <div style="background: #f8f9ff; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                                <span style="color: #6b7280;">Current seats:</span>
                                <span style="font-weight: 700; color: #006734;">${currentSeats}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: #6b7280;">Available seats:</span>
                                <span style="font-weight: 700; color: #006734;">${totalSeats}</span>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; margin-bottom: 0.5rem; color: #374151; font-weight: 600;">New number of seats:</label>
                            <input type="number" id="seats-input-${modalId}" min="1" max="${totalSeats}" value="${currentSeats}" 
                                style="width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 1rem; transition: border-color 0.2s;"
                                onfocus="this.style.borderColor='#006734'" onblur="this.style.borderColor='#e5e7eb'">
                            <div style="font-size: 0.85rem; color: #6b7280; margin-top: 0.5rem;">Enter a number between 1 and ${totalSeats}</div>
                        </div>
                        
                        <div style="display: flex; gap: 1rem;">
                            <button onclick="document.getElementById('${modalId}').remove(); window.editModalResolve_${modalId}(null)" 
                                style="flex: 1; padding: 0.75rem; border: 2px solid #e5e7eb; background: white; color: #6b7280; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: all 0.2s;">
                                Cancel
                            </button>
                            <button id="update-btn-${modalId}" style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #006734 0%, #004d26 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: all 0.2s;">
                                Update Seats
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes modalSlideIn {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add event listener to Update button
        setTimeout(() => {
            const updateBtn = document.getElementById(`update-btn-${modalId}`);
            if (updateBtn) {
                updateBtn.addEventListener('click', () => {
                    const input = document.getElementById(`seats-input-${modalId}`);
                    const value = parseInt(input.value);
                    if (value && value > 0 && value <= totalSeats) {
                        document.getElementById(`${modalId}`).remove();
                        resolve(value);
                    } else {
                        input.style.borderColor = '#ef4444';
                        setTimeout(() => input.style.borderColor = '#e5e7eb', 2000);
                    }
                });
            }
            
            // Focus input
            const input = document.getElementById(`seats-input-${modalId}`);
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
        
        // Cleanup function
        const cleanup = () => {
            delete window[`editModalResolve_${modalId}`];
        };
        
        // Auto cleanup when modal is removed
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const modalElement = document.getElementById(modalId);
                    if (!modalElement) {
                        cleanup();
                        observer.disconnect();
                    }
                }
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

function showConfirmModal(currentSeats, newSeats, pricePerSeat) {
    return new Promise((resolve) => {
        const modalId = 'confirm-modal-' + Date.now();
        const priceDiff = Math.abs((newSeats - currentSeats) * pricePerSeat);
        const totalPrice = newSeats * pricePerSeat;
        
        // Store resolve function globally for this modal
        window[`confirmModalResolve_${modalId}`] = resolve;
        
        const modalHTML = `
            <div id="${modalId}" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1rem;">
                <div style="background: white; border-radius: 16px; max-width: 450px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); animation: modalSlideIn 0.3s ease-out;">
                    <div style="padding: 2rem;">
                        <div style="text-align: center; margin-bottom: 2rem;">
                            <div style="width: 70px; height: 70px; margin: 0 auto 1rem; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <i class="fa-solid fa-question" style="font-size: 2rem; color: white;"></i>
                            </div>
                            <h3 style="margin: 0 0 0.5rem 0; color: #1a202c; font-size: 1.5rem;">Confirm Booking Change</h3>
                            <p style="margin: 0; color: #6b7280;">Please review your booking changes</p>
                        </div>
                        
                        <div style="background: #f8f9ff; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                                <span style="color: #6b7280;">From:</span>
                                <span style="font-weight: 700; color: #ef4444;">${currentSeats} seats</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                                <span style="color: #6b7280;">To:</span>
                                <span style="font-weight: 700; color: #22c55e;">${newSeats} seats</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                                <span style="color: #6b7280;">Price difference:</span>
                                <span style="font-weight: 700; color: #f59e0b;">PKR ${priceDiff.toLocaleString()}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding-top: 1rem; border-top: 2px solid #e5e7eb;">
                                <span style="color: #1a202c; font-weight: 600;">New total price:</span>
                                <span style="font-weight: 700; color: #006734; font-size: 1.1rem;">PKR ${totalPrice.toLocaleString()}</span>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 1rem;">
                            <button id="cancel-confirm-${modalId}" 
                                style="flex: 1; padding: 0.75rem; border: 2px solid #e5e7eb; background: white; color: #6b7280; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: all 0.2s;">
                                Cancel
                            </button>
                            <button id="confirm-confirm-${modalId}" 
                                style="flex: 1; padding: 0.75rem; background: linear-gradient(135deg, #006734 0%, #004d26 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: 600; transition: all 0.2s;">
                                Confirm Change
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes modalSlideIn {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            </style>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add event listeners to buttons
        setTimeout(() => {
            const cancelBtn = document.getElementById(`cancel-confirm-${modalId}`);
            const confirmBtn = document.getElementById(`confirm-confirm-${modalId}`);
            
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    document.getElementById(`${modalId}`).remove();
                    resolve(false);
                });
            }
            
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    document.getElementById(`${modalId}`).remove();
                    resolve(true);
                });
            }
        }, 100);
        
        // Cleanup function
        const cleanup = () => {
            delete window[`confirmModalResolve_${modalId}`];
        };
        
        // Auto cleanup when modal is removed
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const modalElement = document.getElementById(modalId);
                    if (!modalElement) {
                        cleanup();
                        observer.disconnect();
                    }
                }
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

window.editBooking = async function(bookingId, tripId, currentSeats, totalSeats, pricePerSeat) {
    try {
        console.log('Edit booking started:', { bookingId, tripId, currentSeats, totalSeats, pricePerSeat });
        
        // Show edit modal
        const newSeats = await showEditModal(currentSeats, totalSeats, pricePerSeat);
        console.log('New seats from modal:', newSeats);
        
        if (newSeats === null) {
            return; // User cancelled
        }
        
        if (newSeats === currentSeats) {
            showCustomModal('No Changes', 'You entered the same number of seats. No changes were made.', 'info');
            return;
        }
        
        // Show confirmation modal
        const confirmed = await showConfirmModal(currentSeats, newSeats, pricePerSeat);
        
        if (!confirmed) {
            return; // User cancelled confirmation
        }
        
        // Update booking
        const seatDifference = newSeats - currentSeats;
        console.log('Seat difference:', seatDifference);
        console.log('Updating booking:', bookingId, 'with seats:', newSeats);
        console.log('Updating trip:', tripId, 'with increment:', seatDifference);
        
        try {
            const bookingRef = doc(db, 'bookings', bookingId);
            console.log('Booking ref:', bookingRef);
            await updateDoc(bookingRef, {
                seatsBooked: newSeats
            });
            console.log('Booking updated successfully');
        } catch (bookingError) {
            console.error('Error updating booking:', bookingError);
            throw bookingError;
        }
        
        try {
            const tripRef = doc(db, 'trips', tripId);
            console.log('Trip ref:', tripRef);
            await updateDoc(tripRef, {
                bookedSeats: increment(seatDifference)
            });
            console.log('Trip updated successfully');
        } catch (tripError) {
            console.error('Error updating trip:', tripError);
            throw tripError;
        }
        
        console.log('All updates completed successfully');
        
        // Show success message
        showCustomModal(
            'Booking Updated!', 
            `Your booking has been successfully updated.\n\nNew seats: ${newSeats}\nTotal price: PKR ${(newSeats * pricePerSeat).toLocaleString()}`, 
            'success'
        );
        
        document.getElementById('trip-details-modal').remove();
        loadMyBookings();
        
    } catch (error) {
        console.error('Error updating booking:', error);
        showCustomModal('Update Failed', 'Failed to update booking. Please try again.', 'error');
    }
}