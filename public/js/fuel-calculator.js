console.log('fuel-calculator.js loaded');

import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
        
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
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
        
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'moonshotai/kimi-k2-instruct',
                messages: [{role: 'user', content: prompt}],
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
    
    html += `<div style="text-align: center; margin-bottom: 2rem;">
        <h1 style="font-size: 2rem; font-weight: 800; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 1rem;">
            Trip Fuel Analysis
        </h1>
        <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 1.5rem;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 0.75rem 1.5rem; border-radius: 12px;">${data.departure}</div>
            <div style="color: var(--primary-color); font-size: 1.5rem;">→</div>
            <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 0.75rem 1.5rem; border-radius: 12px;">${data.destination}</div>
        </div>
    </div>`;
    
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; margin-bottom: 0.5rem;">Distance</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color);">${data.distance} KM</div>
        </div>
        <div style="background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; margin-bottom: 0.5rem;">Vehicle</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color);">${data.carType}</div>
        </div>
        <div style="background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="font-size: 0.85rem; color: #666; text-transform: uppercase; margin-bottom: 0.5rem;">Consumption</div>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color);">${data.consumption} km/l</div>
        </div>
    </div>`;
    
    html += `<div style="background: linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%); border-radius: 16px; padding: 2rem; margin-bottom: 2rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; color: #2d3748;">Fuel Calculation</h2>
        <div style="display: grid; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; padding: 1rem; background: white; border-radius: 12px;">
                <span style="color: #4a5568; font-weight: 500;">Fuel Needed</span>
                <strong style="color: var(--primary-color); font-size: 1.1rem;">${data.fuelNeeded} Liters</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1rem; background: white; border-radius: 12px;">
                <span style="color: #4a5568; font-weight: 500;">Petrol Price</span>
                <strong style="color: var(--primary-color); font-size: 1.1rem;">PKR ${data.fuelPrice}/L</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1rem; background: white; border-radius: 12px;">
                <span style="color: #4a5568; font-weight: 500;">Total Cost</span>
                <strong style="color: #d32f2f; font-size: 1.3rem;">PKR ${data.totalCost}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 1rem; background: linear-gradient(135deg, var(--primary-color) 0%, #2d8659 100%); border-radius: 12px; color: white;">
                <span style="font-weight: 500;">Cost Per Person (${data.travelers} travelers)</span>
                <strong style="font-size: 1.3rem;">PKR ${data.costPerPerson}</strong>
            </div>
        </div>
    </div>`;
    
    if (data.aiSuggestions) {
        const ai = data.aiSuggestions;
        
        if (ai.stops && ai.stops.length > 0) {
            html += `<div style="margin-bottom: 2rem;">
                <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; color: #2d3748;">Places on Route (Hotels, Dhabas, Attractions)</h2>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">`;
            
            ai.stops.slice(0, 10).forEach(stop => {
                const stopType = stop.type || 'attraction';
                const typeColor = stopType === 'hotel' ? '#667eea' : stopType === 'dhaba' ? '#f5576c' : '#764ba2';
                html += `<div style="background: white; border-radius: 16px; padding: 1.5rem; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border-left: 4px solid ${typeColor};">
                    <h3 style="margin: 0 0 0.5rem 0; color: #2d3748; font-size: 1.1rem;">${stop.name || 'Place'}</h3>
                    <div style="display: inline-block; padding: 0.25rem 0.75rem; background: ${typeColor}20; color: ${typeColor}; border-radius: 20px; font-size: 0.8rem; font-weight: 600; margin-bottom: 0.75rem;">${stopType.toUpperCase()}</div>
                    <div style="color: #718096; font-size: 0.9rem; margin-bottom: 0.5rem;">Location: ${stop.location}</div>
                    <div style="color: #4a5568; font-size: 0.9rem; margin-bottom: 0.5rem;">Distance from start: <strong>${stop.distance}</strong></div>
                    <p style="color: #4a5568; font-size: 0.9rem; margin: 0.75rem 0 0 0;">${stop.description}</p>
                    ${stop.price ? `<div style="color: var(--primary-color); font-weight: 700; margin-top: 0.75rem;">${stop.price}</div>` : ''}
                </div>`;
            });
            
            html += `</div></div>`;
        }
        
        if (ai.roadTips && ai.roadTips.length > 0) {
            html += `<div style="background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%); border-radius: 16px; padding: 2rem; margin-bottom: 2rem;">
                <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1.5rem; color: #2d3748;">Road Tips</h2>
                <div style="display: grid; gap: 1rem;">`;
            
            ai.roadTips.forEach(tip => {
                html += `<div style="display: flex; gap: 1rem; padding: 1rem; background: white; border-radius: 12px;">
                    <div style="color: var(--primary-color); font-size: 1.2rem;">+</div>
                    <div style="color: #4a5568;">${tip}</div>
                </div>`;
            });
            
            html += `</div></div>`;
        }
    }
    
    html += `
        <div style="text-align: center; margin-top: 3rem; padding-top: 2rem; border-top: 2px solid #e8eaf6;">
            <a href="plan-trip.html" class="btn btn-primary" style="display: inline-block; padding: 1rem 2.5rem; text-decoration: none; background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%); background-blend-mode: overlay; color: white; font-weight: 600; border-radius: 20px; box-shadow: 0 4px 15px rgba(0, 103, 52, 0.3); transition: all 0.3s ease;" onmouseover="this.style.boxShadow='0 6px 25px rgba(0, 103, 52, 0.4)'; this.style.transform='translateY(-2px);'" onmouseout="this.style.boxShadow='0 4px 15px rgba(0, 103, 52, 0.3)'; this.style.transform='translateY(0)';">
                Go to AI Trip Planner
            </a>
        </div>
    </div>`;
    resultDiv.innerHTML = html;
}