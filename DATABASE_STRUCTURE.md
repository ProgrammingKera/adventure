# Firebase Database Structure

यह document आपके Firebase database की structure को describe करता है जो images में दिखाई गई है।

## Collections

### 1. **agencies** Collection
Travel agencies की information store होती है।

**Fields:**
- `averageRating` (Number) - Agency की average rating (default: 0)
- `description` (String) - Agency का description/bio
- `email` (String) - Agency का contact email
- `location` (String) - Agency का city/location
- `name` (String) - Agency का name
- `ownerId` (String) - Firebase Auth user ID जो agency का owner है
- `phone` (String) - Agency का phone number
- `ratingCount` (Number) - Total ratings की count (default: 0)

**Example:**
```javascript
{
  averageRating: 0,
  description: "ndnd",
  email: "meessyed@gmail.com",
  location: "Islamabad",
  name: "mesu.",
  ownerId: "DIz6kd8VXbbjZ6rxPcXYI0uzN6u2",
  phone: "034456789876",
  ratingCount: 0
}
```

---

### 2. **bookings** Collection
Users द्वारा trips की bookings store होती हैं।

**Fields:**
- `seatsBooked` (Number) - Kitne seats book kiye gaye
- `tripId` (String) - Trip document का ID
- `userEmail` (String) - User का email
- `userId` (String) - Firebase Auth user ID
- `userLocation` (String) - User का location/address
- `userName` (String) - User का name
- `userPhone` (String | null) - User का phone number (null ho sakta hai)

**Example:**
```javascript
{
  seatsBooked: 4,
  tripId: "j7Rs6m367F5AN4ttK9Pt",
  userEmail: "mwicky457@gmail.com",
  userId: "8b34HiVlJHXQnwnwWVVF6euVOs83",
  userLocation: "Rohtas Road Jhelum",
  userName: "usman ali",
  userPhone: null
}
```

---

### 3. **trips** Collection
Agencies द्वारा add kiye gaye trips store होते हैं।

**Fields:**
- `agencyId` (String) - Agency document का ID
- `bookedSeats` (Number) - Kitne seats already book ho chuki hain (default: 0)
- `date` (String) - Departure date, formatted as: "September 30, 2025 at 12:00:00 AM UTC+5"
- `departure` (String) - Departure point/location
- `description` (String) - Trip का title/description
- `id` (String) - Trip document का ID (same as document ID)
- `imageUrl` (String) - Trip image का URL
- `location` (String) - Destination city/location
- `pricePerSeat` (Number) - Ek seat ki price (PKR mein)
- `totalSeats` (Number) - Total available seats

**Example:**
```javascript
{
  agencyId: "Oh7hZUkNA8aqm6osxj5t",
  bookedSeats: 0,
  date: "September 30, 2025 at 12:00:00 AM UTC+5",
  departure: "Sohrab Goth Bus Terminal, Karachi",
  description: "Travel from karachi to historic city of lahore...",
  id: "2tNcyGe2w0vbl1HOP3cs",
  imageUrl: "https://res.cloudinary.com/dcm9xgvb4/image/upload/v175912...",
  location: "Lahore",
  pricePerSeat: 10000,
  totalSeats: 40
}
```

---

### 4. **users** Collection
User profiles और authentication data store होता है।

**Fields:**
- `agencyId` (String | null) - Agar user agency owner hai to agency ID (null ho sakta hai)
- `bio` (String | null) - User का bio/description (null ho sakta hai)
- `email` (String) - User का email
- `id` (String) - User document का ID (same as Firebase Auth UID)
- `imageUrl` (String | null) - Profile picture का URL (null ho sakta hai)
- `name` (String) - User का name
- `phone` (String | null) - User का phone number (null ho sakta hai)
- `userType` (String) - User का type: "AGENCY" ya "USER"

**Example:**
```javascript
{
  agencyId: "jXtEiCx4pdFA7Iq0eT3P",
  bio: null,
  email: "nehamaryam098@gmail.com",
  id: "5Gw0epKGWndkb9ItmTx1Sq7rbn23",
  imageUrl: null,
  name: "talal",
  phone: null,
  userType: "AGENCY"
}
```

---

## Important Notes

1. **Date Format**: Trips में `date` field हमेशा string format में है, जैसे: "September 30, 2025 at 12:00:00 AM UTC+5"

2. **Relationships**:
   - `trips.agencyId` → `agencies` document ID
   - `bookings.tripId` → `trips` document ID
   - `bookings.userId` → `users` document ID
   - `agencies.ownerId` → `users` document ID (Firebase Auth UID)
   - `users.agencyId` → `agencies` document ID (agar user agency owner hai)

3. **Null Values**: `userPhone`, `bio`, `imageUrl`, `agencyId` fields null ho sakte hain

4. **ID Fields**: `trips.id` और `users.id` fields document ID के same hote hain

---

## Code Implementation

सभी JavaScript files में यह structure properly use हो रहा है:
- ✅ `public/js/create-agency.js` - Agencies create करता है
- ✅ `public/js/agency-dashboard.js` - Trips add करता है (date string format में)
- ✅ `public/js/explore.js` - Trips और bookings handle करता है
- ✅ `public/js/profile.js` - Users manage करता है
- ✅ `public/js/home.js` - Trips display करता है

