import { db, auth } from '../firebase.js';
import { collection, getDocs, query, limit, orderBy, updateDoc, doc, Timestamp, getDoc, addDoc, serverTimestamp, increment } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
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
        
        // Get all agencies
        const agenciesRef = collection(db, 'agencies');
        const agenciesSnapshot = await getDocs(agenciesRef);
        const agenciesMap = {};
        agenciesSnapshot.forEach(doc => {
            agenciesMap[doc.id] = { id: doc.id, ...doc.data() };
        });
        
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

        // Resolve trip date using multiple possible fields
        const getTripDate = (trip) => {
            if (!trip) return null;
            // Prefer explicit startDate/startDateMillis used by mobile app
            if (trip.startDate?.toDate) return trip.startDate.toDate();
            if (typeof trip.startDateMillis === 'number') return new Date(trip.startDateMillis);
            // Fallbacks: date/dateTimestamp
            if (trip.date?.toDate) return trip.date.toDate();
            if (typeof trip.dateTimestamp === 'number') return new Date(trip.dateTimestamp);
            // Finally try parsing string date
            return parseTripDate(trip.date);
        };

        const now = new Date();

        // Background-migrate: add fields mobile apps commonly require
        (async () => {
            try {
                await Promise.all(querySnapshot.docs.map(async (d) => {
                    const data = d.data();
                    const updates = {};

                    // Convert string date to Timestamp and millis
                    if (data && typeof data.date === 'string') {
                        const parsed = parseTripDate(data.date);
                        if (parsed) {
                            updates.date = Timestamp.fromDate(parsed);
                            updates.dateTimestamp = parsed.getTime();
                        }
                    }

                    // Ensure dateTimestamp exists when date is Timestamp
                    if (data && data.date?.toDate && !data.dateTimestamp) {
                        const dateObj = data.date.toDate();
                        updates.dateTimestamp = dateObj.getTime();
                    }

                    // Duplicate date into startDate/startDateMillis for mobile schemas
                    if (data && data.date?.toDate && !data.startDate) {
                        updates.startDate = data.date;
                    }
                    if ((data?.dateTimestamp || data?.date?.toDate) && !data?.startDateMillis) {
                        const millis = data.dateTimestamp || data.date.toDate().getTime();
                        updates.startDateMillis = millis;
                    }

                    // Visibility/status defaults expected by many Flutter apps
                    if (typeof data?.isPublished === 'undefined') {
                        updates.isPublished = true;
                    }
                    if (!data?.status) {
                        updates.status = 'active';
                    }
                    if (!data?.visibleFrom) {
                        updates.visibleFrom = Timestamp.now();
                    }

                    // Created/updated millis for orderBy queries
                    if (data?.createdAt?.toMillis && !data?.createdAtMillis) {
                        updates.createdAtMillis = data.createdAt.toMillis();
                    }
                    if (data?.updatedAt?.toMillis && !data?.updatedAtMillis) {
                        updates.updatedAtMillis = data.updatedAt.toMillis();
                    }

                    // Ensure location fields for mobile compatibility
                    if (data?.location) {
                        const locationStr = String(data.location).trim();
                        const locationLower = locationStr.toLowerCase();
                        if (!data.locationNormalized) updates.locationNormalized = locationLower;
                        if (!data.city) updates.city = locationStr;
                        if (!data.cityLower) updates.cityLower = locationLower;
                    }

                    if (Object.keys(updates).length > 0) {
                        try {
                            await updateDoc(doc(db, 'trips', d.id), updates);
                        } catch (_) {}
                    }
                }));
            } catch (_) {}
        })();

        // Show only today and future trips (exclude past)
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const upcomingDocs = querySnapshot.docs.filter(doc => {
            const d = getTripDate(doc.data());
            return d && d >= startOfToday; // Today or future only
        });

        // Sort by soonest date first
        const selectedDocs = upcomingDocs.sort((a, b) => {
            const da = getTripDate(a.data()) || new Date(8640000000000000);
            const db = getTripDate(b.data()) || new Date(8640000000000000);
            return da.getTime() - db.getTime();
        });
        
        tripsContainer.innerHTML = selectedDocs.map(doc => {
            const trip = doc.data();
            const agency = agenciesMap[trip.agencyId];
            const availableSeats = Math.max(0, (trip.totalSeats || 0) - (trip.bookedSeats || 0));
            const dateObj = getTripDate(trip);
            const dateDisplay = dateObj ? dateObj.toLocaleDateString() : 'N/A';
            const priceStr = `PKR ${Number(trip.pricePerSeat || 0).toLocaleString()} / seat`;
            const titleLocation = trip.location || 'N/A';
            const subtitle = trip.description || '';
            const departure = trip.departure || 'N/A';

            return `
                <div class="card">
                    <div class="card-image-wrapper">
                        ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${subtitle || 'Trip'}" class="card-image">` : ''}
                    </div>
                    <div class="card-content">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: .75rem;">
                            <h3 class="card-title" style="margin:0;">${titleLocation}</h3>
                            <div class="card-price" style="white-space:nowrap;">${priceStr.replace(' / seat','')} <span style="color:#6c757d; font-weight:500; font-size: 0.8em;">/ seat</span></div>
                        </div>
                        ${agency ? `<div style="margin-top: 0.25rem;"><span style="color: var(--text-light); font-size: 0.9rem;">by</span> <a href="explore.html?city=${encodeURIComponent(titleLocation)}&agency=${agency.id}" style="color: var(--primary-color); text-decoration: none; font-weight: 600;">${agency.name || 'Agency'}</a></div>` : ''}
                        ${subtitle ? `<div class="card-text" style="margin-top:.5rem;">${subtitle}</div>` : ''}
                        <div class="card-meta" style="margin-top: auto; padding-top: 1rem;">
                            <div><i class="fa-regular fa-calendar"></i> ${dateDisplay}</div>
                            <div><i class="fa-solid fa-chair"></i> ${availableSeats} left</div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #f0f0f0;">
                            <div style="font-size: 0.85rem; color: var(--text-light);"><i class="fa-solid fa-location-dot"></i> ${departure}</div>
                            ${availableSeats > 0 ? `
                                <a class="btn btn-primary" style="padding: 0.5rem 1.25rem; font-size: 0.9rem;" href="booking.html?tripId=${doc.id}">Book Now</a>
                            ` : `
                                <button class="btn btn-secondary" disabled style="padding: 0.5rem 1.25rem; font-size: 0.9rem;">Sold Out</button>
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
    const profileLink = document.getElementById('profile-link');
    if (!profileLink) return; // Element may not exist on this page
    if (user) {
        profileLink.textContent = 'Profile';
    }
});

// Load testimonials from Firestore
async function loadTestimonials() {
    try {
        const testimonialsGrid = document.getElementById('testimonials-grid');
        const testimonialsRef = collection(db, 'testimonials');
        const q = query(testimonialsRef, orderBy('createdAt', 'desc'), limit(20));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            // Keep default testimonials if none in Firestore
            return;
        }
        
        testimonialsGrid.innerHTML = '';
        querySnapshot.forEach(doc => {
            const testimonial = doc.data();
            const stars = '⭐'.repeat(testimonial.rating || 5);
            
            const card = document.createElement('div');
            card.className = 'feature-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div class="feature-title">"${testimonial.title || 'Great Experience'}"</div>
                    <div style="color: #FFA500;">${stars}</div>
                </div>
                <div class="feature-text">${testimonial.message || ''}</div>
                <div style="margin-top: 0.5rem; color: var(--text-light); font-size: 0.85rem;">- ${testimonial.name || 'Anonymous'}</div>
            `;
            testimonialsGrid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading testimonials:', error);
    }
}

// Handle testimonial form submission
function setupTestimonialForm() {
    const form = document.getElementById('testimonial-form');
    const alertDiv = document.getElementById('testimonial-message-alert');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('testimonial-name').value.trim();
        const title = document.getElementById('testimonial-title').value.trim();
        const message = document.getElementById('testimonial-message').value.trim();
        const rating = parseInt(document.getElementById('testimonial-rating').value);
        
        if (!name || !title || !message) {
            alertDiv.textContent = 'Please fill all fields';
            alertDiv.className = 'alert alert-error';
            alertDiv.style.display = 'block';
            return;
        }
        
        try {
            // Add to Firestore
            const testimonialsRef = collection(db, 'testimonials');
            await addDoc(testimonialsRef, {
                name,
                title,
                message,
                rating,
                createdAt: serverTimestamp()
            });
            
            // Show success message
            alertDiv.textContent = 'Thank you! Your testimonial has been submitted.';
            alertDiv.className = 'alert alert-success';
            alertDiv.style.display = 'block';
            
            // Clear form
            form.reset();
            
            // Add to grid immediately (live update)
            const testimonialsGrid = document.getElementById('testimonials-grid');
            const stars = '⭐'.repeat(rating);
            
            const card = document.createElement('div');
            card.className = 'feature-card';
            card.style.animation = 'fadeIn 0.5s ease-in';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div class="feature-title">"${title}"</div>
                    <div style="color: #FFA500;">${stars}</div>
                </div>
                <div class="feature-text">${message}</div>
                <div style="margin-top: 0.5rem; color: var(--text-light); font-size: 0.85rem;">- ${name}</div>
            `;
            
            // Add to beginning of grid
            testimonialsGrid.insertBefore(card, testimonialsGrid.firstChild);
            
            // Hide success message after 3 seconds
            setTimeout(() => {
                alertDiv.style.display = 'none';
            }, 3000);
            
        } catch (error) {
            console.error('Error submitting testimonial:', error);
            alertDiv.textContent = 'Failed to submit testimonial. Please try again.';
            alertDiv.className = 'alert alert-error';
            alertDiv.style.display = 'block';
        }
    });
}

// Initialize page
loadTravelTips();
loadFeaturedTrips();
loadTestimonials();
setupTestimonialForm();

