# AI Trip Planner - Full-Stack Web Application

A complete travel planning web application with AI-powered trip planning, agency management, and booking features.

## 🚀 Features

- **Home Screen**: Hero section with travel tips and featured trips
- **Explore Destinations**: Browse trips by city with agency information
- **AI Trip Planning**: Generate personalized trip plans using Gemini 2.5-Flash AI
- **AI Image Prediction**: Upload images of tourist places to get location information
- **User Authentication**: Sign up, login, and profile management
- **Travel Agency Creation**: Any user can create their own travel agency
- **Agency Dashboard**: Add trips, view bookings, and manage agency operations
- **Trip Booking**: Book seats on available trips

## 🛠️ Tech Stack

- **Frontend**: HTML, CSS, JavaScript (ES6 Modules)
- **Backend**: Node.js with Express.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Authentication
- **AI Model**: Google Gemini 2.5-Flash
- **Image Prediction**: Custom ML API endpoint

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase project with Firestore and Authentication enabled

## 🔧 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd adventure
```

2. Install dependencies:
```bash
npm install
```

3. Firebase configuration is already set up in `public/firebase.js`

4. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

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

