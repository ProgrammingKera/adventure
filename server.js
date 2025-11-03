const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Multer configuration for file uploads
const upload = multer({ dest: 'uploads/' });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AI Trip Planner API is running' });
});

// AI Trip Planning - Gemini API
app.post('/api/generate-plan', async (req, res) => {
  try {
    const { destination, startDate, endDate, numberOfPeople, budget, accommodationType, preferences, specialRequirements } = req.body;

    const prompt = `Create a detailed day-by-day trip plan for the following requirements:

Destination: ${destination}
Start Date: ${startDate}
End Date: ${endDate}
Number of People: ${numberOfPeople}
Budget Range: ${budget}
Accommodation Type: ${accommodationType}
Preferences: ${preferences.join(', ')}
Special Requirements: ${specialRequirements || 'None'}

Please provide a comprehensive itinerary including:
1. Day-by-day breakdown of activities
2. Recommended destinations and attractions
3. Accommodation suggestions
4. Estimated costs per day
5. Travel tips and recommendations

Format the response in a clear, structured manner with sections for each day.`;

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyAUXuxdvNhEGMLNdrX6DBPhhWmyG5I6lcg',
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data || !response.data.candidates || !response.data.candidates[0]) {
      throw new Error('Invalid response from AI service');
    }
    
    const generatedPlan = response.data.candidates[0].content.parts[0].text;
    
    if (!generatedPlan || generatedPlan.trim().length === 0) {
      throw new Error('Empty plan generated');
    }
    
    res.json({ 
      success: true, 
      plan: generatedPlan 
    });
  } catch (error) {
    console.error('Error generating trip plan:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to generate trip plan. Please try again.';
    res.status(500).json({ 
      success: false, 
      error: errorMessage
    });
  }
});

// AI Image Prediction
app.post('/api/predict-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const FormData = require('form-data');
    const fs = require('fs');
    const formData = new FormData();
    
    formData.append('image', fs.createReadStream(req.file.path), {
      filename: req.file.originalname || 'image.jpg',
      contentType: req.file.mimetype
    });

    const response = await axios.post(
      'https://trip-model-api-1.onrender.com/predict',
      formData,
      {
        headers: {
          ...formData.getHeaders()
        }
      }
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ 
      success: true, 
      prediction: response.data 
    });
  } catch (error) {
    console.error('Error predicting image:', error.response?.data || error.message);
    
    // Clean up uploaded file if it exists
    if (req.file && req.file.path) {
      const fs = require('fs');
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to predict image. Please try again.' 
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

