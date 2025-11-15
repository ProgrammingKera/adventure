import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { doc, getDoc, collection, addDoc, serverTimestamp, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Stripe Configuration
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51RXrGJ4KfG2Zot2yqATlNthP1rmv44p2UxKkM4fgXUrBBzcCJaogNREypEto3QvO9D7dfuY2mqEBgPGX8c8LgfLD00nAS0nnVR';
const SERVER_URL = 'https://stripe-render-demo.onrender.com';
// Secret Key (for server-side only): sk_test_51RXrGJ4KfG2Zot2yUkAYEtgYx2whPy0IlsqgeNSLYFeHrcXrR3PXDz5KNeaTzYsGMnifRapIx8puHjdOJqsYfQIj00MPWfhprw
let stripe = null;

let tripId = null;
let tripData = null;

// Initialize Stripe
function initStripe() {
    if (window.Stripe) {
        stripe = window.Stripe(STRIPE_PUBLISHABLE_KEY);
        console.log('✅ Stripe initialized successfully');
    } else {
        console.error('❌ Stripe.js not loaded');
    }
}

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
    // Initialize Stripe
    initStripe();
    
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
            window.location.href = 'login.html';
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

            // Calculate total amount
            const totalAmount = seatsBooked * (freshTrip.pricePerSeat || 0);
            console.log('💰 Total amount: PKR', totalAmount);
            
            // Check Stripe
            if (!stripe) {
                errorDiv.textContent = 'Payment system not ready. Please refresh.';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            // Show payment modal
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Opening Payment...';
            submitBtn.disabled = true;

            // Create payment modal
            const modal = document.createElement('div');
            modal.innerHTML = `
                <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 9999;">
                    <div style="background: white; padding: 2rem; border-radius: 12px; max-width: 500px; width: 90%;">
                        <h2 style="margin-bottom: 1rem; color: #28a745;">💳 Payment</h2>
                        <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <p style="margin: 0.3rem 0;"><strong>Trip:</strong> ${freshTrip.description}</p>
                            <p style="margin: 0.3rem 0;"><strong>Seats:</strong> ${seatsBooked}</p>
                            <p style="margin: 0.3rem 0; font-size: 1.2rem; color: #28a745;"><strong>Total:</strong> PKR ${totalAmount.toLocaleString()}</p>
                        </div>
                        <div id="card-el" style="border: 1px solid #ccc; border-radius: 8px; padding: 12px; margin-bottom: 1rem;"></div>
                        <div id="card-err" style="color: #dc3545; margin-bottom: 1rem; font-size: 0.9rem;"></div>
                        <div style="display: flex; gap: 1rem;">
                            <button id="pay-btn" class="btn btn-primary" style="flex: 1;">Pay PKR ${totalAmount.toLocaleString()}</button>
                            <button id="cancel-btn" class="btn" style="flex: 1; background: #6c757d; color: white;">Cancel</button>
                        </div>
                        <p style="margin-top: 1rem; text-align: center; color: #6c757d; font-size: 0.9rem;">🔒 Secured by Stripe</p>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Create card element
            const elements = stripe.elements();
            const card = elements.create('card', {
                style: { base: { fontSize: '16px', color: '#32325d' } }
            });
            card.mount('#card-el');
            card.on('change', (e) => {
                document.getElementById('card-err').textContent = e.error ? e.error.message : '';
            });

            // Cancel
            document.getElementById('cancel-btn').onclick = () => {
                modal.remove();
                submitBtn.textContent = 'Checkout';
                submitBtn.disabled = false;
            };

            // Pay
            document.getElementById('pay-btn').onclick = async () => {
                const payBtn = document.getElementById('pay-btn');
                payBtn.textContent = 'Processing...';
                payBtn.disabled = true;

                try {
                    const {paymentMethod, error} = await stripe.createPaymentMethod({
                        type: 'card',
                        card: card,
                        billing_details: { name: userName, email: userEmail }
                    });

                    if (error) throw new Error(error.message);

                    console.log('✅ Payment method:', paymentMethod.id);

                    // Save booking
                    await addDoc(collection(db, 'bookings'), {
                        tripId, userId: user.uid, userName, userEmail, userPhone, userLocation,
                        seatsBooked, totalAmount,
                        paymentStatus: 'completed',
                        paymentMethod: 'stripe',
                        stripePaymentMethodId: paymentMethod.id,
                        createdAt: serverTimestamp()
                    });

                    // Update seats
                    await updateDoc(doc(db, 'trips', tripId), {
                        bookedSeats: increment(seatsBooked)
                    });

                    modal.remove();
                    successDiv.textContent = '✅ Payment successful! Redirecting...';
                    successDiv.classList.remove('hidden');

                    setTimeout(() => window.location.href = 'my-bookings.html', 2000);

                } catch (err) {
                    console.error('❌ Payment error:', err);
                    document.getElementById('card-err').textContent = err.message;
                    payBtn.textContent = 'Pay PKR ' + totalAmount.toLocaleString();
                    payBtn.disabled = false;
                }
            };

        } catch (err) {
            console.error('❌ Booking error:', err);
            errorDiv.textContent = err.message || 'Failed to complete booking.';
            errorDiv.classList.remove('hidden');
            
            // Reset button
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.textContent = 'Checkout';
            submitBtn.disabled = false;
        }
    });
}

init();


