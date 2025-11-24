console.log('fuel-calculator.js loaded');

import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const GROQ_API_KEY_FUEL = await fetch('/api/config').then(r => r.json()).then(d => d.GROQ_API_KEY_FUEL);
const GROQ_API_URL_FUEL = 'https://api.groq.com/openai/v1/chat/completions';


const vehicleData = {
    sedan: { min: 8, max: 10, name: 'Sedan' },
    suv: { min: 6, max: 8, name: 'SUV' },
    hatchback: { min: 10, max: 12, name: 'Hatchback' },
    van: { min: 5, max: 7, name: 'Van' },
    truck: { min: 4, max: 6, name: 'Truck' }
};

onAuthStateChanged(auth, (user) => {
    if (!user) {
        const formContainer = document.querySelector('.form-container');
        const resultDiv = document.getElementById('fuel-result');
        if (formContainer) formContainer.style.display = 'none';
        if (resultDiv) {
            resultDiv.classList.remove('hidden');
            resultDiv.innerHTML = '<div class="alert alert-error" style="text-align: center; padding: 2rem;"><h3>Login Required</h3><a href="login.html" class="btn btn-primary">Go to Login</a></div>';
        }
    }
});

// Toggle custom vehicle name input
const carTypeSelect = document.getElementById('fuel-car-type');
const customVehicleGroup = document.getElementById('custom-vehicle-group');
if (carTypeSelect && customVehicleGroup) {
    carTypeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
            customVehicleGroup.style.display = 'block';
        } else {
            customVehicleGroup.style.display = 'none';
        }
    });
}

const fuelForm = document.getElementById('fuel-calculator-form');
if (fuelForm) {
    fuelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Calculating...';

        const resultDiv = document.getElementById('fuel-result');
        resultDiv.innerHTML = '<div class="loading"><div class="spinner"></div><p>Calculating distance and finding authentic suggestions...</p></div>';
        resultDiv.classList.remove('hidden');

        try {
            // Get form values with null checks
            const departureEl = document.getElementById('fuel-departure');
            const destinationEl = document.getElementById('fuel-destination');
            const carTypeEl = document.getElementById('fuel-car-type');
            const consumptionEl = document.getElementById('fuel-consumption');
            const fuelPriceEl = document.getElementById('fuel-price');
            const travelersEl = document.getElementById('fuel-travelers');

            if (!departureEl || !destinationEl || !carTypeEl || !consumptionEl || !fuelPriceEl || !travelersEl) {
                throw new Error('Form elements not found');
            }

            const departure = departureEl.value.trim();
            const destination = destinationEl.value.trim();
            const carType = carTypeEl.value;
            const consumption = parseFloat(consumptionEl.value);
            const fuelPrice = parseFloat(fuelPriceEl.value);
            const travelers = parseInt(travelersEl.value);

            if (!departure || !destination || !carType || !consumption || !fuelPrice || !travelers) {
                throw new Error('Please fill all required fields');
            }

            // Get custom vehicle name if selected
            let carName = carType.charAt(0).toUpperCase() + carType.slice(1);
            if (carType === 'custom') {
                const customNameEl = document.getElementById('custom-vehicle-name');
                if (customNameEl && customNameEl.value.trim()) {
                    carName = customNameEl.value.trim();
                } else {
                    throw new Error('Please enter custom vehicle name');
                }
            }

            // Calculate distance using AI
            const distance = await calculateDistance(departure, destination);
            if (!distance) throw new Error('Could not calculate distance. Please check city names.');

            const fuelNeeded = distance / consumption;
            const totalCost = fuelNeeded * fuelPrice;
            const costPerPerson = totalCost / travelers;

            const aiSuggestions = await getAISuggestions(departure, destination, distance);

            displayResults({
                departure, destination, distance: Math.round(distance),
                carType: carName,
                consumption: consumption,
                fuelNeeded: fuelNeeded.toFixed(2),
                totalCost: totalCost.toFixed(2),
                costPerPerson: costPerPerson.toFixed(2),
                fuelPrice, travelers,
                aiSuggestions
            });
        } catch (error) {
            resultDiv.innerHTML = `<div class="alert alert-error"><strong>Error:</strong> ${error.message}</div>`;
            console.error('Form error:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

async function calculateDistance(departure, destination) {
    try {
        const prompt = `Calculate the road distance in kilometers between ${departure} and ${destination} in Pakistan. Respond with ONLY a number (e.g., 1257). No text, no units, just the number.`;

        console.log('Calling Groq API for distance calculation...');

        const response = await fetch(GROQ_API_URL_FUEL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY_FUEL}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'moonshotai/kimi-k2-instruct',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 50
            })
        });

        console.log('API Response Status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', response.status, errorText);
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        console.log('Full API Response:', data);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Invalid response structure:', data);
            throw new Error('Invalid API response structure');
        }

        const content = data.choices[0].message.content.trim();
        console.log('Distance response content:', content);

        // Extract the first number from the response
        const numberMatch = content.match(/\d+/);
        if (numberMatch) {
            const distance = parseInt(numberMatch[0]);
            if (!isNaN(distance) && distance > 0) {
                console.log('Extracted distance:', distance, 'km');
                return distance;
            }
        }

        throw new Error(`Could not extract valid distance from response: "${content}"`);
    } catch (error) {
        console.error('Distance calculation error:', error);
        throw error;
    }
}

async function getAISuggestions(departure, destination, distance) {
    try {
        const prompt = `You are a Pakistan travel expert. List AUTHENTIC places on the route from ${departure} to ${destination} (${distance}km) where travelers can stop. Include hotels, dhabas, tea stalls, and attractions. For each place, provide: name, type (hotel/dhaba/tea-stall/attraction), exact location on route, distance from start, brief description, and price range if applicable.

Return ONLY valid JSON with no markdown, no code blocks, no extra text:
{"stops":[{"name":"place name","type":"hotel/dhaba/tea-stall/attraction","location":"location on route","distance":"km from start","description":"brief details","price":"PKR range if applicable"}],"roadTips":["authentic tip 1","authentic tip 2","authentic tip 3"]}`;

        console.log('Calling AI for route suggestions...');

        const response = await fetch(GROQ_API_URL_FUEL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY_FUEL}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'moonshotai/kimi-k2-instruct',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            console.error('AI API Error:', response.status);
            return null;
        }

        const data = await response.json();
        console.log('AI Response:', data);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Invalid AI response structure');
            return null;
        }

        const content = data.choices[0].message.content;
        console.log('AI Content:', content);

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                let jsonStr = jsonMatch[0];
                // Fix common JSON errors
                jsonStr = jsonStr.replace(/,\s*}/g, '}'); // Remove trailing commas before }
                jsonStr = jsonStr.replace(/,\s*]/g, ']'); // Remove trailing commas before ]
                // Fix keys with leading/trailing spaces
                jsonStr = jsonStr.replace(/"\s+([a-zA-Z]+)\s*":/g, '"$1":');

                const parsed = JSON.parse(jsonStr);
                console.log('Parsed suggestions:', parsed);
                return parsed;
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                // Return empty suggestions instead of null
                return { stops: [], roadTips: [] };
            }
        }

        console.error('No JSON found in response:', content);
        return null;
    } catch (error) {
        console.error('AI Suggestions Error:', error);
        return null;
    }
}

function displayResults(data) {
    const resultDiv = document.getElementById('fuel-result');
    let html = `<div style="max-width: 1200px; margin: 0 auto; padding: 2rem;">`;

    html += `<div style="text-align: center; margin-bottom: 3rem;">
        <h1 style="font-size: 2.5rem; font-weight: 800; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 1rem; text-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            Trip Fuel Analysis
        </h1>
        <div style="display: flex; align-items: center; justify-content: center; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 1rem 2rem; border-radius: 50px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);"><i class="fa-solid fa-location-dot" style="margin-right: 0.5rem;"></i>${data.departure}</div>
            <div style="color: var(--primary-color); font-size: 1.5rem;"><i class="fa-solid fa-arrow-right-long"></i></div>
            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 1rem 2rem; border-radius: 50px; font-weight: 600; box-shadow: 0 4px 15px rgba(240, 147, 251, 0.3);"><i class="fa-solid fa-location-dot" style="margin-right: 0.5rem;"></i>${data.destination}</div>
        </div>
    </div>`;

    html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; margin-bottom: 3rem;">
        <div class="glass-panel" style="padding: 2rem; text-align: center; border-radius: 24px; transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="width: 60px; height: 60px; background: rgba(0, 166, 81, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                <i class="fa-solid fa-route" style="font-size: 1.5rem; color: var(--primary-color);"></i>
            </div>
            <div style="font-size: 0.9rem; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; font-weight: 600;">Distance</div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--primary-dark);">${data.distance} <span style="font-size: 1rem; font-weight: 500;">KM</span></div>
        </div>
        <div class="glass-panel" style="padding: 2rem; text-align: center; border-radius: 24px; transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="width: 60px; height: 60px; background: rgba(0, 166, 81, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                <i class="fa-solid fa-car" style="font-size: 1.5rem; color: var(--primary-color);"></i>
            </div>
            <div style="font-size: 0.9rem; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; font-weight: 600;">Vehicle</div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--primary-dark);">${data.carType}</div>
        </div>
        <div class="glass-panel" style="padding: 2rem; text-align: center; border-radius: 24px; transition: transform 0.3s ease;" onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
            <div style="width: 60px; height: 60px; background: rgba(0, 166, 81, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
                <i class="fa-solid fa-gauge-high" style="font-size: 1.5rem; color: var(--primary-color);"></i>
            </div>
            <div style="font-size: 0.9rem; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.5rem; font-weight: 600;">Consumption</div>
            <div style="font-size: 2rem; font-weight: 800; color: var(--primary-dark);">${data.consumption} <span style="font-size: 1rem; font-weight: 500;">km/l</span></div>
        </div>
    </div>`;

    html += `<div class="glass-panel" style="padding: 3rem; border-radius: 24px; margin-bottom: 3rem; position: relative; overflow: hidden;">
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 5px; background: linear-gradient(90deg, var(--primary-color), var(--primary-dark));"></div>
        <h2 style="font-size: 1.8rem; font-weight: 700; margin-bottom: 2rem; color: var(--primary-dark); display: flex; align-items: center;">
            <i class="fa-solid fa-calculator" style="margin-right: 1rem; color: var(--primary-color);"></i>Cost Breakdown
        </h2>
        <div style="display: grid; gap: 1.5rem;">
            <div style="display: flex; justify-content: space-between; padding: 1.5rem; background: rgba(255,255,255,0.5); border-radius: 16px; align-items: center;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 40px; height: 40px; background: #e8f5e9; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary-color);"><i class="fa-solid fa-gas-pump"></i></div>
                    <span style="color: #4a5568; font-weight: 600; font-size: 1.1rem;">Fuel Needed</span>
                </div>
                <strong style="color: var(--primary-dark); font-size: 1.3rem;">${data.fuelNeeded} Liters</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1.5rem; background: rgba(255,255,255,0.5); border-radius: 16px; align-items: center;">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 40px; height: 40px; background: #e8f5e9; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: var(--primary-color);"><i class="fa-solid fa-tag"></i></div>
                    <span style="color: #4a5568; font-weight: 600; font-size: 1.1rem;">Petrol Price</span>
                </div>
                <strong style="color: var(--primary-dark); font-size: 1.3rem;">PKR ${data.fuelPrice}/L</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 2rem; background: linear-gradient(135deg, #fff 0%, #f8f9fa 100%); border: 2px solid var(--primary-color); border-radius: 20px; align-items: center; box-shadow: 0 10px 30px rgba(0, 166, 81, 0.1);">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 50px; height: 50px; background: var(--primary-color); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.2rem;"><i class="fa-solid fa-coins"></i></div>
                    <span style="color: var(--primary-dark); font-weight: 700; font-size: 1.3rem;">Total Cost</span>
                </div>
                <strong style="color: #d32f2f; font-size: 2rem; font-weight: 800;">PKR ${data.totalCost}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1.5rem; background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%); border-radius: 16px; color: white; align-items: center; box-shadow: 0 8px 20px rgba(0, 103, 52, 0.2);">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 10px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-user-group"></i></div>
                    <span style="font-weight: 600; font-size: 1.1rem;">Cost Per Person (${data.travelers} travelers)</span>
                </div>
                <strong style="font-size: 1.5rem;">PKR ${data.costPerPerson}</strong>
            </div>
        </div>
    </div>`;

    if (data.aiSuggestions) {
        const ai = data.aiSuggestions;

        if (ai.stops && ai.stops.length > 0) {
            html += `<div style="margin-bottom: 3rem;">
                <h2 style="font-size: 2rem; font-weight: 800; margin-bottom: 2rem; color: var(--primary-dark); text-align: center;">
                    <i class="fa-solid fa-map-location-dot" style="margin-right: 1rem; color: var(--primary-color);"></i>Recommended Stops
                </h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto;">`;

            ai.stops.slice(0, 10).forEach(stop => {
                const stopType = stop.type || 'attraction';
                const typeColor = stopType === 'hotel' ? '#667eea' : stopType === 'dhaba' ? '#f5576c' : '#764ba2';
                const typeIcon = stopType === 'hotel' ? 'fa-hotel' : stopType === 'dhaba' ? 'fa-utensils' : 'fa-camera';

                html += `<div class="glass-panel" style="padding: 0; border-radius: 20px; overflow: hidden; transition: all 0.3s ease; border: 1px solid rgba(255,255,255,0.5);" onmouseover="this.style.transform='translateY(-10px)'; this.style.boxShadow='0 20px 40px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 32px 0 rgba(31, 38, 135, 0.07)'">
                    <div style="background: ${typeColor}; padding: 1.5rem 1.5rem 1rem 1.5rem; position: relative; display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
                        <h3 style="margin: 0; color: white; font-size: 1.3rem; font-weight: 700; flex: 1;">${stop.name || 'Place'}</h3>
                        <div style="background: rgba(255,255,255,0.2); backdrop-filter: blur(5px); padding: 0.4rem 0.8rem; border-radius: 50px; color: white; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;">
                            <i class="fa-solid ${typeIcon}" style="margin-right: 0.4rem;"></i>${stopType}
                        </div>
                    </div>
                    <div style="padding: 1.5rem;">
                        <div style="display: flex; gap: 1rem; margin-bottom: 1rem; color: #666; font-size: 0.85rem; flex-wrap: wrap;">
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <i class="fa-solid fa-location-dot" style="color: var(--primary-color); flex-shrink: 0;"></i> <span>${stop.location}</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; white-space: nowrap;">
                                <i class="fa-solid fa-road" style="color: var(--primary-color);"></i> ${stop.distance}
                            </div>
                        </div>
                        <p style="color: #4a5568; font-size: 0.95rem; line-height: 1.5; margin-bottom: 1rem; word-wrap: break-word; overflow-wrap: break-word;">${stop.description}</p>
                        ${stop.price ? `<div style="background: #f8f9fa; padding: 0.6rem 0.9rem; border-radius: 10px; display: inline-block; font-weight: 700; color: var(--primary-color); border: 1px solid #e9ecef; font-size: 0.9rem;"><i class="fa-solid fa-tag" style="margin-right: 0.4rem;"></i>${stop.price}</div>` : ''}
                    </div>
                </div>`;
            });

            html += `</div></div>`;
        }

        if (ai.roadTips && ai.roadTips.length > 0) {
            html += `<div class="glass-panel" style="padding: 3rem; border-radius: 24px; margin-bottom: 3rem; background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,253,244,0.9) 100%);">
                <h2 style="font-size: 1.8rem; font-weight: 800; margin-bottom: 2rem; color: var(--primary-dark); display: flex; align-items: center;">
                    <i class="fa-solid fa-lightbulb" style="margin-right: 1rem; color: #f6e05e;"></i>Essential Road Tips
                </h2>
                <div style="display: grid; gap: 1rem;">`;

            ai.roadTips.forEach(tip => {
                html += `<div style="display: flex; gap: 1.5rem; padding: 1.5rem; background: white; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); transition: transform 0.2s;" onmouseover="this.style.transform='translateX(5px)'" onmouseout="this.style.transform='translateX(0)'">
                    <div style="min-width: 30px; height: 30px; background: var(--primary-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.9rem;"><i class="fa-solid fa-check"></i></div>
                    <div style="color: #4a5568; font-size: 1.05rem; line-height: 1.5;">${tip}</div>
                </div>`;
            });

            html += `</div></div>`;
        }
    }

    html += `
        <div style="text-align: center; margin-top: 4rem; padding-top: 2rem; border-top: 2px solid rgba(0,0,0,0.05);">
            <a href="plan-trip.html" class="btn btn-primary" style="display: inline-block; padding: 1rem 3rem; text-decoration: none; font-size: 1.2rem; border-radius: 50px; box-shadow: 0 10px 30px rgba(0, 103, 52, 0.3); transition: all 0.3s ease;" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 15px 40px rgba(0, 103, 52, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 10px 30px rgba(0, 103, 52, 0.3)'">
                <i class="fa-solid fa-wand-magic-sparkles" style="margin-right: 0.75rem;"></i>Plan Your Full Trip with AI
            </a>
        </div>
    </div>`;
    resultDiv.innerHTML = html;
}