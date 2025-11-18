import { db, auth } from '../firebase.js';
import { collection, getDocs, query, where, doc, getDoc, updateDoc, increment, addDoc, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Check if user is logged in
let isAuthChecked = false;
onAuthStateChanged(auth, (user) => {
    if (!isAuthChecked) {
        isAuthChecked = true;
        const loginMessageContainer = document.getElementById('login-message-container');
        const exploreLayout = document.querySelector('.explore-layout');
        const exploreTabs = document.getElementById('explore-tabs');
        
        if (!user) {
            // Show login message, hide explore layout
            if (loginMessageContainer) loginMessageContainer.style.display = 'block';
            if (exploreLayout) exploreLayout.style.display = 'none';
            if (exploreTabs) exploreTabs.style.display = 'none';
        } else {
            // User is logged in - show explore layout
            if (loginMessageContainer) loginMessageContainer.style.display = 'none';
            if (exploreLayout) exploreLayout.style.display = 'flex';
            if (exploreTabs) exploreTabs.style.display = 'flex';
            // Load data for logged in user
            loadDestinations();
        }
    }
});

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
        
        // Group agencies by their location
        const agenciesByCity = {};
        allAgencies.forEach(agency => {
            const city = String(agency.location || 'Other').trim();
            if (!agenciesByCity[city]) {
                agenciesByCity[city] = [];
            }
            agenciesByCity[city].push(agency);
        });
        
        // Build list of cities with agency count
        const cityEntries = Object.entries(agenciesByCity)
            .map(([city, agencies]) => ({ city, count: agencies.length }))
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

// Update tabs
function updateTabs(view) {
    // Update tab buttons
    document.querySelectorAll('.explore-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`[data-view="${view}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    // Show/hide tabs based on view
    if (view === 'cities') {
        document.getElementById('tab-cities').style.display = 'flex';
        document.getElementById('tab-agencies').style.display = 'none';
        document.getElementById('tab-trips').style.display = 'none';
    } else if (view === 'agencies') {
        document.getElementById('tab-cities').style.display = 'flex';
        document.getElementById('tab-agencies').style.display = 'flex';
        document.getElementById('tab-trips').style.display = 'none';
    } else if (view === 'trips') {
        document.getElementById('tab-cities').style.display = 'flex';
        document.getElementById('tab-agencies').style.display = 'flex';
        document.getElementById('tab-trips').style.display = 'flex';
    }
}

// Scroll to main content (for mobile)
function scrollToContent() {
    const mainContent = document.getElementById('main-content');
    if (mainContent && window.innerWidth <= 1000) {
        mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Render cities list
function renderCities(cityEntries) {
    currentView = 'cities';
    selectedCity = null;
    selectedAgency = null;
    
    // Update tabs
    updateTabs('cities');
    
    // Hide agency info
    showAgencyInfo(null);
    
    // Show cities, hide agencies
    document.getElementById('cities-container').style.display = 'block';
    document.getElementById('agencies-container').style.display = 'none';
    
    const citiesContainer = document.getElementById('cities-container');
    citiesContainer.innerHTML = cityEntries.map((item, idx) => `
        <div class="city-card" data-city="${item.city}">
            <div class="city-name">${item.city}</div>
            <div class="city-meta">${item.count} ${item.count === 1 ? 'agency' : 'agencies'}</div>
        </div>
    `).join('');
    
    // Update content area
    document.getElementById('content-title').textContent = 'Select a City';
    document.getElementById('content-area').innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 2rem;">Choose a city to explore travel agencies</p>';
    
    // Attach click handlers
    document.querySelectorAll('.city-card').forEach(card => {
        card.addEventListener('click', () => {
            // Remove active from all
            document.querySelectorAll('.city-card').forEach(c => c.classList.remove('active'));
            // Add active to clicked
            card.classList.add('active');
            
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
    
    // Update tabs
    updateTabs('agencies');
    const tabAgenciesLabel = document.getElementById('tab-agencies-label');
    if (tabAgenciesLabel) tabAgenciesLabel.textContent = city;
    
    // Scroll to content on mobile
    scrollToContent();
    
    // Get agencies in this city (by agency location)
    const cityAgencies = allAgencies.filter(a => String(a.location || '').trim() === city);
    
    // Count trips per agency
    const agenciesWithCount = cityAgencies.map(agency => {
        const count = allTrips.filter(t => t.agencyId === agency.id).length;
        return { ...agency, tripCount: count };
    }).sort((a, b) => b.tripCount - a.tripCount);
    
    // Hide agency info when showing agencies list
    showAgencyInfo(null);
    
    // Hide cities, show agencies
    document.getElementById('cities-container').style.display = 'none';
    document.getElementById('agencies-container').style.display = 'block';
    
    const agenciesContainer = document.getElementById('agencies-container');
    agenciesContainer.className = 'city-grid';
    
    if (agenciesWithCount.length === 0) {
        agenciesContainer.innerHTML = '<p style="padding:1rem; color: var(--text-light);">No agencies found for this city.</p>';
        document.getElementById('content-area').innerHTML = '';
        return;
    }
    
    agenciesContainer.innerHTML = agenciesWithCount.map(agency => `
        <div class="city-card" data-agency-id="${agency.id}">
            <div class="city-name">${agency.name || 'Agency'}</div>
            <div class="city-meta" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <span>${agency.tripCount} ${agency.tripCount === 1 ? 'trip' : 'trips'}</span>
                ${agency.rating ? `<span style="color: #FFA500;">★ ${Number(agency.rating).toFixed(1)}</span>` : ''}
            </div>
        </div>
    `).join('');

    // Update content area
    document.getElementById('content-title').textContent = `${city} Agencies`;
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
    
    // Update tabs
    updateTabs('trips');
    document.getElementById('tab-trips-label').textContent = agency.name || 'Trips';
    
    // Scroll to content on mobile
    scrollToContent();
    
    // Filter trips for this agency
    const trips = allTrips.filter(t => t.agencyId === agency.id);
    
    // Update content
    document.getElementById('content-title').textContent = '';
    
    // Show agency info
    showAgencyInfo(agency);
    
    // Render trips
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
        const agency = trip.agency || selectedAgency;
        return `
            <div class="card">
                ${trip.imageUrl ? `<img src="${trip.imageUrl}" alt="${trip.description || 'Trip'}" class="card-image">` : ''}
                <div class="card-content">
                    <h4 class="card-title">${trip.description || 'Trip'}</h4>
                    ${agency ? `<div style="margin-bottom: 0.5rem;"><span style="color: var(--text-light); font-size: 0.9rem;">by</span> <a href="#" onclick="window.showAgencyDetailsInExplore('${agency.id}'); return false;" style="color: var(--primary-color); text-decoration: none; font-weight: 600;">${agency.name || 'Agency'}</a></div>` : ''}
                    <div class="card-text"><strong>Location:</strong> ${trip.location || 'N/A'}</div>
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

// Breadcrumb navigation (if elements exist)
const breadcrumbHome = document.getElementById('breadcrumb-home');
if (breadcrumbHome) {
    breadcrumbHome.addEventListener('click', () => {
        if (currentView !== 'cities') {
            loadDestinations();
        }
    });
}

const breadcrumbCity = document.getElementById('breadcrumb-city');
if (breadcrumbCity) {
    breadcrumbCity.addEventListener('click', () => {
        if (currentView === 'trips' && selectedCity) {
            showAgenciesForCity(selectedCity);
        }
    });
}

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

// Show agency info in dedicated section
function showAgencyInfo(agency) {
    const agencyInfoSection = document.getElementById('agency-info-section');
    
    if (!agency) {
        agencyInfoSection.style.display = 'none';
        agencyInfoSection.innerHTML = '';
        return;
    }
    
    agencyInfoSection.style.display = 'block';
    agencyInfoSection.innerHTML = `
        <div style="background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); border: 1px solid #e8eaf6; border-radius: 16px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08); transition: all 0.3s ease;">
            <div style="text-align: center;">
                <h2 style="margin: 0 0 1.5rem 0; color: #1a202c; font-size: 2rem; font-weight: 800;">${agency.name || 'Agency'}</h2>
                
                <div style="display: flex; align-items: center; justify-content: center; gap: 2rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
                    ${agency.rating ? `
                        <div style="display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #fff5e6 0%, #ffe6cc 100%); padding: 0.75rem 1.25rem; border-radius: 12px; border: 1px solid #ffd699;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFA500">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            <span style="font-weight: 700; color: #FF8C00; font-size: 1.1rem;">${Number(agency.rating).toFixed(1)}</span>
                            <span style="color: #666; font-size: 0.9rem;">(Rating)</span>
                        </div>
                    ` : ''}
                    ${agency.location ? `
                        <div style="display: flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 0.75rem 1.25rem; border-radius: 12px; border: 1px solid #a5d6a7;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" stroke-width="2.5">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            <span style="font-weight: 600; color: #2d6a4f; font-size: 0.95rem;">${agency.location}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${agency.description ? `<p style="color: #4a5568; line-height: 1.8; margin: 1rem auto 1.5rem; max-width: 700px; font-size: 0.95rem; font-weight: 500;">${agency.description}</p>` : ''}
                
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 2px solid #e8eaf6;">
                    ${agency.phone ? `
                        <a href="tel:${agency.phone}" style="display: inline-flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); color: white; padding: 0.75rem 1.5rem; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,103,52,0.2);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,103,52,0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,103,52,0.2)'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            <span>${agency.phone}</span>
                        </a>
                    ` : ''}
                    ${agency.email ? `
                        <a href="mailto:${agency.email}" style="display: inline-flex; align-items: center; gap: 0.5rem; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); color: white; padding: 0.75rem 1.5rem; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 0.9rem; transition: all 0.3s; box-shadow: 0 4px 12px rgba(0,103,52,0.2);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,103,52,0.3)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,103,52,0.2)'">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                            <span>${agency.email}</span>
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// Show agency details in explore page
window.showAgencyDetailsInExplore = async function(agencyId) {
    try {
        const agency = allAgencies.find(a => a.id === agencyId);
        
        if (!agency) {
            alert('Agency not found');
            return;
        }
        
        // Create modal HTML
        // const modalHTML = `
        //     <div id="agency-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;" onclick="if(event.target.id==='agency-modal') this.remove();">
        //         <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;" onclick="event.stopPropagation();">
        //             <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        //                 <h2 style="margin: 0; color: var(--text-dark);">${agency.name || 'Agency'}</h2>
        //                 <button onclick="document.getElementById('agency-modal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-light);">&times;</button>
        //             </div>
        //             ${agency.rating ? `<div style="color: #FFA500; margin-bottom: 1rem; font-size: 1.2rem;">★ ${Number(agency.rating).toFixed(1)} Rating</div>` : ''}
        //             ${agency.description ? `<div style="margin-bottom: 1rem; color: var(--text-light); line-height: 1.6;">${agency.description}</div>` : ''}
        //             <div style="margin-top: 1.5rem;">
        //                 <strong style="color: var(--text-dark);">Contact Information:</strong>
        //                 ${agency.phone ? `<div style="margin-top: 0.5rem; color: var(--text-light);">📞 ${agency.phone}</div>` : ''}
        //                 ${agency.email ? `<div style="margin-top: 0.5rem; color: var(--text-light);">📧 ${agency.email}</div>` : ''}
        //                 ${agency.location ? `<div style="margin-top: 0.5rem; color: var(--text-light);">📍 ${agency.location}</div>` : ''}
        //             </div>
        //             <div style="margin-top: 1.5rem; text-align: center;">
        //                 <button onclick="document.getElementById('agency-modal').remove()" class="btn btn-primary">Close</button>
        //             </div>
        //         </div>
        //     </div>
        // `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('agency-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('Error loading agency details:', error);
        alert('Failed to load agency details');
    }
};

// Handle URL parameters for direct navigation
function handleURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const city = urlParams.get('city');
    const agencyId = urlParams.get('agency');
    
    if (city && agencyId) {
        // Wait for data to load then navigate
        setTimeout(() => {
            const agency = allAgencies.find(a => a.id === agencyId);
            if (agency) {
                showTripsForAgency(city, agency);
            } else {
                showAgenciesForCity(city);
            }
        }, 500);
    } else if (city) {
        setTimeout(() => {
            showAgenciesForCity(city);
        }, 500);
    }
}

// Initialize tab click handlers
function initTabHandlers() {
    const tabCities = document.getElementById('tab-cities');
    const tabAgencies = document.getElementById('tab-agencies');
    
    if (tabCities) {
        tabCities.addEventListener('click', () => {
            if (currentView !== 'cities') {
                // Go back to cities view
                const cityEntries = {};
                allAgencies.forEach(agency => {
                    const city = String(agency.location || 'Other').trim();
                    if (!cityEntries[city]) cityEntries[city] = [];
                    cityEntries[city].push(agency);
                });
                const cities = Object.entries(cityEntries)
                    .map(([city, agencies]) => ({ city, count: agencies.length }))
                    .sort((a, b) => b.count - a.count);
                renderCities(cities);
            }
        });
    }
    
    if (tabAgencies) {
        tabAgencies.addEventListener('click', () => {
            if (currentView === 'trips' && selectedCity) {
                // Go back to agencies view
                showAgenciesForCity(selectedCity);
            }
        });
    }
}

// Initialize page
loadDestinations().then(() => {
    initTabHandlers();
    handleURLParameters();
});

