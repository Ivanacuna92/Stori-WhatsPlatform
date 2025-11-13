# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-user WhatsApp management platform with AI-powered responses using DeepSeek API and a React-based web dashboard for monitoring conversations. Uses WPPConnect for robust multi-session support.

## Commands

### Development
```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Start production server
npm start

# Build React frontend
npm run build

# Preview production build
npm run preview
```

## Architecture

### Core Components

1. **WhatsApp Instance Manager** (`src/services/whatsappInstanceManager.js`)
   - Uses WPPConnect library for multi-session WhatsApp support
   - Manages multiple WhatsApp instances (one per support user)
   - Handles message events, session management, and QR authentication per instance
   - Integrates with client assignment system for routing messages

2. **WhatsApp Bot (Simple)** (`src/bot/whatsappBot.js`)
   - Simple single-instance bot using WPPConnect
   - Handles message events and QR authentication
   - Used for basic single-user scenarios

3. **AI Service** (`src/services/aiService.js`)
   - Integrates with DeepSeek API for generating intelligent responses
   - Manages conversation context with configurable message history limit
   - Custom prompt loaded from `prompt.txt` file

4. **Session Management** (`src/services/sessionManager.js`)
   - Tracks user conversations with automatic cleanup after 5 minutes of inactivity
   - Maintains conversation context per user
   - Sends notification before session reset

5. **Human Mode Manager** (`src/services/humanModeManager.js`)
   - Allows human operators to take over conversations
   - Persists human mode states in `data/human-states.json`
   - Toggle between AI and human responses per contact

6. **Web Server** (`src/web/server.js`)
   - Express server with API endpoints for logs, stats, and conversations
   - Vite integration for React development
   - Serves production build from `dist/` directory

7. **React Dashboard** (`src/web/react/`)
   - Real-time conversation monitoring
   - Contact list with human mode toggle
   - Chat panel for viewing conversations
   - Statistics dashboard with activity graphs

## Configuration

### Environment Variables
Create `.env` file with:
```
DEEPSEEK_API_KEY=your_api_key_here
WEB_PORT=3001
```

### Key Configuration (`src/config/config.js`)
- `sessionTimeout`: 5 minutes (conversation reset timeout)
- `checkInterval`: 1 minute (cleanup check frequency)
- `maxMessages`: 10 (conversation context limit)
- API validation on startup

## Development Workflow

### Frontend Development
- React components in `src/web/react/src/components/`
- Vite dev server runs in middleware mode with Express
- Tailwind CSS with custom Navetec color scheme
- API service in `src/web/react/src/services/api.js`

### Backend Development
- Nodemon watches `index.js` and `src/**/*.js`
- Ignores logs, data, dist, and React directories
- 1-second delay before restart

### Data Persistence
- Logs stored in `logs/` directory as daily JSON files
- Human mode states in `data/human-states.json`
- WhatsApp sessions in `tokens/` directory (WPPConnect format)
  - `tokens/user_{id}/` for multi-user instances
  - `tokens/main_bot/` for simple bot instance
- MySQL database for users, conversations, and instance management

## Important Notes

- The system supports multiple WhatsApp instances (multi-user mode)
- Each support user gets their own WhatsApp instance with separate QR authentication
- Only responds to private messages (ignores groups by default)
- Requires QR code scan for initial WhatsApp authentication per instance
- Web panel accessible at http://localhost:3001
- Uses WPPConnect (@wppconnect-team/wppconnect) for stable multi-session support
- Sessions are stored in `tokens/` directory
- Vite config includes ngrok domains for development tunneling
- No test framework currently configured
- No linting or formatting tools configured

## Multi-User Architecture

- `whatsappInstanceManager` handles multiple concurrent WhatsApp connections
- Each support user has their own session: `user_{supportUserId}`
- Client assignment system routes messages to specific support users
- Automatic reconnection with exponential backoff
- QR code management per instance via web panel