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
            // Show login message on page
            const formContainer = document.querySelector('.form-container');
            const planResult = document.getElementById('plan-result');
            if (formContainer) formContainer.style.display = 'none';
            if (planResult) {
                planResult.classList.remove('hidden');
                planResult.innerHTML = `
                    <div class="alert alert-error" style="text-align: center; padding: 2rem;">
                        <h3 style="margin-bottom: 1rem; color: var(--primary-color);">Login Required</h3>
                        <p style="margin-bottom: 1.5rem; color: #666;">Please login to use the AI Trip Planner feature.</p>
                        <a href="login.html" class="btn btn-primary" style="display: inline-block; padding: 0.75rem 2rem; text-decoration: none;">Go to Login</a>
                    </div>
                `;
            }
        } else {
            // User is logged in - show form
            const formContainer = document.querySelector('.form-container');
            if (formContainer) formContainer.style.display = 'block';
            // Initialize form elements
            initFormElements();
        }
    }
});

// Only initialize form elements if user is logged in
const initFormElements = () => {
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
}

// Set minimum date to today (only if elements exist)
const today = new Date().toISOString().split('T')[0];
const startDateEl = document.getElementById('startDate');
const endDateEl = document.getElementById('endDate');

if (startDateEl && endDateEl) {
    startDateEl.setAttribute('min', today);
    endDateEl.setAttribute('min', today);

    // Update end date minimum when start date changes
    startDateEl.addEventListener('change', function () {
        const startDate = this.value;
        endDateEl.setAttribute('min', startDate);
    });
}

// Handle form submission (only if form exists)
const tripPlanForm = document.getElementById('trip-plan-form');
if (tripPlanForm) {
    tripPlanForm.addEventListener('submit', async function (e) {
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
            departure: document.getElementById('departure').value,
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

// Function to get image URL - uses keyword-based image mapping
function getAttractionImage(attractionName) {
    
    return 'assets/attraction.jpg';
}

// Format structured JSON plan with modern, beautiful design
export function formatStructuredPlan(plan, formData) {
    console.log('formatStructuredPlan called with plan:', plan);

    // Extract all values from formData
    if (!formData) formData = {};
    const departure = formData.departure || 'Your Location';
    const destination = formData.destination || 'Unknown';
    const startDate = formData.startDate || 'N/A';
    const endDate = formData.endDate || 'N/A';
    const numberOfPeople = formData.numberOfPeople || '1';
    const budget = formData.budget || '0';

    let html = `
        <div class="plan-container" style="max-width: 1200px; margin: 0 auto; padding: 2rem 2; ">
            <!-- Header Section -->
            <div class="plan-section" style="text-align: center; margin-bottom: 3rem; animation: fadeIn 0.8s ease-out;">
                <h1 style="font-size: 3rem; font-weight: 800; background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary-light) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 1rem;">
                    Your Perfect Trip Plan
                </h1>
                <!-- Route Display -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 2rem; font-size: 1.2rem; font-weight: 600; flex-wrap: wrap;">
                    <div style="background: var(--white); color: var(--text-dark); padding: 0.75rem 1.5rem; border-radius: 100px; box-shadow: var(--shadow); border: 1px solid rgba(0,0,0,0.05);">${departure}</div>
                    <div style="color: var(--primary-color); font-size: 1.5rem;"><i class="fa-solid fa-arrow-right"></i></div>
                    <div style="background: var(--primary-color); color: white; padding: 0.75rem 1.5rem; border-radius: 100px; box-shadow: var(--shadow-hover);">${destination}</div>
                </div>
                
                <div class="glass-panel" style="display: inline-flex; gap: 2rem; padding: 1.5rem 2.5rem; border-radius: 24px; margin-top: 1rem; flex-wrap: wrap; justify-content: center;">
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Duration</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-dark);">${startDate} - ${endDate}</div>
                    </div>
                    <div style="width: 1px; background: rgba(0,0,0,0.1); min-height: 40px;"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Travelers</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-dark);">${numberOfPeople} Person(s)</div>
                    </div>
                    <div style="width: 1px; background: rgba(0,0,0,0.1); min-height: 40px;"></div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: var(--text-light); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Budget</div>
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--primary-dark);">PKR ${budget}</div>
                    </div>
                </div>
            </div>
    `;

    // Helper to interpret inputs like '1.5 lac', '150k', etc.
    const normalizeBudget = (input) => {
        if (!input) return 0;
        const str = String(input).toLowerCase().replace(/\s+/g, '');
        const lacMatch = str.match(/([0-9]*\.?[0-9]+)\s*(lac|lakh)/);
        if (lacMatch) return Math.round(parseFloat(lacMatch[1]) * 100000);
        const kMatch = str.match(/([0-9]*\.?[0-9]+)\s*k/);
        if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
        return parseInt(str.replace(/[^0-9]/g, '')) || 0;
    };

    // Calculate budget amount for comparison using same logic as backend
    const budgetAmount = normalizeBudget(budget);

    // Ensure every cost field is present (no N/A allowed)
    const costDefaults = {
        transportation: 'PKR 0',
        accommodation: 'PKR 0',
        food: 'PKR 0',
        activities: 'PKR 0',
        visa: 'PKR 0',
        additional_expenses: 'PKR 0',
        total: 'PKR 0'
    };
    if (!plan.tripCost) plan.tripCost = { ...costDefaults };
    // If backend sent separate main/local, merge them
    if (plan.tripCost.main_transport || plan.tripCost.local_transport) {
        const main = parseInt((plan.tripCost.main_transport||'').toString().replace(/[^0-9]/g,''))||0;
        const local = parseInt((plan.tripCost.local_transport||'').toString().replace(/[^0-9]/g,''))||0;
        const combined = Number(main) + Number(local);
        // Format with thousands separator for clarity
        plan.tripCost.transportation = `PKR ${combined.toLocaleString('en-PK')}`;
    }
    plan.tripCost = { ...costDefaults, ...plan.tripCost };

    // Budget Comparison - prefer backend-calculated total if available
    let totalCost = 0;
    if (plan.calculatedTotalCost) {
        totalCost = parseInt(plan.calculatedTotalCost.toString().replace(/[^0-9]/g, '')) || 0;
    }
    if (!totalCost) {
        const totalCostStr = (plan.tripCost && plan.tripCost.total ? plan.tripCost.total.toString() : '0');
        totalCost = parseInt(totalCostStr.replace(/[^0-9]/g, '')) || 0;
    }

    if (totalCost > 0) {
        const diff = totalCost - budgetAmount;
        const absDiff = Math.abs(diff);
        let budgetStatus = 'fits';
        if (diff > 0) budgetStatus = 'exceeds';
        else if (diff < 0) budgetStatus = 'under';
        if (Math.abs(diff) <= budgetAmount * 0.05) budgetStatus = 'fits';
        const statusColor = budgetStatus === 'exceeds' ? '#d32f2f' : budgetStatus === 'under' ? '#006734' : '#1976d2';
        const statusBg = budgetStatus === 'exceeds' ? '#ffebee' : budgetStatus === 'under' ? '#e8f5e9' : '#e3f2fd';
        let message = '';
        if (budgetStatus === 'exceeds') message = `Your trip exceeds your budget by PKR ${absDiff}.`;
        else if (budgetStatus === 'under') message = `Good news! Your trip will cost PKR ${totalCost}, saving you PKR ${absDiff} from your budget.`;
        else message = `Your trip fits well within your budget.`;

        html += `
            <div class="plan-section" style="margin-bottom: 3rem; animation: fadeInUp 0.5s ease-out;">
                <div style="background: ${statusBg}; border-left: 4px solid ${statusColor}; padding: 1.5rem; border-radius: 12px; display: flex; align-items: center; gap: 1rem;">
                    <div style="font-size: 1.5rem; color: ${statusColor};"><i class="fa-solid fa-wallet"></i></div>
                    <div>
                        <h3 style="color: ${statusColor}; margin: 0 0 0.25rem 0; font-size: 1.1rem;">Budget Analysis</h3>
                        <p style="color: var(--text-dark); margin: 0; font-size: 0.95rem;">${message}</p>
                        ${budgetStatus==='exceeds' ? `<ul style="margin-top:0.75rem; padding-left:1.25rem; color:#555; font-size:0.9rem; line-height:1.6;">
                            <li>Consider cheaper accommodation options.</li>
                            <li>Travel on off-peak dates or shorten trip duration.</li>
                            <li>Opt for budget-friendly transport or reduce paid activities.</li>
                        </ul>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Helper for section titles
    const renderSectionTitle = (icon, title, colorStart, colorEnd) => `
        <h2 class="section-title" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem;">
            <div style="width: 50px; height: 50px; border-radius: 16px; background: linear-gradient(135deg, ${colorStart} 0%, ${colorEnd} 100%); display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
                <i class="${icon}" style="font-size: 1.5rem;"></i>
            </div>
            <span style="background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary-light) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${title}</span>
        </h2>
    `;

    // 1. Main Transport Options (BEFORE Weather)
    if (plan.mainTransportation && plan.mainTransportation.options && plan.mainTransportation.options.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-bus', 'Main Transport Options', 'var(--primary-color)', 'var(--primary-dark)')}
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
        `;
        plan.mainTransportation.options.forEach((option, idx) => {
            const transportIcon = option.type.toLowerCase().includes('bus') ? 'fa-bus' :
                                 option.type.toLowerCase().includes('train') ? 'fa-train' :
                                 option.type.toLowerCase().includes('taxi') ? 'fa-taxi' :
                                 option.type.toLowerCase().includes('wagon') ? 'fa-van-shuttle' :
                                 'fa-car';
            
            html += `
                <div class="glass-panel" style="padding: 2rem; border-radius: 20px; background: rgba(0, 103, 52, 0.05); border: 2px solid rgba(0, 103, 52, 0.2); transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 15px 40px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.05)'">
                    <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.8rem; box-shadow: 0 8px 20px rgba(0,0,0,0.15);">
                            <i class="fa-solid ${transportIcon}"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; color: var(--primary-dark); font-size: 1.3rem; font-weight: 700;">${option.type}</h3>
                            <p style="margin: 0.25rem 0 0 0; color: var(--text-light); font-size: 0.9rem;">From ${departure} to ${destination}</p>
                        </div>
                    </div>
                    <div style="background: white; padding: 1.5rem; border-radius: 16px; margin-bottom: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                            <span style="color: var(--text-light); font-weight: 600;">Estimated Cost</span>
                            <span style="font-size: 1.5rem; font-weight: 800; color: var(--primary-color);">${option.cost || 'N/A'}</span>
                        </div>
                        <p style="margin: 0; color: #4a5568; line-height: 1.6; font-size: 0.95rem;">${option.description || 'Travel option available'}</p>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 2. Weather Forecast
    if (plan.weather && plan.weather.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-cloud-sun', 'Weather Forecast', '#FFD89B', '#19547B')}
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
        `;
        plan.weather.forEach((day, idx) => {
            const icon = getWeatherIcon(day.condition);
            html += `
                <div class="card" style="text-align: center; padding: 2rem 1.5rem; align-items: center;">
                    <div style="font-size: 3.5rem; margin-bottom: 1rem; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.1));">${icon}</div>
                    <div style="font-weight: 700; color: var(--primary-dark); margin-bottom: 0.5rem; font-size: 1.1rem;">${formatDate(day.date)}</div>
                    <div style="color: var(--text-dark); font-size: 1.25rem; font-weight: 800; margin-bottom: 0.5rem;">${day.temperature || 'N/A'}</div>
                    <div style="color: var(--text-light); font-size: 0.9rem;">${day.description || day.condition}</div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 2. Tourist Attractions
    if (plan.touristAttractions && plan.touristAttractions.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-map-location-dot', 'Tourist Attractions', '#006734', '#008045')}
                <div class="card-grid uniform-cards">
        `;
        plan.touristAttractions.forEach((attraction, idx) => {
            const imgId = `attraction-img-${idx}`;
            // Placeholder SVG
            const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250'%3E%3Crect fill='%23f0f4f2' width='400' height='250'/%3E%3Ctext x='50%25' y='50%25' font-size='24' fill='%23006734' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif' font-weight='bold'%3E${encodeURIComponent(attraction.name)}%3C/text%3E%3C/svg%3E`;

            html += `
                <div class="card">
                    <div class="card-image-wrapper" style="height: 200px;">
                        <img id="${imgId}" src="${placeholderSvg}" alt="${attraction.name}" class="card-image">
                    </div>
                    <div class="card-content">
                        <h3 class="card-title">${attraction.name}</h3>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: var(--text-light); font-size: 0.9rem;">
                            <i class="fa-solid fa-location-dot" style="color: var(--primary-color);"></i>
                            <span>${attraction.location || 'N/A'}</span>
                        </div>
                        <p class="card-text">${attraction.description || ''}</p>
                    </div>
                </div>
            `;
        });

        // Load images after HTML is rendered
        setTimeout(() => {
            plan.touristAttractions.forEach((attraction, idx) => {
                const imgId = `attraction-img-${idx}`;
                const img = document.getElementById(imgId);
                if (img) {
                    const imageUrl = getAttractionImage(attraction.name);
                    if (imageUrl) img.src = imageUrl;
                }
            });
        }, 100);
        html += `</div></div>`;
    }

    // 3. Restaurants
    if (plan.restaurants && plan.restaurants.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-utensils', 'Popular Restaurants', '#ffecd2', '#fcb69f')}
                <div class="card-grid uniform-cards">
        `;
        plan.restaurants.forEach(restaurant => {
            const stars = getStarRating(restaurant.rating);
            html += `
                <div class="card">
                    <div class="card-content">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <h3 class="card-title" style="margin: 0;">${restaurant.name}</h3>
                            <div style="background: #f0f4f2; padding: 0.25rem 0.75rem; border-radius: 100px; font-size: 0.75rem; font-weight: 600; color: var(--primary-dark);">${restaurant.cuisine || 'Various'}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem;">
                            <div style="color: #FFA500; font-size: 0.9rem;">${stars}</div>
                            <span style="color: var(--text-light); font-size: 0.85rem;">•</span>
                            <div style="color: var(--primary-color); font-weight: 600; font-size: 0.9rem;">${restaurant.priceRange || 'N/A'}</div>
                        </div>
                        <p class="card-text">${restaurant.description || ''}</p>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 4. Packing Essentials
    if (plan.packingEssentials && plan.packingEssentials.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-suitcase', 'Packing Essentials', '#a8edea', '#fed6e3')}
                <div class="glass-panel" style="padding: 2rem; border-radius: 24px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        `;
        plan.packingEssentials.forEach(item => {
            html += `
                <div style="display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: white; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.03); transition: transform 0.2s;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--primary-light); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;"><i class="fa-solid fa-check"></i></div>
                    <span style="color: var(--text-dark); font-weight: 500;">${item}</span>
                </div>
            `;
        });
        html += `</div></div></div>`;
    }

    // 5. Accommodations
    if (plan.accommodations && plan.accommodations.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-hotel', 'Accommodations', '#ff9a9e', '#fecfef')}
                <div class="card-grid uniform-cards">
        `;
        plan.accommodations.forEach(accommodation => {
            const stars = getStarRating(accommodation.rating);
            html += `
                <div class="card">
                    <div class="card-content">
                        <h3 class="card-title">${accommodation.name}</h3>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; color: var(--text-light); font-size: 0.9rem;">
                            <i class="fa-solid fa-location-dot" style="color: var(--primary-color);"></i>
                            <span>${accommodation.location || 'N/A'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: #f8f9fa; border-radius: 12px; margin-bottom: 1rem;">
                            <div style="color: #FFA500; font-size: 0.9rem;">${stars}</div>
                            <div style="color: var(--primary-color); font-weight: 700;">${accommodation.price || 'N/A'}</div>
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
            `;
            (accommodation.facilities || []).slice(0, 3).forEach(facility => {
                html += `
                    <span style="padding: 0.25rem 0.75rem; background: rgba(0, 103, 52, 0.1); color: var(--primary-dark); border-radius: 100px; font-size: 0.75rem; font-weight: 600;">
                        ${facility}
                    </span>
                `;
            });
            html += `
                            </div>
                        </div>
                        <p class="card-text">${accommodation.description || ''}</p>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 6. Local Transportation
    if (plan.localTransportation && plan.localTransportation.options && plan.localTransportation.options.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-car', 'Local Transportation', '#667eea', '#764ba2')}
                <div class="card-grid uniform-cards">
        `;
        plan.localTransportation.options.forEach(option => {
            html += `
                <div class="card">
                    <div class="card-content">
                        <h3 class="card-title">${option.type}</h3>
                        <div style="padding: 0.5rem 1rem; background: var(--primary-gradient); color: white; border-radius: 10px; font-weight: 700; font-size: 1rem; margin-bottom: 1rem; text-align: center;">
                            ${option.cost || 'N/A'}
                        </div>
                        <p class="card-text">${option.description || ''}</p>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 7. Local Events
    if (plan.localEvents && plan.localEvents.length > 0) {
        html += `
            <div class="plan-section" style="margin-bottom: 4rem;">
                ${renderSectionTitle('fa-solid fa-calendar-days', 'Local Events', '#fbc2eb', '#a6c1ee')}
                <div class="card-grid uniform-cards">
        `;
        plan.localEvents.forEach(event => {
            html += `
                <div class="card">
                    <div class="card-content">
                        <h3 class="card-title">${event.name}</h3>
                        ${event.date ? `
                            <div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: #f0f4f8; border-radius: 20px; margin-bottom: 1rem;">
                                <span>📅</span>
                                <span style="color: var(--text-light); font-size: 0.9rem; font-weight: 500;">${event.date}</span>
                            </div>
                        ` : ''}
                        <p class="card-text">${event.description || ''}</p>
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    }

    // 8. Trip Cost
    if (plan.tripCost) {
        html += `
            <div class="plan-section" style="margin-bottom: 2rem;">
                ${renderSectionTitle('fa-solid fa-coins', 'Trip Cost Breakdown', '#ffecd2', '#fcb69f')}
                <div class="glass-panel" style="padding: 2.5rem; border-radius: 24px; max-width: 800px; margin: 0 auto;">
                    <div style="display: grid; gap: 1rem; margin-bottom: 2rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Transportation (main + local)</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.transportation}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Accommodation</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.accommodation}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Food</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.food}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Activities</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.activities}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Visa</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.visa}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Additional Expenses</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.additional_expenses}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Accommodation</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.accommodation}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Food</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.food}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,0.05);">
                            <span style="color: var(--text-light); font-weight: 500;">Transportation</span>
                            <strong style="color: var(--text-dark); font-size: 1.1rem;">${plan.tripCost.transportation || 'N/A'}</strong>
                        
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; background: var(--primary-gradient); color: white; border-radius: 16px; box-shadow: var(--shadow-hover);">
                        <span style="font-size: 1.2rem; font-weight: 600;">Total Estimated Cost</span>
                        <span style="font-size: 1.5rem; font-weight: 800;">${plan.tripCost.total}</span>
                    </div>
                </div>
            </div>
            
            <!-- AI Trip Details Section -->
            ${plan.trip ? `
            <div class="plan-section">
                <div class="card">
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
                        </div>
                        <div style="margin-top: 1.5rem; line-height: 1.8; color: #4a5568;">
                            ${plan.trip.description || ''}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            <div style="text-align: center; margin-top: 3rem; padding-top: 2rem; border-top: 2px solid #e8eaf6;">
                <button class="btn btn-primary" onclick="savePlan()" style="display: inline-block; padding: 1rem 2.5rem; text-decoration: none; background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%); background-blend-mode: overlay; color: white; font-weight: 600; border-radius: 20px; box-shadow: 0 4px 15px rgba(0, 103, 52, 0.3); transition: all 0.3s ease; border: none; cursor: pointer; font-size: 1rem;" onmouseover="this.style.boxShadow='0 6px 25px rgba(0, 103, 52, 0.4)'; this.style.transform='translateY(-2px);'" onmouseout="this.style.boxShadow='0 4px 15px rgba(0, 103, 52, 0.3)'; this.style.transform='translateY(0)';">
                    Save Trip Plan
                </button>
            </div>
        </div>
    `;

        return html;
    }

    // Helper functions
    function getWeatherIcon(condition) {
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

    function getStarRating(rating) {
        if (!rating) return 'N/A';
        const num = parseFloat(rating);
        if (isNaN(num)) return rating;
        const fullStars = Math.floor(num);
        const hasHalf = num % 1 >= 0.5;
        let stars = '⭐'.repeat(fullStars);
        if (hasHalf) stars += '½';
        return stars + ` (${num.toFixed(1)})`;
    }

    function formatDate(dateString) {
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

}

// Save plan function - defined globally so it can be called from HTML onclick
window.savePlan = async function () {
    console.log('savePlan called');
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
        const departureEl = document.getElementById('departure');
        const destinationEl = document.getElementById('destination');
        const startDateEl = document.getElementById('startDate');
        const endDateEl = document.getElementById('endDate');
        const numberOfPeopleEl = document.getElementById('numberOfPeople');
        const budgetEl = document.getElementById('budget');
        const accommodationTypeEl = document.getElementById('accommodationType');
        const specialRequirementsEl = document.getElementById('specialRequirements');

        if (!departureEl || !destinationEl || !startDateEl || !endDateEl) {
            alert('Error: Form elements not found. Please try again.');
            return;
        }

        const savedPlanData = {
            userId: user.uid,
            departure: departureEl.value,
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

        console.log('Saving plan data:', savedPlanData);
        await addDoc(collection(db, 'savedPlans'), savedPlanData);

        alert('Trip plan saved successfully! You can view it in your profile.');
    } catch (error) {
        console.error('Error saving plan:', error);
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

console.log('plan-trip.js module loaded, savePlan function available:', typeof window.savePlan);