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

        // Format date properly
        let dateDisplay = 'N/A';
        if (tripData.date) {
            try {
                if (typeof tripData.date === 'string') {
                    // Try to parse string date
                    const parsed = new Date(tripData.date);
                    if (!isNaN(parsed.getTime())) {
                        dateDisplay = parsed.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
                    } else {
                        dateDisplay = tripData.date;
                    }
                } else if (tripData.date.toDate) {
                    // Firestore Timestamp
                    dateDisplay = tripData.date.toDate().toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
                } else {
                    // Regular Date object
                    const d = new Date(tripData.date);
                    if (!isNaN(d.getTime())) {
                        dateDisplay = d.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
                    }
                }
            } catch (err) {
                console.error('Date parsing error:', err);
                dateDisplay = tripData.date.toString();
            }
        }
        
        summary.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem;">
                    <div style="padding: 1.25rem; background: linear-gradient(135deg, #f8fdf9 0%, #eef5f0 100%); border-radius: 12px; border-left: 5px solid var(--primary-color); box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-info-circle" style="margin-right: 0.5rem;"></i>Trip Title</div>
                        <div style="font-weight: 700; color: var(--text-dark); font-size: 1.05rem;">${tripData.description || 'Trip'}</div>
                    </div>
                    <div style="padding: 1.25rem; background: linear-gradient(135deg, #fff8f0 0%, #ffe8d6 100%); border-radius: 12px; border-left: 5px solid #FF9800; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-map-pin" style="margin-right: 0.5rem;"></i>Destination</div>
                        <div style="font-weight: 700; color: var(--text-dark); font-size: 1.05rem;">${tripData.location || 'N/A'}</div>
                    </div>
                    <div style="padding: 1.25rem; background: linear-gradient(135deg, #f0f7ff 0%, #e0f0ff 100%); border-radius: 12px; border-left: 5px solid #2196F3; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-plane-departure" style="margin-right: 0.5rem;"></i>Departure</div>
                        <div style="font-weight: 700; color: var(--text-dark); font-size: 1.05rem;">${tripData.departure || 'N/A'}</div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem;">
                    <div style="padding: 1.25rem; background: linear-gradient(135deg, #f0fff4 0%, #e0ffe8 100%); border-radius: 12px; border-left: 5px solid #4CAF50; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-calendar" style="margin-right: 0.5rem;"></i>Date</div>
                        <div style="font-weight: 700; color: var(--text-dark); font-size: 1.05rem;">${dateDisplay}</div>
                    </div>
                    <div style="padding: 1.25rem; background: linear-gradient(135deg, #f3e5f5 0%, #e8d5f0 100%); border-radius: 12px; border-left: 5px solid #9C27B0; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-money-bill" style="margin-right: 0.5rem;"></i>Price/Seat</div>
                        <div style="font-weight: 700; color: var(--primary-color); font-size: 1.1rem;">${formatCurrency(tripData.pricePerSeat || 0)}</div>
                    </div>
                    <div style="padding: 1.25rem; background: linear-gradient(135deg, #e0f7fa 0%, #d0f5f8 100%); border-radius: 12px; border-left: 5px solid #00BCD4; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-light); margin-bottom: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-chair" style="margin-right: 0.5rem;"></i>Available</div>
                        <div style="font-weight: 700; color: var(--text-dark); font-size: 1.1rem;">${availableSeats} seats</div>
                    </div>
                </div>
            </div>
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
        const bookingForm = document.getElementById('booking-form');
        const errorDiv = document.getElementById('booking-error');
        
        if (!user) {
            // Show login message on booking page
            if (bookingForm) bookingForm.style.display = 'none';
            if (errorDiv) {
                errorDiv.classList.remove('hidden');
                errorDiv.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <h3 style="margin-bottom: 1rem; color: var(--primary-color);">Login Required</h3>
                        <p style="margin-bottom: 1.5rem; color: #666;">Please login to continue with your booking.</p>
                        <a href="login.html" class="btn btn-primary" style="display: inline-block; padding: 0.75rem 2rem; text-decoration: none;">Go to Login</a>
                    </div>
                `;
            }
            return;
        }
        
        // User is logged in
        if (bookingForm) bookingForm.style.display = 'block';
        if (errorDiv) errorDiv.classList.add('hidden');
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
            errorDiv.textContent = 'Please login to continue booking';
            errorDiv.classList.remove('hidden');
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
                        <h2 style="margin-bottom: 1rem; color: #28a745;">💳 Payment Method</h2>
                        <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <p style="margin: 0.3rem 0;"><strong>Trip:</strong> ${freshTrip.description}</p>
                            <p style="margin: 0.3rem 0;"><strong>Seats:</strong> ${seatsBooked}</p>
                            <p style="margin: 0.3rem 0; font-size: 1.2rem; color: #28a745;"><strong>Total:</strong> PKR ${totalAmount.toLocaleString()}</p>
                        </div>
                        
                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: flex; align-items: center; padding: 1rem; border: 2px solid #ddd; border-radius: 8px; cursor: pointer; margin-bottom: 0.75rem; transition: all 0.3s;" id="card-option-label">
                                <input type="radio" name="paymentMethod" value="card" checked style="margin-right: 0.75rem; width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <strong style="display: block; margin-bottom: 0.25rem;">💳 Card Payment</strong>
                                    <small style="color: #6c757d;">Pay securely with debit/credit card</small>
                                </div>
                            </label>
                            <label style="display: flex; align-items: center; padding: 1rem; border: 2px solid #ddd; border-radius: 8px; cursor: pointer; transition: all 0.3s;" id="manual-option-label">
                                <input type="radio" name="paymentMethod" value="manual" style="margin-right: 0.75rem; width: 18px; height: 18px; cursor: pointer;">
                                <div>
                                    <strong style="display: block; margin-bottom: 0.25rem;">💰 Manual Payment</strong>
                                    <small style="color: #6c757d;">Pay directly to the agency</small>
                                </div>
                            </label>
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

            // Handle payment method selection
            const cardOption = modal.querySelector('input[value="card"]');
            const manualOption = modal.querySelector('input[value="manual"]');
            const cardEl = document.getElementById('card-el');
            const payBtn = document.getElementById('pay-btn');
            
            cardOption.addEventListener('change', () => {
                cardEl.style.display = 'block';
                payBtn.textContent = 'Pay PKR ' + totalAmount.toLocaleString();
            });
            
            manualOption.addEventListener('change', () => {
                cardEl.style.display = 'none';
                payBtn.textContent = 'Confirm Manual Payment';
            });

            // Pay
            payBtn.onclick = async () => {
                const selectedMethod = modal.querySelector('input[name="paymentMethod"]:checked').value;
                payBtn.textContent = 'Processing...';
                payBtn.disabled = true;

                try {
                    let bookingData = {
                        tripId, userId: user.uid, userName, userEmail, userPhone, userLocation,
                        seatsBooked, totalAmount,
                        paymentMethod: selectedMethod,
                        createdAt: serverTimestamp()
                    };

                    if (selectedMethod === 'card') {
                        const {paymentMethod, error} = await stripe.createPaymentMethod({
                            type: 'card',
                            card: card,
                            billing_details: { name: userName, email: userEmail }
                        });

                        if (error) throw new Error(error.message);

                        console.log('✅ Payment method:', paymentMethod.id);
                        bookingData.paymentStatus = 'completed';
                        bookingData.stripePaymentMethodId = paymentMethod.id;
                    } else {
                        // Manual payment
                        bookingData.paymentStatus = 'pending';
                    }

                    // Save booking
                    await addDoc(collection(db, 'bookings'), bookingData);

                    // Update seats
                    await updateDoc(doc(db, 'trips', tripId), {
                        bookedSeats: increment(seatsBooked)
                    });

                    modal.remove();
                    const message = selectedMethod === 'card' ? '✅ Payment successful!' : '✅ Booking confirmed! Payment pending.';
                    successDiv.textContent = message + ' Redirecting...';
                    successDiv.classList.remove('hidden');

                    setTimeout(() => window.location.href = 'my-bookings.html', 2000);

                } catch (err) {
                    console.error('❌ Booking error:', err);
                    document.getElementById('card-err').textContent = err.message;
                    payBtn.textContent = selectedMethod === 'card' ? 'Pay PKR ' + totalAmount.toLocaleString() : 'Confirm Manual Payment';
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


