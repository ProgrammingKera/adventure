import { db, auth } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, addDoc, query, where, getDocs, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let currentUser = null;
let isOpen = false;

// Inject chatbot HTML into the page
function injectChatbotUI() {
    const chatbotHTML = `
        <style>
            #chatbot-widget {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 380px;
                height: 600px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
                display: flex;
                flex-direction: column;
                z-index: 9999;
                font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                transition: all 0.3s ease;
            }
            #chatbot-widget.hidden {
                display: none;
            }
            .chatbot-header {
                background: linear-gradient(135deg, #006734 0%, #008045 100%);
                color: white;
                padding: 1.2rem;
                border-radius: 12px 12px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .chatbot-header h3 {
                margin: 0;
                font-size: 1.1rem;
                font-weight: 600;
            }
            .chatbot-close {
                background: none;
                border: none;
                color: white;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .chatbot-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1rem;
                background: #f9f9f9;
            }
            .message {
                margin-bottom: 1rem;
                display: flex;
                animation: slideIn 0.3s ease;
            }
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .message.user {
                justify-content: flex-end;
            }
            .message-content {
                max-width: 70%;
                padding: 0.75rem 1rem;
                border-radius: 12px;
                word-wrap: break-word;
                font-size: 0.95rem;
                line-height: 1.4;
            }
            .message.bot .message-content {
                background: #e8f5e9;
                color: #1a1a1a;
                border-bottom-left-radius: 4px;
            }
            .message.user .message-content {
                background: #006734;
                color: white;
                border-bottom-right-radius: 4px;
            }
            .chatbot-input-area {
                padding: 1rem;
                border-top: 1px solid #e0e0e0;
                display: flex;
                gap: 0.5rem;
            }
            .chatbot-input {
                flex: 1;
                border: 1px solid #ddd;
                border-radius: 20px;
                padding: 0.6rem 1rem;
                font-family: inherit;
                font-size: 0.95rem;
                outline: none;
                transition: border-color 0.3s;
            }
            .chatbot-input:focus {
                border-color: #006734;
            }
            .chatbot-send {
                background: #006734;
                color: white;
                border: none;
                border-radius: 50%;
                width: 36px;
                height: 36px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.3s;
            }
            .chatbot-send:hover {
                background: #004d26;
            }
            .chatbot-send:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .chatbot-toggle {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 60px;
                height: 60px;
                background: linear-gradient(135deg, #006734 0%, #008045 100%);
                border: none;
                border-radius: 50%;
                color: white;
                font-size: 1.5rem;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0, 103, 52, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9998;
                transition: all 0.3s ease;
            }
            .chatbot-toggle:hover {
                transform: scale(1.1);
                box-shadow: 0 6px 20px rgba(0, 103, 52, 0.4);
            }
            .chatbot-toggle.hidden {
                display: none;
            }
            .typing-indicator {
                display: flex;
                gap: 4px;
                padding: 0.75rem 1rem;
            }
            .typing-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #999;
                animation: typing 1.4s infinite;
            }
            .typing-dot:nth-child(2) {
                animation-delay: 0.2s;
            }
            .typing-dot:nth-child(3) {
                animation-delay: 0.4s;
            }
            @keyframes typing {
                0%, 60%, 100% {
                    opacity: 0.5;
                    transform: translateY(0);
                }
                30% {
                    opacity: 1;
                    transform: translateY(-10px);
                }
            }
            @media (max-width: 480px) {
                #chatbot-widget {
                    width: 100%;
                    height: 100%;
                    bottom: 0;
                    right: 0;
                    border-radius: 0;
                }
                .chatbot-toggle {
                    bottom: 20px;
                    right: 20px;
                }
            }
        </style>
        <button class="chatbot-toggle" id="chatbot-toggle" title="Open Chat">
            <i class="fa-solid fa-comments"></i>
        </button>
        <div id="chatbot-widget" class="hidden">
            <div class="chatbot-header">
                <h3>Adventure Assistant</h3>
                <button class="chatbot-close" id="chatbot-close">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="chatbot-messages" id="chatbot-messages"></div>
            <div class="chatbot-input-area">
                <input 
                    type="text" 
                    class="chatbot-input" 
                    id="chatbot-input" 
                    placeholder="Ask about trips, destinations..."
                    autocomplete="off"
                >
                <button class="chatbot-send" id="chatbot-send">
                    <i class="fa-solid fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);
}

// Inject UI when script loads
injectChatbotUI();

// Check auth state
onAuthStateChanged(auth, (user) => {
    currentUser = user;
});

// DOM Elements
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotWidget = document.getElementById('chatbot-widget');
const chatbotClose = document.getElementById('chatbot-close');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotSend = document.getElementById('chatbot-send');
const chatbotMessages = document.getElementById('chatbot-messages');

// Toggle chatbot
chatbotToggle.addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
        chatbotWidget.classList.remove('hidden');
        chatbotToggle.classList.add('hidden');
        chatbotInput.focus();
    } else {
        chatbotWidget.classList.add('hidden');
        chatbotToggle.classList.remove('hidden');
    }
});

chatbotClose.addEventListener('click', () => {
    isOpen = false;
    chatbotWidget.classList.add('hidden');
    chatbotToggle.classList.remove('hidden');
});

// Function to fetch trips from Firebase
async function fetchTripsFromFirebase(destination = null) {
    try {
        // Always fetch all trips first
        const tripsQuery = query(collection(db, 'trips'));
        const snapshot = await getDocs(tripsQuery);
        const allTrips = [];
        
        snapshot.forEach(doc => {
            allTrips.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Filter by destination client-side (case-insensitive)
        if (destination) {
            const destLower = destination.toLowerCase().trim();
            return allTrips.filter(trip => 
                trip.location && trip.location.toLowerCase().includes(destLower)
            );
        }
        
        return allTrips;
    } catch (error) {
        console.error('Error fetching trips:', error);
        return [];
    }
}

// Send message
chatbotSend.addEventListener('click', sendMessage);
chatbotInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const message = chatbotInput.value.trim();
    if (!message) return;

    // Add user message to UI
    addMessageToUI(message, 'user');
    chatbotInput.value = '';
    chatbotSend.disabled = true;

    // Chat history saving disabled

    // Show typing indicator
    showTypingIndicator();

    try {
        // Check if user is asking about trips
        const isAskingAboutTrips = /trip|destination|location|place|where|available|book|package/i.test(message);
        let botMessage = '';
        
        if (isAskingAboutTrips) {
            // Extract destination from message
            const destinationMatch = message.match(/(?:to|for|in|at|near)\s+([A-Za-z\s]+?)(?:\?|$)/i);
            const destination = destinationMatch ? destinationMatch[1].trim() : null;
            
            // Fetch trips from Firebase
            const trips = await fetchTripsFromFirebase(destination);
            
            if (trips.length > 0) {
                // Show all trips (no strict date filtering)
                const displayTrips = trips;
                
                if (destination) {
                    botMessage = `Available trips to ${destination}:\n\n`;
                } else {
                    botMessage = `Available trips:\n\n`;
                }
                
                displayTrips.forEach((trip, index) => {
                    botMessage += `\n=== TRIP ${index + 1} ===\n`;
                    botMessage += `${trip.description || trip.location}\n`;
                    botMessage += `\nDestination: ${trip.location || 'N/A'}\n`;
                    botMessage += `Departure: ${trip.departure || 'N/A'}\n`;
                    botMessage += `Price: PKR ${trip.pricePerSeat || 'N/A'}\n`;
                    if (trip.availableSeats) {
                        botMessage += `Available Seats: ${trip.availableSeats}\n`;
                    }
                });
                
                botMessage += `Visit Explore page to book!`;
            } else {
                if (destination) {
                    botMessage = `No trips found to ${destination}. Try checking the Explore page or ask about a different destination!`;
                } else {
                    botMessage = `Tell me where you want to go! For example: Islamabad, Lahore, Hunza, Skardu, etc.`;
                }
            }
        } else {
            // For general questions, use Groq API
            const response = await fetch('/api/chatbot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
                    userId: currentUser?.uid || null
                })
            });

            const data = await response.json();
            
            if (data.success) {
                botMessage = removeMarkdown(data.response);
            } else {
                botMessage = 'Sorry, I encountered an error. Please try again.';
            }
        }
        
        removeTypingIndicator();
        addMessageToUI(botMessage, 'bot');

        // Chat history saving disabled
    } catch (error) {
        console.error('Error:', error);
        removeTypingIndicator();
        addMessageToUI('Sorry, I encountered an error. Please try again.', 'bot');
    }

    chatbotSend.disabled = false;
}

function addMessageToUI(message, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.innerHTML = `<div class="message-content">${escapeHtml(message)}</div>`;
    chatbotMessages.appendChild(messageDiv);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function showTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';
    messageDiv.id = 'typing-indicator';
    messageDiv.innerHTML = `
    <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    </div>
    `;
    chatbotMessages.appendChild(messageDiv);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Function to remove markdown formatting
function removeMarkdown(text) {
    if (!text) return text;
    // Remove bold (**text**)
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');
    // Remove italic (*text*) - but be careful with single asterisks
    text = text.replace(/\*(.*?)\*/g, '$1');
    // Remove headers (# text)
    text = text.replace(/^#+\s+/gm, '');
    // Remove bullet points (- text) at start of line
    text = text.replace(/^\s*[-*]\s+/gm, '');
    // Remove numbered lists (1. text)
    text = text.replace(/^\s*\d+\.\s+/gm, '');
    // Remove any remaining markdown symbols
    text = text.replace(/[*_`]/g, '');
    return text;
}

// Chat history loading disabled