# AI Trip Planner - Full-Stack Web Application

A complete travel planning web application with AI-powered trip planning, agency management, and secure payment processing.

## 🚀 Features

- **AI Trip Planning**: Generate personalized trip plans using Gemini AI
- **Trip Booking**: Browse and book trips with seat selection
- **Secure Payments**: Stripe integration for payment processing
- **User Authentication**: Firebase-based sign up and login
- **Travel Agency Management**: Create agencies and manage trips
- **Admin Dashboard**: Monitor users, agencies, bookings, and payments
- **Image Prediction**: Upload images to identify tourist locations
- **Responsive Design**: Works on desktop, tablet, and mobile

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, JavaScript (ES6 Modules)
- **Backend**: Node.js with Express.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Payments**: Stripe
- **AI**: Google Gemini API, Groq API

## 📋 Prerequisites

- Node.js v14 or higher
- npm v6 or higher
- API Keys: Gemini, Groq, Firebase, Stripe

## 🔧 Quick Start

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with API keys:
```
GEMINI_API_KEY=your_key
GROQ_API_KEY=your_key
PORT=3000
```

3. Start server:
```bash
npm start
```

4. Open `http://localhost:3000`

## 📁 Project Structure

```
adventure/
├── public/
│   ├── index.html              # Home page
│   ├── explore.html            # Explore destinations
│   ├── plan-trip.html          # AI trip planning
│   ├── image-predict.html      # Image prediction
│   ├── profile.html            # User profile & auth
│   ├── create-agency.html      # Create travel agency
│   ├── agency-dashboard.html   # Agency management
│   ├── firebase.js             # Firebase configuration
│   ├── styles.css              # Global styles
│   └── js/
│       ├── home.js             # Home page logic
│       ├── explore.js          # Explore destinations logic
│       ├── plan-trip.js        # Trip planning logic
│       ├── image-predict.js    # Image prediction logic
│       ├── profile.js          # Profile & auth logic
│       ├── create-agency.js    # Agency creation logic
│       └── agency-dashboard.js # Dashboard logic
├── server.js                   # Express server
├── package.json                # Dependencies
└── README.md                   # This file
```

## 🔑 API Keys & Configuration

The following API keys are configured in the code:

- **Gemini API**: `AIzaSyAUXuxdvNhEGMLNdrX6DBPhhWmyG5I6lcg`
- **Image Prediction API**: `https://trip-model-api-1.onrender.com/predict`
- **Firebase Config**: Already configured in `public/firebase.js`

## 🎨 Color Scheme

- **Primary Color**: `#006734` (Green) - Used throughout the UI

## 📝 Firebase Collections

The app uses the following Firestore collections:

- `users` - User profiles and authentication data
- `agencies` - Travel agency information
- `trips` - Trip offerings from agencies
- `bookings` - Trip bookings by users
- `savedPlans` - Saved AI-generated trip plans

## 🚀 Usage

1. **Sign Up/Login**: Create an account or login to access features
2. **Explore Trips**: Browse available trips by city
3. **Plan Trip**: Use AI to generate personalized trip plans
4. **Create Agency**: Register your travel agency
5. **Add Trips**: Agency owners can add trips with details
6. **Book Trips**: Users can book seats on available trips

## 🐛 Troubleshooting

- If the server doesn't start, check if port 3000 is available
- Ensure Firebase configuration is correct
- Check browser console for JavaScript errors
- Verify API keys are valid

## 📄 License

ISC

## 👥 Author

Built for travel planning and agency management.

