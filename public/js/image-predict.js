import { auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Check if user is logged in
let isAuthChecked = false;
onAuthStateChanged(auth, (user) => {
    if (!isAuthChecked) {
        isAuthChecked = true;
        if (!user) {
            alert('Please login to use Image Prediction feature!');
            window.location.href = 'login.html';
        }
    }
});

const uploadArea = document.getElementById('upload-area');
const imageInput = document.getElementById('image-input');
const previewImage = document.getElementById('preview-image');
const predictButton = document.getElementById('predict-button');
const predictionResult = document.getElementById('prediction-result');

// Click to upload
uploadArea.addEventListener('click', () => {
    imageInput.click();
});

// Drag and drop functionality
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        handleImageFile(files[0]);
    }
});

// File input change
imageInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageFile(e.target.files[0]);
    }
});

function handleImageFile(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewImage.classList.remove('hidden');
        predictButton.classList.remove('hidden');
        predictionResult.classList.add('hidden');
    };
    
    reader.readAsDataURL(file);
}

// Predict button click
predictButton.addEventListener('click', async () => {
    if (!imageInput.files || imageInput.files.length === 0) {
        alert('Please select an image first');
        return;
    }
    
    const formData = new FormData();
    formData.append('image', imageInput.files[0]);
    
    predictButton.disabled = true;
    predictButton.textContent = 'Predicting...';
    predictionResult.classList.remove('hidden');
    const card = document.getElementById('prediction-card');
    if (card) {
        card.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>AI is analyzing your image...</p>
            </div>
        `;
    } else {
        predictionResult.innerHTML = `
            <div id="prediction-card" class="card" style="margin-top: 1.5rem;">
                <div class="loading">
                    <div class="spinner"></div>
                    <p>AI is analyzing your image...</p>
                </div>
            </div>
        `;
    }
    
    try {
        const response = await fetch('/api/predict-image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('[predict-image] full response', data);
            let p = data.prediction;
            
            // Helper function to escape HTML
            const escapeHtml = (text) => {
                const div = document.createElement('div');
                div.textContent = text;
                return div.innerHTML;
            };
            
            // Extract description from response
            let descriptionText = '';
            if (typeof p === 'string') {
                descriptionText = p;
            } else if (p && typeof p === 'object') {
                // Try to find description in various possible fields
                descriptionText = p.description || p.details || p.summary || p.text || p.content || 
                                 p.message || p.info || p.response || JSON.stringify(p, null, 2);
            } else if (Array.isArray(p) && p.length > 0) {
                // If array, try to get description from first item or stringify
                descriptionText = (p[0] && typeof p[0] === 'object') 
                    ? (p[0].description || p[0].details || JSON.stringify(p, null, 2))
                    : JSON.stringify(p, null, 2);
            } else {
                descriptionText = String(p || 'No description available');
            }
            
            // Format the description nicely - preserve line breaks
            // Split by newlines, escape each part, then join with <br>
            const lines = descriptionText.split(/\n/);
            const formattedDescription = lines
                .map(line => escapeHtml(line))
                .join('<br>');

            let card = document.getElementById('prediction-card');
            if (!card) {
                predictionResult.innerHTML = `<div id="prediction-card" class="card" style="margin-top: 1.5rem;"></div>`;
                card = document.getElementById('prediction-card');
            }
            
            const html = `
                <h3 style="display:flex; align-items:center; gap:.5rem; margin-top:0; color:var(--primary-color);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z" stroke="currentColor" stroke-width="1.5"/>
                        <circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                    Location Details
                </h3>
                <div style="margin-top:1.25rem; padding:1.25rem; background:linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%); border-left:4px solid var(--primary-color); border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div style="color:#333; font-size:1rem; line-height:1.8; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <p style="margin:0;">${formattedDescription}</p>
                    </div>
                </div>
                <div style="margin-top:1.5rem; text-align:center;">
                    <a class="btn btn-primary" href="plan-trip.html" style="display:inline-block; padding:0.75rem 2rem;">AI Trip Planner</a>
                </div>
            `;
            card.innerHTML = html;
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            const card = document.getElementById('prediction-card');
            if (card) {
                card.innerHTML = `
                    <div class="alert alert-error">
                        ${data.error || 'Failed to predict image. Please try again.'}
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error predicting image:', error);
        const card = document.getElementById('prediction-card');
        if (card) {
            card.innerHTML = `
                <div class="alert alert-error">
                    An error occurred while predicting the image. Please try again.
                </div>
            `;
        }
    } finally {
        predictButton.disabled = false;
        predictButton.textContent = 'Predict Location';
    }
});

// Check auth state
onAuthStateChanged(auth, (user) => {
    const profileLink = document.getElementById('profile-link');
    if (!profileLink) return; // element may not be present on this page
    if (user) {
        profileLink.textContent = 'Profile';
    }
});

