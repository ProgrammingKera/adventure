import { db, auth } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Set minimum date to today
const today = new Date().toISOString().split('T')[0];
document.getElementById('startDate').setAttribute('min', today);
document.getElementById('endDate').setAttribute('min', today);

// Update end date minimum when start date changes
document.getElementById('startDate').addEventListener('change', function() {
    const startDate = this.value;
    document.getElementById('endDate').setAttribute('min', startDate);
});

// Handle form submission
document.getElementById('trip-plan-form').addEventListener('submit', async function(e) {
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
            // Format and display the plan
            const formattedPlan = formatPlan(data.plan);
            
            planResult.innerHTML = `
                <div class="plan-container">
                    <h2 style="color: var(--primary-color); margin-bottom: 1rem;">✨ Your AI-Generated Trip Plan</h2>
                    <div style="margin-bottom: 1.5rem; padding: 1.5rem; background: #f0f9f4; border-radius: 5px; border-left: 4px solid var(--primary-color);">
                        <p style="margin: 0.5rem 0;"><strong>📍 Destination:</strong> ${formData.destination}</p>
                        <p style="margin: 0.5rem 0;"><strong>📅 Duration:</strong> ${formData.startDate} to ${formData.endDate}</p>
                        <p style="margin: 0.5rem 0;"><strong>👥 Travelers:</strong> ${formData.numberOfPeople} person(s)</p>
                        <p style="margin: 0.5rem 0;"><strong>💰 Budget:</strong> ${formData.budget}</p>
                    </div>
                    <div class="plan-content" style="line-height: 1.8; color: var(--text-dark);">
                        ${formattedPlan}
                    </div>
                    <button class="btn btn-primary" onclick="savePlan()" style="margin-top: 1.5rem; width: 100%;">
                        💾 Save Plan
                    </button>
                </div>
            `;
            
            // Scroll to plan result
            planResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            planResult.innerHTML = `
                <div class="alert alert-error">
                    ${data.error || 'Failed to generate plan. Please try again.'}
                </div>
            `;
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

// Format the plan text for better display
function formatPlan(planText) {
    if (!planText) return '<p>No plan content available.</p>';
    
    let formatted = '';
    let inList = false;
    let listItems = [];
    
    // Split by lines and process
    const lines = planText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Skip empty lines but close lists
        if (!line) {
            if (inList && listItems.length > 0) {
                formatted += `<ul class="plan-list">${listItems.join('')}</ul>`;
                listItems = [];
                inList = false;
            }
            continue;
        }
        
        // Main headers (# Title)
        if (line.match(/^#\s+(.+)$/) && !line.startsWith('##')) {
            if (inList) {
                formatted += `<ul class="plan-list">${listItems.join('')}</ul>`;
                listItems = [];
                inList = false;
            }
            const title = line.replace(/^#+\s+/, '');
            formatted += `<h2 class="plan-title">${title}</h2>`;
        }
        // Sub headers (## Subtitle)
        else if (line.match(/^##\s+(.+)$/) && !line.startsWith('###')) {
            if (inList) {
                formatted += `<ul class="plan-list">${listItems.join('')}</ul>`;
                listItems = [];
                inList = false;
            }
            const title = line.replace(/^##+\s+/, '');
            formatted += `<h3 class="plan-subtitle">${title}</h3>`;
        }
        // Small headers (### Day 1, etc.)
        else if (line.match(/^###\s+(.+)$/)) {
            if (inList) {
                formatted += `<ul class="plan-list">${listItems.join('')}</ul>`;
                listItems = [];
                inList = false;
            }
            const title = line.replace(/^###+\s+/, '');
            formatted += `<h4 class="plan-day-title">${title}</h4>`;
        }
        // Bullet points (- item or • item or * item)
        else if (line.match(/^[-•*]\s+(.+)$/)) {
            inList = true;
            const content = line.replace(/^[-•*]\s+/, '');
            const processedContent = processInlineFormatting(content);
            listItems.push(`<li class="plan-list-item">${processedContent}</li>`);
        }
        // Numbered lists (1. item or 1) item)
        else if (line.match(/^\d+[\.)]\s+(.+)$/)) {
            inList = true;
            const content = line.replace(/^\d+[\.)]\s+/, '');
            const processedContent = processInlineFormatting(content);
            listItems.push(`<li class="plan-list-item numbered">${processedContent}</li>`);
        }
        // Regular paragraphs
        else {
            if (inList && listItems.length > 0) {
                formatted += `<ul class="plan-list">${listItems.join('')}</ul>`;
                listItems = [];
                inList = false;
            }
            
            // Check if it's a special line (like "Day 1:", "Cost:", etc.)
            if (line.match(/^(Day\s*\d+|Cost|Budget|Accommodation|Activities?|Tips?|Notes?|Duration|Includes?|Highlights?):/i)) {
                formatted += `<p class="plan-highlight">${processInlineFormatting(line)}</p>`;
            } else {
                formatted += `<p class="plan-paragraph">${processInlineFormatting(line)}</p>`;
            }
        }
    }
    
    // Close any remaining list
    if (inList && listItems.length > 0) {
        formatted += `<ul class="plan-list">${listItems.join('')}</ul>`;
    }
    
    return formatted || '<p>Plan content is being processed...</p>';
}

// Helper function to process inline formatting (bold, italic, etc.)
function processInlineFormatting(text) {
    if (!text) return '';
    
    // Bold text (**text** or __text__)
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="plan-bold">$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong class="plan-bold">$1</strong>');
    
    // Italic text (*text* or _text_)
    text = text.replace(/\*(.*?)\*/g, '<em class="plan-italic">$1</em>');
    text = text.replace(/_(.*?)_/g, '<em class="plan-italic">$1</em>');
    
    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank" class="plan-link">$1</a>');
    
    // Time patterns (e.g., "9:00 AM", "10:30 PM")
    text = text.replace(/(\d{1,2}:\d{2}\s*(AM|PM|am|pm))/g, '<span class="plan-time">$1</span>');
    
    // Money/Price patterns (PKR, $, Rs)
    text = text.replace(/(PKR\s*\d+|Rs\.?\s*\d+|\$\s*\d+|\d+\s*(PKR|rupees?))/gi, '<span class="plan-price">$1</span>');
    
    return text;
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
        const planContainer = document.querySelector('.plan-container');
        const planText = planContainer.querySelector('.plan-content').textContent || planContainer.querySelector('.plan-content').innerText;
        
        const savedPlanData = {
            userId: user.uid,
            destination: document.getElementById('destination').value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            numberOfPeople: document.getElementById('numberOfPeople').value,
            budget: document.getElementById('budget').value,
            accommodationType: document.getElementById('accommodationType').value,
            preferences: Array.from(document.querySelectorAll('input[name="preferences"]:checked')).map(cb => cb.value),
            specialRequirements: document.getElementById('specialRequirements').value || 'None',
            plan: planText,
            savedAt: serverTimestamp()
        };
        
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
        profileLink.textContent = 'Profile';
    }
});

