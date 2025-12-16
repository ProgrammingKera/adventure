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

// Multer use memory storage to avoid saving files
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

    
    const normalizeBudget = (input) => {
      if (!input) return 0;
      const str = String(input).toLowerCase().replace(/\s+/g, '');
      const lacMatch = str.match(/([0-9]*\.?[0-9]+)\s*(lac|lakh)/);
      if (lacMatch) {
        return Math.round(parseFloat(lacMatch[1]) * 100000);
      }
      const kMatch = str.match(/([0-9]*\.?[0-9]+)\s*k/);
      if (kMatch) {
        return Math.round(parseFloat(kMatch[1]) * 1000);
      }
      // Default: strip non-digits
      return parseInt(str.replace(/[^0-9]/g, '')) || 0;
    };

    // Calculate budget per person per day for smart recommendations
    const budgetAmount = normalizeBudget(budget);
    const budgetPerPersonPerDay = Math.floor(budgetAmount / (numberOfPeople * days));
    
    const budgetCategory = budgetPerPersonPerDay < 2000 ? 'budget' : budgetPerPersonPerDay < 5000 ? 'mid-range' : 'premium';

    const prompt = `Generate a detailed trip plan in JSON format for a trip from ${departure} to ${destination}. 
Trip details: ${days} days, ${numberOfPeople} people, Total Budget: PKR ${budgetAmount.toLocaleString('en-PK')} (${budgetCategory} category - PKR ${budgetPerPersonPerDay}/person/day), Dates: ${datesList}.

 AUTHENTIC BUDGET HANDLING (MANDATORY):
User's stated budget: PKR ${budgetAmount.toLocaleString('en-PK')}

Your job: Generate REALISTIC, BALANCED prices for this route (${departure} to ${destination}).
Prices should be AUTHENTIC but REASONABLE - not too high, not too low.

Instead:
1. Research REAL costs for ${departure} to ${destination} (${days} days, ${numberOfPeople} people)
2. Show HONEST breakdown: transport, accommodation, food, activities, misc

PRICE GUIDELINES (BALANCED APPROACH):
- Transport: Use average market prices (not cheapest, not most expensive)
- Accommodation: Budget hotels/guesthouses (clean, basic, reasonable)
- Food: Local restaurants and street food (authentic, affordable)
- Activities: Mix of free and paid attractions
- Misc: Realistic miscellaneous expenses

Example for 75000 PKR Hunza trip (5 days):
- Transport (Rawalpindi-Hunza): 3000 PKR (shared jeep, comfortable)
- Accommodation (4 nights): 8000 PKR (decent guesthouse)
- Food (5 days): 5000 PKR (good local restaurants)
- Activities: 3000 PKR (paid attractions, guides)
- Misc: 1000 PKR (miscellaneous)
- Total: 20000 PKR
- User's budget: 75000 PKR
- budgetSavings: 55000 PKR (show this clearly)
- Provide full plan with all recommendations

Example for 1000 PKR Hunza trip (5 days):
- Transport: 800 PKR (shared jeep)
- Accommodation: 900 PKR (budget guesthouse)
- Food: 200 PKR (local food)
- Activities: 100 PKR (free attractions)
- Total: 2000 PKR
- User's budget: 1000 PKR
- budgetGap: 1000 PKR (show this clearly)

CRITICAL: For the "transport" section, provide AUTHENTIC transport options from ${departure} to ${destination}:
- Include real transport types available on this route (buses, trains, wagons, taxis, etc.)
- Provide realistic costs for each option
- Include detailed descriptions of each transport option
- Consider the route distance and travel time
- Do NOT include helicopter or private helicopter options in any transport section
- Use accurate, current market prices that FIT within the user's budget
- Calculate REALISTIC total cost based on actual market prices
- For budgets >= 75000 PKR or trips <= 5 days: TRY to fit within budget
- For other cases: Show HONEST costs and budgetGap if needed
- Include "budgetSavings" field if total is less than user's budget
- Include "budgetGap" field if total exceeds user's budget (show the difference)
- Include "budgetRecommendation" field with realistic minimum budget for this trip
- NEVER fake prices - show authentic costs
- If budget is insufficient, explain what can be reduced (activities, days, accommodation quality)
- Tailor recommendations to the budget category (${budgetCategory})

Return ONLY valid JSON with this exact structure:
{
  "trip": {
    "destination": "${destination}",
    "duration": "${days} days",
    "travelers": ${numberOfPeople},
    "total_budget": ${budgetAmount.toLocaleString('en-PK')}
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
  "mainTransport": {
    "options": [
      {"type": "flight/train/bus", "cost": "PKR 5000", "description": "Main transport option from departure to destination"}
    ]
  },
  "localTransport": {
    "options": [
      {"type": "metro/taxi/bus/scooter", "cost": "PKR 500", "description": "Local transport option within destination"}
    ]
  },
  "localEvents": [
    {"name": "event name", "date": "YYYY-MM-DD", "description": "details"}
  ],
  "budget_breakdown": {
    "main_transport": "PKR 4500",
    "local_transport": "PKR 1500",
    "accommodation": "PKR 5000",
    "food": "PKR 3000",
    "activities": "PKR 2000",
    "visa": "PKR 1000",
    "additional_expenses": "PKR 500",
    "total": "PKR 17500",
    "budgetStatus": "within" or "exceeded",
    "budgetSavings": "PKR 2500" (if total is less than user budget),
    "budgetExcess": "PKR 5000" (if total exceeds user budget)
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
          { role: "system", content: "You are a realistic travel planner for Pakistan. You MUST: 1. Stick to provided budget limits exactly 2. Provide REALISTIC recommendations for the budget category 3. Never suggest options that exceed the budget constraints 4. If budget is insufficient, suggest realistic alternatives 5. Always include exact costs in PKR 6. Respond in valid JSON only" },
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
      () => {
        const jsonMatch = generatedPlan.match(/\{[\s\S]*\}/);
        if (jsonMatch) return jsonMatch[0];
        return null;
      },
      () => {
        const cleaned = generatedPlan.replace(/^[^{]*({.*})[^}]*$/s, '$1').trim();
        if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned;
        return null;
      },
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

      if (planData.trip) {
        const transformedPlan = {
          weather: planData.weather || [],
          touristAttractions: planData.attractions || planData.touristAttractions || [],
          restaurants: planData.restaurants || [],
          packingEssentials: planData.packingEssentials || [],
          accommodations: planData.accommodation || planData.accommodations || [],
          mainTransportation: planData.mainTransport || (planData.transport && planData.transport.mainTransport) || planData.transport || { options: [] },
          localTransportation: planData.localTransport || (planData.transport && planData.transport.localTransport) || planData.localTransportation || { options: [] },
          localEvents: planData.localEvents || [],
          tripCost: planData.budget_breakdown || planData.tripCost || {},
          safetyTips: planData.safetyTips || [],
          itinerary: planData.itinerary || [],
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
          const jsonMatches = generatedPlan.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
          if (jsonMatches && jsonMatches.length > 0) {
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
          // Silent fail
        }

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

    // If parsing failed, create a basic structure
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

    // ---- Post-processing: Remove helicopter + budget calculation ----
    let totalCost = 0;
    try {
      const filterHelicopter = (opts = []) =>
        opts.filter(o => !String(o.type || '').toLowerCase().includes('helicopter'));

      if (planData.mainTransportation && Array.isArray(planData.mainTransportation.options)) {
        planData.mainTransportation.options = filterHelicopter(planData.mainTransportation.options);
      }
      if (planData.mainTransport && Array.isArray(planData.mainTransport.options)) {
        planData.mainTransport.options = filterHelicopter(planData.mainTransport.options);
      }

      // Calculate total from budget_breakdown (if exists)
      if (planData.tripCost && typeof planData.tripCost === 'object') {
        // Prefer explicit total if provided by the AI
        if (planData.tripCost.total) {
        }
      }
    } catch (e) {
      totalCost = 0;
    }

    const userBudget = normalizeBudget(budget) || 0;
    if (totalCost > 0 && userBudget > 0) {
      planData.calculatedTotalCost = `PKR ${totalCost}`;
      if (totalCost > userBudget) {
        planData.budgetExcess = `PKR ${totalCost - userBudget}`;
      } else if (totalCost < userBudget) {
        planData.budgetSavings = `PKR ${userBudget - totalCost}`;
      }
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
});   // <-- YEH BAND HO GAYA THA – AB THEEK HAI

// AI Image Prediction - GET info
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

    formData.append('image', req.file.buffer, {
      filename: req.file.originalname || 'image.jpg',
      contentType: req.file.mimetype
    });

    const response = await axios.post(
      'https://trip-model-api-1.onrender.com/predict',
      formData,
      {
        headers: { ...formData.getHeaders() },
        timeout: parseInt(process.env.PREDICT_TIMEOUT_MS, 10) || 0
      }
    );

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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});