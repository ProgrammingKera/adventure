// Test that file loads
console.log('plan-trip.js loaded successfully!');

import { db, auth } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Check if user is logged in
let isAuthChecked = false;
onAuthStateChanged(auth, (user) => {
    if (!isAuthChecked) {
        isAuthChecked = true;
        if (!user) {
            alert('Please login to use AI Trip Planner feature!');
            window.location.href = 'login.html';
        }
    }
});

// Budget preset buttons
const budgetPresets = document.querySelectorAll('.budget-preset');
const budgetInput = document.getElementById('budget');

if (budgetPresets.length > 0 && budgetInput) {
    budgetPresets.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const value = btn.getAttribute('data-value');
            budgetInput.value = value;
            
            // Update button styling
            budgetPresets.forEach(b => {
                b.style.background = 'white';
                b.style.borderColor = '#e0e0e0';
                b.style.color = 'var(--primary-color)';
            });
            btn.style.background = 'var(--primary-color)';
            btn.style.borderColor = 'var(--primary-color)';
            btn.style.color = 'white';
        });
    });
    
    // Clear button styling when user types
    budgetInput.addEventListener('input', () => {
        budgetPresets.forEach(b => {
            b.style.background = 'white';
            b.style.borderColor = '#e0e0e0';
            b.style.color = 'var(--primary-color)';
        });
    });
}

// Set minimum date to today (only if elements exist)
const today = new Date().toISOString().split('T')[0];
const startDateEl = document.getElementById('startDate');
const endDateEl = document.getElementById('endDate');

if (startDateEl && endDateEl) {
    startDateEl.setAttribute('min', today);
    endDateEl.setAttribute('min', today);
    
    // Update end date minimum when start date changes
    startDateEl.addEventListener('change', function() {
        const startDate = this.value;
        endDateEl.setAttribute('min', startDate);
    });
}

// Handle form submission (only if form exists)
const tripPlanForm = document.getElementById('trip-plan-form');
if (tripPlanForm) {
    tripPlanForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Generating Plan...';
    
    const planResult = document.getElementById('plan-result');
    planResult.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>AI is creating your perfect trip plan...</p>
        </div>
    `;
    planResult.classList.remove('hidden');
    
    // Collect form data
    const formData = {
        destination: document.getElementById('destination').value,
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        numberOfPeople: document.getElementById('numberOfPeople').value,
        budget: document.getElementById('budget').value,
        accommodationType: document.getElementById('accommodationType').value,
        preferences: Array.from(document.querySelectorAll('input[name="preferences"]:checked'))
            .map(checkbox => checkbox.value),
        specialRequirements: document.getElementById('specialRequirements').value || 'None'
    };
    
    // Validate preferences
    if (formData.preferences.length === 0) {
        planResult.innerHTML = `
            <div class="alert alert-error">
                Please select at least one preference.
            </div>
        `;
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        return;
    }
    
    try {
        const response = await fetch('/api/generate-plan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success && data.plan) {
            // Try multiple strategies to get valid plan data
            let finalPlan = null;
            
            // Strategy 1: Check if plan already has structured data
            if (data.plan && Object.keys(data.plan).length > 0 && !data.plan.error) {
                console.log('✓ Using structured plan data from backend');
                console.log('Available sections:', Object.keys(data.plan));
                finalPlan = data.plan;
            }
            // Strategy 2: Try to parse rawResponse if available
            else if (data.plan.rawResponse || data.plan.needsFrontendParsing) {
                console.log('⚠ Attempting frontend parsing of raw response...');
                const rawText = data.plan.rawResponse;
                
                if (rawText) {
                    // Try multiple parsing strategies
                    const parseStrategies = [
                        // Strategy A: Direct parse
                        () => {
                            let text = rawText.trim();
                            // Remove markdown code blocks
                            if (text.includes('```json')) {
                                const match = text.match(/```json\s*([\s\S]*?)\s*```/);
                                if (match) text = match[1].trim();
                            } else if (text.includes('```')) {
                                const match = text.match(/```\s*([\s\S]*?)\s*```/);
                                if (match) text = match[1].trim();
                            }
                            // Extract JSON object
                            const jsonMatch = text.match(/\{[\s\S]*\}/);
                            if (jsonMatch) text = jsonMatch[0];
                            return JSON.parse(text);
                        },
                        // Strategy B: Fix trailing commas
                        () => {
                            let text = rawText.trim();
                            if (text.includes('```')) {
                                const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                                if (match) text = match[1].trim();
                            }
                            const jsonMatch = text.match(/\{[\s\S]*\}/);
                            if (jsonMatch) text = jsonMatch[0];
                            text = text.replace(/,(\s*[}\]])/g, '$1');
                            return JSON.parse(text);
                        },
                        // Strategy C: Extract largest JSON object
                        () => {
                            const matches = rawText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
                            if (matches && matches.length > 0) {
                                const sorted = matches.sort((a, b) => b.length - a.length);
                                for (const match of sorted) {
                                    try {
                                        const parsed = JSON.parse(match);
                                        if (parsed.weather || parsed.touristAttractions) {
                                            return parsed;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }
                            }
                            throw new Error('No valid JSON found');
                        }
                    ];
                    
                    // Try each strategy
                    for (let i = 0; i < parseStrategies.length; i++) {
                        try {
                            const parsed = parseStrategies[i]();
                            if (parsed && (parsed.weather || parsed.touristAttractions)) {
                                console.log(`✓ Successfully parsed using strategy ${String.fromCharCode(65 + i)}`);
                                finalPlan = parsed;
                                break;
                            }
                        } catch (err) {
                            console.log(`✗ Strategy ${String.fromCharCode(65 + i)} failed:`, err.message);
                        }
                    }
                }
            }
            
            // Last resort: Try to extract partial data
            if (!finalPlan || (!finalPlan.weather && !finalPlan.touristAttractions)) {
                console.warn('Could not parse complete plan, attempting partial extraction...');
                
                // Try to extract any valid sections from raw response
                if (data.plan.rawResponse) {
                    const rawText = data.plan.rawResponse;
                    
                    // Helper function to extract JSON sections
                    function extractSection(text, sectionName) {
                        try {
                            // Try multiple patterns for the section
                            const patterns = [
                                new RegExp(`"${sectionName}"\s*:\s*(\[[^\]]*\])`, 'gs'), // Array pattern
                                new RegExp(`"${sectionName}"\s*:\s*(\{[^}]*\})`, 'gs'), // Object pattern
                                new RegExp(`'${sectionName}'\s*:\s*(\[[^\]]*\])`, 'gs'), // Single quotes array
                                new RegExp(`'${sectionName}'\s*:\s*(\{[^}]*\})`, 'gs') // Single quotes object
                            ];
                            
                            for (const pattern of patterns) {
                                const match = pattern.exec(text);
                                if (match) {
                                    try {
                                        return JSON.parse(match[1]);
                                    } catch (parseError) {
                                        // Try to fix common JSON issues
                                        let fixed = match[1].replace(/,\s*([\]}])/g, '$1'); // Remove trailing commas
                                        return JSON.parse(fixed);
                                    }
                                }
                            }
                            return null;
                        } catch (e) {
                            console.warn(`Failed to extract ${sectionName}:`, e);
                            return null;
                        }
                    }
                    
                    finalPlan = {
                        weather: extractSection(rawText, 'weather') || [],
                        touristAttractions: extractSection(rawText, 'touristAttractions') || [],
                        restaurants: extractSection(rawText, 'restaurants') || [],
                        packingEssentials: extractSection(rawText, 'packingEssentials') || [],
                        accommodations: extractSection(rawText, 'accommodations') || [],
                        localTransportation: extractSection(rawText, 'localTransportation') || { options: [] },
                        localEvents: extractSection(rawText, 'localEvents') || [],
                        tripCost: extractSection(rawText, 'tripCost') || {},
                        safetyTips: extractSection(rawText, 'safetyTips') || []
                    };
                    
                    // Check if we got at least some data
                    if (finalPlan.weather.length > 0 || finalPlan.touristAttractions.length > 0) {
                        console.log('✓ Partial data extracted successfully');
                    } else {
                        // Complete failure
                        console.error('Failed to parse AI response. Raw response:', data.plan.rawResponse);
                        planResult.innerHTML = `
                            <div class="alert alert-error">
                                <strong>Error:</strong> Could not parse the AI response.<br>
                                <small>The AI returned data in an unexpected format. Please try generating the plan again.</small>
                                ${data.plan.parseError ? `<br><small style="color: #999; margin-top: 0.5rem; display: block;">Technical: ${data.plan.parseError}</small>` : ''}
                            </div>
                        `;
                        return;
                    }
                } else {
                    planResult.innerHTML = `
                        <div class="alert alert-error">
                            <strong>Error:</strong> No response received from AI.<br>
                            <small>Please try again.</small>
                        </div>
                    `;
                    return;
                }
            }
            
            // Store plan data globally for saving
            window.currentPlanData = finalPlan;
            window.currentFormData = formData;
            
            // Display the structured plan
            const formattedPlan = formatStructuredPlan(finalPlan, formData);
            planResult.innerHTML = formattedPlan;
            
            // Scroll to plan result
            planResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            // Even if there's an error, try to show raw response if available
            if (data.plan && data.plan.rawResponse) {
                console.log('Showing raw response as fallback');
                const rawPlan = {
                    weather: [],
                    touristAttractions: [],
                    restaurants: [],
                    packingEssentials: [],
                    accommodations: [],
                    localTransportation: { options: [] },
                    localEvents: [],
                    tripCost: {},
                    safetyTips: [],
                    rawResponse: data.plan.rawResponse
                };
                
                // Store plan data globally
                window.currentPlanData = rawPlan;
                window.currentFormData = formData;
                
                // Display the plan
                const formattedPlan = formatStructuredPlan(rawPlan, formData);
                planResult.innerHTML = `
                    <div class="alert alert-warning">
                        <strong>AI Response Format Issue:</strong> The AI returned data in an unexpected format, but here's what we could extract:
                    </div>
                    ${formattedPlan}
                `;
            } else {
                planResult.innerHTML = `
                    <div class="alert alert-error">
                        ${data.error || 'Failed to generate plan. Please try again.'}
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error generating plan:', error);
        planResult.innerHTML = `
            <div class="alert alert-error">
                An error occurred while generating your plan. Please try again.
            </div>
        `;
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
    });
}

// Format structured JSON plan with modern, beautiful design
export function formatStructuredPlan(plan, formData) {
    console.log('formatStructuredPlan called with plan:', plan);
    console.log('formData:', formData);
    let html = `
        <style>
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .plan-section {
                animation: fadeInUp 0.6s ease-out;
            }
            .modern-card {
                transition: all 0.3s ease;
                background: white;
                border-radius: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                overflow: hidden;
            }
            .modern-card:hover {
                transform: translateY(-4px);
                box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            }
            .gradient-bg {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .section-title {
                background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                font-weight: 700;
                font-size: 1.75rem;
            }
        </style>
        <div class="plan-container" style="max-width: 1200px; margin: 0 auto; padding: 2rem;">
            <!-- Header Section -->
            <div class="plan-section" style="text-align: center; margin-bottom: 3rem;">
                <h1 style="font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 1rem;">
                    ✨ Your Perfect Trip Plan
                </h1>
                <div style="display: inline-flex; gap: 2rem; padding: 1.5rem 2.5rem; background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); border-radius: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); margin-top: 1.5rem;">
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px;">📍 Destination</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-color);">${formData.destination}</div>
                    </div>
                    <div style="width: 1px; background: #e0e0e0;"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px;">Duration</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-color);">${formData.startDate} to ${formData.endDate}</div>
                    </div>
                    <div style="width: 1px; background: #e0e0e0;"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px;">👥 Travelers</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-color);">${formData.numberOfPeople}</div>
                    </div>
                    <div style="width: 1px; background: #e0e0e0;"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px;">💰 Budget</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-color);">${formData.budget}</div>
                    </div>
                </div>
            </div>
    `;

    // 1. Weather Forecast Section
    if (plan.weather && plan.weather.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #FFD89B 0%, #19547B 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">☀️</span>
                    </div>
                    Weather Forecast
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1.25rem;">
        `;
        plan.weather.forEach((day, idx) => {
            const icon = getWeatherIcon(day.condition);
            html += `
                <div class="modern-card" style="padding: 1.5rem; text-align: center; background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);">
                    <div style="font-size: 3rem; margin-bottom: 0.75rem; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));">${icon}</div>
                    <div style="font-weight: 700; color: #2d3748; margin-bottom: 0.5rem; font-size: 0.95rem;">${formatDate(day.date)}</div>
                    <div style="color: #4a5568; font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">${day.temperature || 'N/A'}</div>
                    <div style="color: #718096; font-size: 0.85rem; line-height: 1.4;">${day.description || day.condition}</div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 2. Tourist Attractions Section
    if (plan.touristAttractions && plan.touristAttractions.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">📍</span>
                    </div>
                    Tourist Attractions
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
        `;
        plan.touristAttractions.forEach(attraction => {
            html += `
                <div class="modern-card">
                    <div style="position: relative; height: 220px; overflow: hidden;">
                        <img src="assets/attraction.jpg" alt="${attraction.name}" 
                             onerror="this.src='https://via.placeholder.com/400x220?text='+encodeURIComponent('${attraction.name}')" 
                             style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;">
                        <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);"></div>
                    </div>
                    <div style="padding: 1.5rem;">
                        <h3 style="color: #2d3748; margin: 0 0 0.75rem 0; font-size: 1.25rem; font-weight: 700; line-height: 1.3;">${attraction.name}</h3>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: #718096; font-size: 0.9rem;">
                            <span>📍</span>
                            <span>${attraction.location || 'N/A'}</span>
                        </div>
                        <p style="color: #4a5568; font-size: 0.95rem; line-height: 1.7; margin: 0;">${attraction.description || ''}</p>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 3. Popular Restaurants Section
    if (plan.restaurants && plan.restaurants.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">🍽️</span>
                    </div>
                    Popular Restaurants
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
        `;
        plan.restaurants.forEach(restaurant => {
            const stars = getStarRating(restaurant.rating);
            html += `
                <div class="modern-card" style="padding: 1.75rem;">
                    <h3 style="color: #2d3748; margin: 0 0 0.5rem 0; font-size: 1.2rem; font-weight: 700;">${restaurant.name}</h3>
                    <div style="display: inline-block; padding: 0.25rem 0.75rem; background: #f0f4f8; border-radius: 20px; color: #4a5568; font-size: 0.85rem; margin-bottom: 1rem;">
                        ${restaurant.cuisine || 'Various'}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); border-radius: 12px; margin-bottom: 1rem;">
                        <div style="color: #ffa500; font-size: 1.1rem; font-weight: 600;">${stars}</div>
                        <div style="color: var(--primary-color); font-weight: 700; font-size: 1rem;">${restaurant.priceRange || 'N/A'}</div>
                    </div>
                    <p style="color: #4a5568; font-size: 0.9rem; line-height: 1.7; margin: 0;">${restaurant.description || ''}</p>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 4. Packing Essentials Section
    if (plan.packingEssentials && plan.packingEssentials.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">🎒</span>
                    </div>
                    Packing Essentials
                </h2>
                <div class="modern-card" style="padding: 2rem; background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%);">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.75rem;">
        `;
        plan.packingEssentials.forEach(item => {
            html += `
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--primary-color); flex-shrink: 0;"></div>
                    <span style="color: #4a5568; font-size: 0.95rem;">${item}</span>
                </div>
            `;
        });
        html += `</div></div></div>`;
    }

    // 5. Accommodations Section
    if (plan.accommodations && plan.accommodations.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">🏨</span>
                    </div>
                    Accommodations
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 1.5rem;">
        `;
        plan.accommodations.forEach(accommodation => {
            const stars = getStarRating(accommodation.rating);
            html += `
                <div class="modern-card" style="padding: 1.75rem;">
                    <h3 style="color: #2d3748; margin: 0 0 0.5rem 0; font-size: 1.2rem; font-weight: 700;">${accommodation.name}</h3>
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: #718096; font-size: 0.9rem;">
                        <span>📍</span>
                        <span>${accommodation.location || 'N/A'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); border-radius: 12px; margin-bottom: 1.25rem;">
                        <div style="color: #ffa500; font-size: 1.1rem; font-weight: 600;">${stars}</div>
                        <div style="color: var(--primary-color); font-weight: 700; font-size: 1.1rem;">${accommodation.price || 'N/A'}</div>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <div style="font-weight: 600; color: #4a5568; font-size: 0.9rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Main Facilities</div>
                        <div style="display: flex; flex-wrap: gap: 0.5rem;">
            `;
            (accommodation.facilities || []).slice(0, 3).forEach(facility => {
                html += `
                    <span style="padding: 0.5rem 1rem; background: var(--primary-color); color: white; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">
                        ${facility}
                    </span>
                `;
            });
            html += `
                        </div>
                    </div>
                    <p style="color: #4a5568; font-size: 0.9rem; line-height: 1.7; margin: 0;">${accommodation.description || ''}</p>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 6. Local Transportation Section
    if (plan.localTransportation && plan.localTransportation.options && plan.localTransportation.options.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">🚗</span>
                    </div>
                    Local Transportation
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
        `;
        plan.localTransportation.options.forEach(option => {
            html += `
                <div class="modern-card" style="padding: 1.5rem;">
                    <h3 style="color: #2d3748; margin: 0 0 0.75rem 0; font-size: 1.1rem; font-weight: 700;">${option.type}</h3>
                    <div style="padding: 0.75rem 1rem; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); color: white; border-radius: 10px; font-weight: 700; font-size: 1rem; margin-bottom: 1rem; text-align: center;">
                        ${option.cost || 'N/A'}
                    </div>
                    <p style="color: #4a5568; font-size: 0.9rem; line-height: 1.7; margin: 0;">${option.description || ''}</p>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 7. Local Events Section
    if (plan.localEvents && plan.localEvents.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">🎉</span>
                    </div>
                    Local Events
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem;">
        `;
        plan.localEvents.forEach(event => {
            html += `
                <div class="modern-card" style="padding: 1.75rem;">
                    <h3 style="color: #2d3748; margin: 0 0 0.75rem 0; font-size: 1.1rem; font-weight: 700;">${event.name}</h3>
                    ${event.date ? `
                        <div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: #f0f4f8; border-radius: 20px; margin-bottom: 1rem;">
                            <span>📅</span>
                            <span style="color: #4a5568; font-size: 0.9rem; font-weight: 500;">${event.date}</span>
                        </div>
                    ` : ''}
                    <p style="color: #4a5568; font-size: 0.9rem; line-height: 1.7; margin: 0;">${event.description || ''}</p>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 8. Trip Cost Section
    if (plan.tripCost) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">💰</span>
                    </div>
                    Trip Cost Breakdown
                </h2>
                <div class="modern-card" style="padding: 2rem; background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%);">
                    <div style="display: grid; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <span style="color: #4a5568; font-weight: 500;">Accommodation</span>
                            <strong style="color: #2d3748; font-size: 1.1rem;">${plan.tripCost.accommodation || 'N/A'}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <span style="color: #4a5568; font-weight: 500;">Food</span>
                            <strong style="color: #2d3748; font-size: 1.1rem;">${plan.tripCost.food || 'N/A'}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <span style="color: #4a5568; font-weight: 500;">Transportation</span>
                            <strong style="color: #2d3748; font-size: 1.1rem;">${plan.tripCost.transportation || 'N/A'}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <span style="color: #4a5568; font-weight: 500;">Attractions</span>
                            <strong style="color: #2d3748; font-size: 1.1rem;">${plan.tripCost.attractions || 'N/A'}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                            <span style="color: #4a5568; font-weight: 500;">Miscellaneous</span>
                            <strong style="color: #2d3748; font-size: 1.1rem;">${plan.tripCost.miscellaneous || 'N/A'}</strong>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); color: white; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,103,52,0.3);">
                        <span style="font-size: 1.3rem; font-weight: 700;">Total Cost</span>
                        <span style="font-size: 1.5rem; font-weight: 800;">${plan.tripCost.total || 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <!-- AI Trip Details Section -->
            ${plan.trip ? `
            <div class="plan-section">
                <div class="modern-card">
                    <div style="padding: 2rem;">
                        <h2 class="section-title" style="margin-bottom: 1.5rem;">
                            🗺️ Trip Details
                        </h2>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
                            ${plan.trip.destination ? `
                            <div style="background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #e8eaf6;">
                                <div style="font-weight: 600; color: #333; margin-bottom: 0.5rem;">📍 Destination</div>
                                <div style="color: var(--primary-color); font-size: 1.1rem;">${plan.trip.destination}</div>
                            </div>
                            ` : ''}
                            ${plan.trip.duration ? `
                            <div style="background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #e8eaf6;">
                                <div style="font-weight: 600; color: #333; margin-bottom: 0.5rem;">📅 Duration</div>
                                <div style="color: var(--primary-color); font-size: 1.1rem;">${plan.trip.duration}</div>
                            </div>
                            ` : ''}
                            ${plan.trip.travelers ? `
                            <div style="background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #e8eaf6;">
                                <div style="font-weight: 600; color: #333; margin-bottom: 0.5rem;">👥 Travelers</div>
                                <div style="color: var(--primary-color); font-size: 1.1rem;">${plan.trip.travelers} people</div>
                            </div>
                            ` : ''}
                            ${plan.trip.total_budget ? `
                            <div style="background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); padding: 1.5rem; border-radius: 12px; border: 1px solid #e8eaf6;">
                                <div style="font-weight: 600; color: #333; margin-bottom: 0.5rem;">💰 Budget</div>
                                <div style="color: var(--primary-color); font-size: 1.1rem;">${plan.trip.currency || 'PKR'} ${plan.trip.total_budget.toLocaleString()}</div>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}
        `;
    }
    
    // 9. Itinerary Section
    if (plan.itinerary && plan.itinerary.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 class="section-title" style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 1.5rem;">📅</span>
                    </div>
                    Daily Itinerary
                </h2>
                <div style="display: grid; gap: 1.5rem;">
        `;
        plan.itinerary.forEach((day, index) => {
            html += `
                <div class="modern-card" style="padding: 1.75rem;">
                    <h3 style="color: #2d3748; margin: 0 0 1rem 0; font-size: 1.2rem; font-weight: 700;">Day ${index + 1}: ${day.day || 'Day ' + (index + 1)}</h3>
                    <div style="color: #4a5568; line-height: 1.7; white-space: pre-line;">${day.activities || day.description || ''}</div>
                </div>
            `;
        });
        html += `</div></div>`;
    }
    
    // 10. Safety Tips Section
    if (plan.safetyTips && plan.safetyTips.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 3rem;">
                <h2 style="font-size: 1.75rem; font-weight: 700; color: #1e293b; margin-bottom: 1.5rem; padding-bottom: 0.75rem; border-bottom: 3px solid var(--primary-color);">
                    Safety Tips
                </h2>
                <div class="modern-card" style="padding: 2rem; background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%); border-left: 5px solid var(--primary-color);">
                    <div style="display: grid; gap: 1rem;">
        `;
        plan.safetyTips.forEach(tip => {
            html += `
                <div style="display: flex; align-items: start; gap: 1rem; padding: 1rem 1.25rem; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--primary-color); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 0.25rem;">
                        <span style="color: white; font-size: 0.75rem; font-weight: 700;">✓</span>
                    </div>
                    <p style="color: #4a5568; font-size: 0.95rem; line-height: 1.7; margin: 0; flex: 1;">${tip}</p>
                </div>
            `;
        });
        html += `</div></div></div>`;
    }

    html += `
            <div style="text-align: center; margin-top: 3rem; padding-top: 2rem; border-top: 2px solid #e8eaf6;">
                <button class="btn btn-primary" onclick="savePlan()" style="padding: 1rem 3rem; font-size: 1rem; font-weight: 700; border-radius: 10px; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); color: white; border: none; cursor: pointer; box-shadow: 0 8px 24px rgba(0,103,52,0.3); transition: all 0.3s ease;">
                    Save Trip Plan
                </button>
            </div>
        </div>
    `;

    return html;
}

// Helper functions
export function getWeatherIcon(condition) {
    const icons = {
        'sunny': '☀️',
        'cloudy': '☁️',
        'rainy': '🌧️',
        'partly-cloudy': '⛅',
        'clear': '☀️',
        'overcast': '☁️',
        'rain': '🌧️',
        'snow': '❄️',
        'windy': '💨'
    };
    return icons[condition?.toLowerCase()] || '🌤️';
}

export function getStarRating(rating) {
    if (!rating) return 'N/A';
    const num = parseFloat(rating);
    if (isNaN(num)) return rating;
    const fullStars = Math.floor(num);
    const hasHalf = num % 1 >= 0.5;
    let stars = '⭐'.repeat(fullStars);
    if (hasHalf) stars += '½';
    return stars + ` (${num.toFixed(1)})`;
}

export function formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
        return dateString;
    }
}

// Fallback format plan function for text responses
function formatPlan(planText) {
    if (!planText) return '<p>No plan content available.</p>';
    
    let formatted = '';
    const lines = planText.split('\n');
    
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        
        if (line.match(/^#\s+(.+)$/)) {
            const title = line.replace(/^#+\s+/, '');
            formatted += `<h2 class="plan-title">${title}</h2>`;
        } else if (line.match(/^##\s+(.+)$/)) {
            const title = line.replace(/^##+\s+/, '');
            formatted += `<h3 class="plan-subtitle">${title}</h3>`;
        } else if (line.match(/^[-•*]\s+(.+)$/)) {
            const content = line.replace(/^[-•*]\s+/, '');
            formatted += `<li class="plan-list-item">${content}</li>`;
        } else {
            formatted += `<p class="plan-paragraph">${line}</p>`;
        }
    }
    
    return formatted || '<p>Plan content is being processed...</p>';
}

// Save plan function
window.savePlan = async function() {
    const user = auth.currentUser;
    if (!user) {
        alert('Please login to save your trip plan');
        window.location.href = 'profile.html';
        return;
    }
    
    try {
        // Get the current plan data from the global variable
        if (!window.currentPlanData) {
            alert('No plan data available to save. Please generate a plan first.');
            return;
        }
        
        // Get form data with null checks
        const destinationEl = document.getElementById('destination');
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');
        const numberOfPeopleEl = document.getElementById('numberOfPeople');
        const budgetEl = document.getElementById('budget');
        const accommodationTypeEl = document.getElementById('accommodationType');
        const specialRequirementsEl = document.getElementById('specialRequirements');
        
        if (!destinationEl || !startDateEl || !endDateEl) {
            alert('Error: Form elements not found. Please try again.');
            return;
        }
        
        const savedPlanData = {
            userId: user.uid,
            destination: destinationEl.value,
            startDate: startDateEl.value,
            endDate: endDateEl.value,
            numberOfPeople: numberOfPeopleEl ? numberOfPeopleEl.value : '1',
            budget: budgetEl ? budgetEl.value : 'Not specified',
            accommodationType: accommodationTypeEl ? accommodationTypeEl.value : 'Not specified',
            preferences: Array.from(document.querySelectorAll('input[name="preferences"]:checked')).map(cb => cb.value),
            specialRequirements: specialRequirementsEl ? (specialRequirementsEl.value || 'None') : 'None',
            planData: window.currentPlanData, // Save structured JSON data
            savedAt: serverTimestamp()
        };
        
        await addDoc(collection(db, 'savedPlans'), savedPlanData);
        
        alert('Trip plan saved successfully! You can view it in your profile.');
    } catch (error) {
        alert('Failed to save plan: ' + error.message);
    }
};

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        const profileLink = document.getElementById('profile-link');
        if (profileLink) profileLink.textContent = 'Profile';
    }
});
