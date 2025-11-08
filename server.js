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

    // Calculate number of days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Generate dates array
    const dates = [];
    const startDateObj = new Date(startDate);
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDateObj);
      currentDate.setDate(startDateObj.getDate() + i);
      dates.push(currentDate.toISOString().split('T')[0]);
    }

    const datesList = dates.join(', ');

    const prompt = `You are a JSON-only response generator. Generate a trip plan for ${destination} from ${startDate} to ${endDate} (${days} days) for ${numberOfPeople} people.

Budget: ${budget}
Accommodation Type: ${accommodationType}
Preferences: ${preferences.join(', ')}
Special Requirements: ${specialRequirements || 'None'}

CRITICAL: You MUST respond with ONLY valid JSON. NO markdown code blocks. NO text before or after. NO explanations. Start with { and end with }.

Required JSON structure:
{
  "weather": [
    Provide weather for ALL ${days} days: ${datesList}
    Each weather object: {"date": "YYYY-MM-DD", "condition": "sunny/cloudy/rainy/partly-cloudy", "temperature": "high/low in Celsius", "description": "brief"}
  ],
  "touristAttractions": [
    Include 5-6 famous tourist attractions in ${destination}
    Each attraction: {"name": "Name", "description": "Detailed description", "location": "Area/Address"}
  ],
  "restaurants": [
    Include 5-6 popular restaurants in ${destination}
    Each restaurant: {"name": "Name", "cuisine": "Type", "priceRange": "PKR amount", "rating": "4.5", "description": "Brief"}
  ],
  "packingEssentials": [
    List 10-12 essential items as strings
    Example: ["Item 1", "Item 2"]
  ],
  "accommodations": [
    Include 2-3 ${accommodationType} options
    Each accommodation: {"name": "Name", "price": "PKR amount per night", "location": "Area", "facilities": ["Facility1", "Facility2", "Facility3"], "rating": "4.2", "description": "Brief"}
  ],
  "localTransportation": {
    "options": [
      Include 3-4 transportation options
      Each option: {"type": "Type", "cost": "PKR amount", "description": "How to use"}
    ]
  },
  "localEvents": [
    Include any local events/festivals if available
    Each event: {"name": "Name", "date": "Date", "description": "Description"}
  ],
  "tripCost": {
    "accommodation": "PKR total",
    "food": "PKR total",
    "transportation": "PKR total",
    "attractions": "PKR total",
    "miscellaneous": "PKR total",
    "total": "PKR grand total"
    Calculate for ${numberOfPeople} people for ${days} days within ${budget}
  },
  "safetyTips": [
    Include 6-8 safety tips as strings
    Example: ["Tip 1", "Tip 2"]
  ]
}

STRICT REQUIREMENTS:
- Weather condition MUST be exactly: "sunny", "cloudy", "rainy", or "partly-cloudy"
- Provide weather for ALL ${days} dates: ${datesList}
- Ratings must be numbers like "4.5" only, NOT "4.5 out of 5"
- All prices in PKR format like "PKR 5000"
- Accommodations must have exactly 3 facilities each
- Calculate realistic trip costs based on ${budget} for ${numberOfPeople} people for ${days} days

RESPOND WITH ONLY THE JSON OBJECT. NO OTHER TEXT WHATSOEVER.`;

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=AIzaSyAUXuxdvNhEGMLNdrX6DBPhhWmyG5I6lcg',
      {
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.4,
          topK: 20,
          topP: 0.8,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
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
    
    let rawResponse = response.data.candidates[0].content.parts[0].text;
    
    if (!rawResponse || rawResponse.trim().length === 0) {
      throw new Error('Empty plan generated');
    }
    
    // Save the raw response
    const rawResponseText = rawResponse.trim();
    
    // Extract JSON from response - handle various formats
    let generatedPlan = rawResponseText;
    
    // Remove markdown code blocks
    if (generatedPlan.includes('```json')) {
      const jsonMatch = generatedPlan.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        generatedPlan = jsonMatch[1].trim();
      }
    } else if (generatedPlan.includes('```')) {
      const jsonMatch = generatedPlan.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        generatedPlan = jsonMatch[1].trim();
      }
    }
    
    // Try to extract JSON object if there's text before/after
    const jsonMatch = generatedPlan.match(/\{[\s\S]*\}/);
    if (jsonMatch && jsonMatch[0].length < generatedPlan.length) {
      generatedPlan = jsonMatch[0];
    }
    
    // Try to parse as JSON with multiple strategies
    let planData;
    let parseSuccess = false;
    
    // Strategy 1: Direct parse
    try {
      planData = JSON.parse(generatedPlan);
      parseSuccess = true;
    } catch (parseError) {
      
      // Strategy 2: Fix trailing commas
      try {
        let fixedPlan = generatedPlan;
        fixedPlan = fixedPlan.replace(/,(\s*[}\]])/g, '$1');
        planData = JSON.parse(fixedPlan);
        parseSuccess = true;
      } catch (fixError) {
        
        // Strategy 3: Try to find and extract the largest valid JSON object
        try {
          // Find all potential JSON objects
          const jsonMatches = generatedPlan.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
            // Try each match, starting with the longest
            const sortedMatches = jsonMatches.sort((a, b) => b.length - a.length);
            for (const match of sortedMatches) {
              try {
                const testPlan = JSON.parse(match);
                if (testPlan.weather || testPlan.touristAttractions) {
                  planData = testPlan;
                  parseSuccess = true;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
        } catch (extractError) {
          // Silent fail, try next strategy
        }
        
        // Strategy 4: Last resort - send raw response for frontend to handle
        if (!parseSuccess) {
          planData = { 
            rawResponse: rawResponseText,
            needsFrontendParsing: true,
            parseError: parseError.message
          };
        }
      }
    }
    
    // Always include raw response for frontend fallback
    if (planData && !planData.rawResponse) {
      planData.rawResponse = rawResponseText;
    }
    
    // Validate structure if parsing succeeded
    if (parseSuccess && planData) {
      // Structure validated
    }
    
    res.json({ 
      success: true, 
      plan: planData 
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
app.get('/api/predict-image', (req, res) => {
  res.status(200).json({
    success: false,
    info: 'Use POST with multipart/form-data. Field name: image.',
    example: 'curl -F "image=@/path/to/photo.jpg" http://localhost:' + PORT + '/api/predict-image'
  });
});

app.post('/api/predict-image', upload.single('image'), async (req, res) => {
  const start = Date.now();
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
        headers: { ...formData.getHeaders() },
        // Allow waiting for the upstream model indefinitely unless overridden by env var
        timeout: parseInt(process.env.PREDICT_TIMEOUT_MS, 10) || 0
      }
    );

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    
    return res.json({ success: true, prediction: response.data });
  } catch (error) {
    const fs = require('fs');
    // Clean up uploaded file if it exists
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const status = error.response?.status || 500;
    const apiText = typeof error.response?.data === 'string' ? error.response.data : undefined;
    const apiJson = typeof error.response?.data === 'object' ? error.response.data : undefined;
    console.error('[predict-image] fail in', Date.now() - start, 'ms', {
      status,
      message: error.message,
      apiText,
      apiJson
    });

    return res.status(500).json({
      success: false,
      error: apiJson?.error || apiText || error.message || 'Failed to predict image.'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

