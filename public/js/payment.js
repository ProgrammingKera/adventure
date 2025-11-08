import { db, auth } from '../firebase.js';
import { collection, addDoc, serverTimestamp, doc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Stripe Configuration
const STRIPE_PUBLISHABLE_KEY = 'pk_test_51RXrGJ4KfG2Zot2yqATlNthP1rmv44p2UxKkM4fgXUrBBzcCJaogNREypEto3QvO9D7dfuY2mqEBgPGX8c8LgfLD00nAS0nnVR';

// Initialize Stripe
const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
const elements = stripe.elements();

// Create card element
const cardElement = elements.create('card', {
    style: {
        base: {
            fontSize: '16px',
            color: '#32325d',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            '::placeholder': {
                color: '#aab7c4'
            }
        },
        invalid: {
            color: '#fa755a',
            iconColor: '#fa755a'
        }
    }
});

cardElement.mount('#card-element');

// Handle card errors
cardElement.on('change', (event) => {
    const displayError = document.getElementById('card-errors');
    if (event.error) {
        displayError.textContent = event.error.message;
    } else {
        displayError.textContent = '';
    }
});

// Load booking data
const bookingData = JSON.parse(sessionStorage.getItem('pendingBooking'));

if (!bookingData) {
    alert('No booking data found');
    window.location.href = 'index.html';
} else {
    // Display booking summary
    document.getElementById('trip-name').textContent = bookingData.tripDescription || 'Trip';
    document.getElementById('seats-count').textContent = bookingData.seatsBooked;
    document.getElementById('price-per-seat').textContent = `PKR ${bookingData.pricePerSeat.toLocaleString()}`;
    document.getElementById('total-amount').textContent = `PKR ${bookingData.totalAmount.toLocaleString()}`;
}

// Handle payment form submission
const form = document.getElementById('payment-form');
const payButton = document.getElementById('pay-button');
const errorDiv = document.getElementById('payment-error');
const successDiv = document.getElementById('payment-success');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    payButton.textContent = 'Processing...';
    payButton.disabled = true;

    try {
        // Create payment method
        const {paymentMethod, error} = await stripe.createPaymentMethod({
            type: 'card',
            card: cardElement,
            billing_details: {
                name: bookingData.userName,
                email: bookingData.userEmail,
            },
        });

        if (error) {
            throw new Error(error.message);
        }

        console.log('✅ Payment method created:', paymentMethod.id);

        // Save booking to Firestore with payment info
        await addDoc(collection(db, 'bookings'), {
            tripId: bookingData.tripId,
            userId: bookingData.userId,
            userName: bookingData.userName,
            userEmail: bookingData.userEmail,
            userPhone: bookingData.userPhone,
            userLocation: bookingData.userLocation,
            seatsBooked: bookingData.seatsBooked,
            totalAmount: bookingData.totalAmount,
            paymentStatus: 'completed',
            paymentMethod: 'stripe',
            stripePaymentMethodId: paymentMethod.id,
            createdAt: serverTimestamp()
        });

        // Update trip booked seats
        await updateDoc(doc(db, 'trips', bookingData.tripId), {
            bookedSeats: increment(bookingData.seatsBooked)
        });

        // Clear session storage
        sessionStorage.removeItem('pendingBooking');

        successDiv.textContent = '✅ Payment successful! Redirecting...';
        successDiv.classList.remove('hidden');

        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 2000);

    } catch (err) {
        console.error('❌ Payment error:', err);
        errorDiv.textContent = err.message || 'Payment failed. Please try again.';
        errorDiv.classList.remove('hidden');
        
        payButton.textContent = 'Pay Now';
        payButton.disabled = false;
    }
});