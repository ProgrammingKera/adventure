import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let tripId = null;
let tripData = null;

function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

function formatCurrency(value) {
    const num = Number(value || 0);
    return `PKR ${num.toLocaleString('en-PK')}`;
}

async function loadTripSummary() {
    try {
        const summary = document.getElementById('trip-summary-content');
        const seatsInput = document.getElementById('seatsBooked');
        const totalCostEl = document.getElementById('total-cost');

        const snap = await getDoc(doc(db, 'trips', tripId));
        if (!snap.exists()) {
            summary.innerHTML = '<p style="color: red;">Trip not found.</p>';
            return;
        }
        tripData = snap.data();

        const availableSeats = (tripData.totalSeats || 0) - (tripData.bookedSeats || 0);
        seatsInput.max = Math.max(availableSeats, 0);
        seatsInput.value = Math.min(availableSeats, 1);
        totalCostEl.textContent = formatCurrency((tripData.pricePerSeat || 0) * Number(seatsInput.value));

        summary.innerHTML = `
            <p><strong>Title:</strong> ${tripData.description || 'Trip'}</p>
            <p><strong>Destination:</strong> ${tripData.location || 'N/A'}</p>
            <p><strong>Departure:</strong> ${tripData.departure || 'N/A'}</p>
            <p><strong>Date:</strong> ${tripData.date ? (typeof tripData.date === 'string' ? tripData.date : new Date(tripData.date).toLocaleDateString()) : 'N/A'}</p>
            <p><strong>Price per seat:</strong> ${formatCurrency(tripData.pricePerSeat || 0)}</p>
            <p><strong>Available seats:</strong> ${availableSeats}</p>
        `;

        seatsInput.addEventListener('input', () => {
            const seats = Number(seatsInput.value || 0);
            totalCostEl.textContent = formatCurrency(seats * (tripData.pricePerSeat || 0));
        });
    } catch (e) {
        console.error('Error loading trip summary:', e);
        document.getElementById('trip-summary-content').innerHTML = '<p style="color: red;">Failed to load trip summary.</p>';
    }
}

function prefillUser(user, userDocData) {
    document.getElementById('userName').value = userDocData?.name || user.displayName || '';
    document.getElementById('userEmail').value = userDocData?.email || user.email || '';
    document.getElementById('userPhone').value = userDocData?.phone || '';
    document.getElementById('userLocation').value = userDocData?.city || '';
}

async function init() {
    tripId = getQueryParam('tripId');
    if (!tripId) {
        window.location.href = 'index.html';
        return;
    }

    // Auth check and prefill
    onAuthStateChanged(auth, async (user) => {
        const profileLink = document.getElementById('profile-link');
        if (!user) {
            alert('Please login to continue booking');
            window.location.href = 'profile.html';
            return;
        }
        profileLink.textContent = 'Profile';

        const userSnap = await getDoc(doc(db, 'users', user.uid));
        prefillUser(user, userSnap.exists() ? userSnap.data() : null);
    });

    await loadTripSummary();

    // Submit handler
    const form = document.getElementById('booking-form');
    const errorDiv = document.getElementById('booking-error');
    const successDiv = document.getElementById('booking-success');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.classList.add('hidden');
        successDiv.classList.add('hidden');

        const user = auth.currentUser;
        if (!user) {
            alert('Please login to continue');
            window.location.href = 'profile.html';
            return;
        }

        const userName = document.getElementById('userName').value.trim();
        const userEmail = document.getElementById('userEmail').value.trim();
        const userPhone = document.getElementById('userPhone').value.trim() || null;
        const userLocation = document.getElementById('userLocation').value.trim();
        const seatsBooked = Number(document.getElementById('seatsBooked').value);

        if (!userName || !userEmail || !userLocation || !seatsBooked || seatsBooked <= 0) {
            errorDiv.textContent = 'Please fill all required fields correctly.';
            errorDiv.classList.remove('hidden');
            return;
        }

        try {
            // Refresh trip to validate seats
            const freshTripSnap = await getDoc(doc(db, 'trips', tripId));
            if (!freshTripSnap.exists()) throw new Error('Trip not found');
            const freshTrip = freshTripSnap.data();
            const available = (freshTrip.totalSeats || 0) - (freshTrip.bookedSeats || 0);
            if (seatsBooked > available) {
                errorDiv.textContent = `Only ${available} seat(s) available.`;
                errorDiv.classList.remove('hidden');
                return;
            }

            // Create booking
            await addDoc(collection(db, 'bookings'), {
                tripId: tripId,
                userId: auth.currentUser.uid,
                userName,
                userEmail,
                userPhone,
                userLocation,
                seatsBooked,
                createdAt: serverTimestamp()
            });

            // Update trip booked seats
            await updateDoc(doc(db, 'trips', tripId), { bookedSeats: increment(seatsBooked) });

            successDiv.textContent = 'Booking confirmed! You can view it in your Profile > My Bookings.';
            successDiv.classList.remove('hidden');

            // Navigate after short delay
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 1200);
        } catch (err) {
            console.error('Booking error:', err);
            errorDiv.textContent = err.message || 'Failed to complete booking.';
            errorDiv.classList.remove('hidden');
        }
    });
}

init();


