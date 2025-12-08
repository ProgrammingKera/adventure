require('dotenv').config();
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

// Multer configuration for file uploads - use memory storage to avoid saving files
const upload = multer({ storage: multer.memoryStorage() });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to repair common JSON issues
function repairJSON(jsonString) {
  try {
    // Remove trailing commas before closing brackets
    let repaired = jsonString.replace(/,\s*([\]}])/g, '$1');
    
    // Remove trailing commas in objects
    repaired = repaired.replace(/,\s*}/g, '}');
    
    // Remove trailing commas in arrays
    repaired = repaired.replace(/,\s*]/g, ']');
    
    // Fix single quotes to double quotes for JSON keys (basic fix)
    repaired = repaired.replace(/'([^']*)'\s*:/g, '"$1":');
    
    return repaired;
  } catch (error) {
    return jsonString;
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'AI Trip Planner API is running' });
});

// Config endpoint - serve API keys
app.get('/api/config', (req, res) => {
  res.json({
    GROQ_API_KEY_FUEL: process.env.GROQ_API_KEY_FUEL || process.env.GROQ_API_KEY
  });
});

// AI Trip Planning - groq 
app.post('/api/generate-plan', async (req, res) => {
  try {
    const { departure, destination, startDate, endDate, numberOfPeople, budget, accommodationType, preferences, specialRequirements } = req.body;

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

    // Calculate budget per person per day for smart recommendations
    const budgetAmount = parseInt(budget.toString().replace(/[^0-9]/g, ''));
    const budgetPerPersonPerDay = Math.floor(budgetAmount / (numberOfPeople * days));
    const budgetCategory = budgetPerPersonPerDay < 2000 ? 'budget' : budgetPerPersonPerDay < 5000 ? 'mid-range' : 'premium';

    const prompt = `Generate a detailed trip plan in JSON format for a trip from ${departure} to ${destination}. 
Trip details: ${days} days, ${numberOfPeople} people, Total Budget: ${budget} (${budgetCategory} category - PKR ${budgetPerPersonPerDay}/person/day), Dates: ${datesList}.

IMPORTANT: Tailor ALL recommendations based on the budget category:
- For BUDGET trips: Recommend affordable local transport, budget hotels/hostels, street food, free attractions
- For MID-RANGE trips: Mix of comfort and value, good local restaurants, mid-range hotels
- For PREMIUM trips: Luxury accommodations, fine dining, exclusive experiences

CRITICAL: For the "transport" section, provide AUTHENTIC transport options from ${departure} to ${destination}:
- Include real transport types available on this route (buses, trains, wagons, taxis, etc.)
- Provide realistic costs for each option
- Include detailed descriptions of each transport option
- Consider the route distance and travel time
- Tailor to the budget category (${budgetCategory})

Return ONLY valid JSON with this exact structure:
{
  "trip": {
    "destination": "${destination}",
    "duration": "${days} days",
    "travelers": ${numberOfPeople},
    "total_budget": ${budget.replace(/[^0-9]/g, '')}
  },
  "weather": [
    {"date": "YYYY-MM-DD", "condition": "sunny/rainy/cloudy", "temperature": "25°C", "description": "weather details"}
  ],
  "attractions": [
    {"name": "attraction name", "location": "location", "description": "details", "rating": 4.5}
  ],
  "restaurants": [
    {"name": "restaurant name", "cuisine": "type", "description": "details", "rating": 4.0, "priceRange": "PKR 500-1000"}
  ],
  "packingEssentials": ["item1", "item2"],
  "accommodation": [
    {"name": "hotel name", "location": "location", "price": "PKR 2000", "rating": 4.5, "description": "details", "facilities": ["wifi", "ac"]}
  ],
  "transport": {
    "options": [
      {"type": "bus/train/taxi", "cost": "PKR 500", "description": "details"}
    ]
  },
  "localEvents": [
    {"name": "event name", "date": "YYYY-MM-DD", "description": "details"}
  ],
  "budget_breakdown": {
    "accommodation": "PKR 5000",
    "food": "PKR 3000",
    "transportation": "PKR 2000",
    "attractions": "PKR 1000",
    "miscellaneous": "PKR 500",
    "total": "PKR 11500"
  },
  "safetyTips": ["tip1", "tip2"],
  "itinerary": [
    {"day": "Day 1", "activities": "activity details"}
  ]
}`;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "moonshotai/kimi-k2-instruct",
        messages: [
          { role: "system", content: "You are a helpful travel planner. Always respond in valid JSON only." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 8192
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response from AI service');
    }

    let rawResponse = response.data.choices[0].message.content;

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

    // Try multiple extraction strategies
    const extractionStrategies = [
      // Strategy 1: Direct JSON object
      () => {
        const jsonMatch = generatedPlan.match(/\{[\s\S]*\}/);
        if (jsonMatch) return jsonMatch[0];
        return null;
      },
      // Strategy 2: Clean and extract
      () => {
        const cleaned = generatedPlan.replace(/^[^{]*({.*})[^}]*$/s, '$1').trim();
        if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned;
        return null;
      },
      // Strategy 3: Find largest JSON object
      () => {
        const matches = generatedPlan.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (matches && matches.length > 0) {
          return matches.sort((a, b) => b.length - a.length)[0];
        }
        return null;
      }
    ];

    let extractedJson = null;
    for (const strategy of extractionStrategies) {
      try {
        extractedJson = strategy();
        if (extractedJson) {
          // Test if it's valid JSON
          JSON.parse(extractedJson);
          generatedPlan = extractedJson;
          break;
        }
      } catch (e) {
        continue;
      }
    }



    // Try to parse as JSON with multiple strategies
    let planData;
    let parseSuccess = false;

    // Strategy 1: Direct parse
    try {
      planData = JSON.parse(generatedPlan);

      // Transform to frontend expected format
      if (planData.trip) {
        const transformedPlan = {
          weather: planData.weather || [],
          touristAttractions: planData.attractions || planData.touristAttractions || [],
          restaurants: planData.restaurants || [],
          packingEssentials: planData.packingEssentials || [],
          accommodations: planData.accommodation || planData.accommodations || [],
          localTransportation: planData.transport || planData.localTransportation || { options: [] },
          localEvents: planData.localEvents || [],
          tripCost: planData.budget_breakdown || planData.tripCost || {},
          safetyTips: planData.safetyTips || [],
          itinerary: planData.itinerary || [],
          // Keep original data for reference
          originalData: planData
        };
        planData = transformedPlan;
      }

      parseSuccess = true;
    } catch (parseError) {

      // Strategy 2: Repair JSON with common fixes
      try {
        const repairedPlan = repairJSON(generatedPlan);
        planData = JSON.parse(repairedPlan);
        if (planData.trip) {
          const transformedPlan = {
            weather: planData.weather || [],
            touristAttractions: planData.attractions || planData.touristAttractions || [],
            restaurants: planData.restaurants || [],
            packingEssentials: planData.packingEssentials || [],
            accommodations: planData.accommodation || planData.accommodations || [],
            localTransportation: planData.transport || planData.localTransportation || { options: [] },
            localEvents: planData.localEvents || [],
            tripCost: planData.budget_breakdown || planData.tripCost || {},
            safetyTips: planData.safetyTips || [],
            itinerary: planData.itinerary || [],
            originalData: planData
          };
          planData = transformedPlan;
        }
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

    // If parsing failed, create a basic structure with raw response
    if (!parseSuccess || !planData) {
      planData = {
        weather: [],
        touristAttractions: [],
        restaurants: [],
        packingEssentials: [],
        accommodations: [],
        localTransportation: { options: [] },
        localEvents: [],
        tripCost: {},
        safetyTips: [],
        rawResponse: rawResponseText,
        needsFrontendParsing: true
      };
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
    const formData = new FormData();

    // Use buffer since we are using memory storage
    formData.append('image', req.file.buffer, {
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

    // No need to unlink file as it is in memory

    return res.json({ success: true, prediction: response.data });
  } catch (error) {
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

// Chatbot API - Search trips and provide real data
app.post('/api/chatbot', async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    // Check if user is asking about trips
    const isAskingAboutTrips = /trip|destination|location|place|where|available|book|package/i.test(message);
    
    let botResponse = '';

    if (isAskingAboutTrips) {
      // Extract destination from message
      const destinationMatch = message.match(/(?:to|for|in|at|near)\s+([A-Za-z\s]+?)(?:\?|$)/i);
      const destination = destinationMatch ? destinationMatch[1].trim() : null;

      // Fetch trips from Firebase
      try {
        let trips = [];
        const tripsRef = db.collection('trips');
        let query = tripsRef;

        // Filter by destination if provided
        if (destination) {
          query = query.where('location', '==', destination);
        }

        const snapshot = await query.limit(5).get();
        
        if (!snapshot.empty) {
          snapshot.forEach(doc => {
            trips.push({
              id: doc.id,
              ...doc.data()
            });
          });

          // Format trips response
          if (destination) {
            botResponse = `Found ${trips.length} trips to ${destination}:\n\n`;
          } else {
            botResponse = `Found ${trips.length} available trips:\n\n`;
          }

          trips.forEach((trip, index) => {
            botResponse += `${index + 1}. ${trip.description || trip.location}\n`;
            if (trip.location) botResponse += `   Location: ${trip.location}\n`;
            if (trip.departure) botResponse += `   Departure: ${trip.departure}\n`;
            if (trip.pricePerSeat) botResponse += `   Price: PKR ${trip.pricePerSeat}\n`;
            if (trip.availableSeats) botResponse += `   Available Seats: ${trip.availableSeats}\n`;
            botResponse += `\n`;
          });

          botResponse += `Visit the Explore page to book or see more details!`;
        } else {
          if (destination) {
            botResponse = `No trips found to ${destination} right now.\n\n`;
            botResponse += `But you can check the Explore page to see all available trips or try a different destination!`;
          } else {
            botResponse = `Great! I can help you find trips. To show you the best options, please tell me:\n\n`;
            botResponse += `1. Where would you like to go? (e.g., Islamabad, Lahore, Hunza)\n`;
            botResponse += `2. When are you planning to travel?\n`;
            botResponse += `3. How many days?\n`;
            botResponse += `4. What's your budget?\n\n`;
            botResponse += `You can also visit the Explore page to browse all available trips!`;
          }
        }
      } catch (error) {
        console.error('Error fetching trips from Firebase:', error);
        botResponse = `I'm having trouble fetching trips right now. Please visit the Explore page to see all available trips.`;
      }
    } else {
      // For general questions, use Groq API
      const systemPrompt = `You are a helpful travel assistant for an adventure trip booking platform.
You help users with travel questions, recommendations, and booking assistance.
Keep responses short, friendly, and helpful.
IMPORTANT: Do NOT use any markdown formatting like **, ##, -, *, or bullet points.
Do NOT use special characters or formatting.
Write in plain, simple text only.
Use line breaks (\n) instead of bullet points.`;

      try {
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'mixtral-8x7b-32768',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.7,
            max_tokens: 300
          },
          {
            headers: {
              'Authorization': `Bearer ${process.env.GROQ_API_KEY_CHAT}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data && response.data.choices && response.data.choices[0]) {
          botResponse = response.data.choices[0].message.content.trim();
        } else {
          botResponse = 'Sorry, I could not process your request. Please try again.';
        }
      } catch (error) {
        console.error('Groq API error:', error.response?.data || error.message);
        botResponse = 'I am having trouble connecting to the AI service. Please try again later.';
      }
    }

    res.json({
      success: true,
      response: botResponse
    });
  } catch (error) {
    console.error('Chatbot error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to process your message. Please try again.'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

