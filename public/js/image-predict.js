import { auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

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
    predictionResult.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            <p>AI is analyzing your image...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/predict-image', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const prediction = data.prediction;
            
            predictionResult.innerHTML = `
                <div class="prediction-result">
                    <h3>📍 ${prediction.place_name || 'Predicted Location'}</h3>
                    <div style="margin-top: 1rem;">
                        <p><strong>Location:</strong> ${prediction.location || 'N/A'}</p>
                        <p><strong>Description:</strong> ${prediction.description || prediction.details || 'No description available'}</p>
                        ${prediction.tourist_info ? `<p><strong>Tourist Information:</strong> ${prediction.tourist_info}</p>` : ''}
                        ${prediction.best_time ? `<p><strong>Best Time to Visit:</strong> ${prediction.best_time}</p>` : ''}
                    </div>
                </div>
            `;
        } else {
            predictionResult.innerHTML = `
                <div class="alert alert-error">
                    ${data.error || 'Failed to predict image. Please try again.'}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error predicting image:', error);
        predictionResult.innerHTML = `
            <div class="alert alert-error">
                An error occurred while predicting the image. Please try again.
            </div>
        `;
    } finally {
        predictButton.disabled = false;
        predictButton.textContent = 'Predict Location';
    }
});

// Check auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        const profileLink = document.getElementById('profile-link');
        profileLink.textContent = 'Profile';
    }
});

