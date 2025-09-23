# Duely - Bracket Battle Platform

A full-stack web application for creating and participating in tournament-style brackets where users repeatedly choose between two options (songs, videos, or images). Features include user authentication, custom bracket creation, global rankings, and comprehensive results tracking.

## 🚀 Features

### Core Functionality
- **Tournament-style bracket battles** - Head-to-head elimination rounds
- **Multi-media support** - Songs, videos (YouTube), and images
- **Interactive media previews** - Audio playback on hover, video thumbnails with play buttons, image zoom
- **Real-time bracket progression** - Smooth animations and state management
- **Comprehensive ranking system** - Individual battles, personal averages, and global rankings

### User Experience
- **Firebase Authentication** - Google sign-in with session support for anonymous users
- **Custom bracket creation** - Users can create their own brackets with custom items
- **Session battles** - Anonymous users can participate without signing up
- **Results persistence** - Signed-in users save progress permanently
- **Global vs Personal rankings** - Compare your results with the community
- **Responsive design** - Works seamlessly on desktop and mobile
- **Smooth animations** - Powered by Framer Motion

### Advanced Features
- **Multiple result views** - Individual battles, personal aggregates, global community rankings
- **Battle history** - Track all your previous battles and results
- **Popular brackets** - Discover trending content from the community
- **Media optimization** - Lazy loading, error handling, and performance optimization

## 🏗️ Architecture

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS 4 + Framer Motion 12
- **Authentication**: Firebase Auth with Google provider
- **Backend**: Java 21 + Spring Boot 3.3
- **Database**: PostgreSQL 15 with Liquibase migrations
- **API**: RESTful JSON endpoints with CORS support
- **Containerization**: Docker + Docker Compose

## 🛠️ Technology Stack

### Frontend
- React 19.1 with TypeScript
- Vite 7 for build tooling
- TailwindCSS 4 for styling
- Framer Motion for animations
- React Router for navigation
- Axios for API communication
- Firebase SDK for authentication

### Backend
- Java 21
- Spring Boot 3.3
- Spring Data JPA
- PostgreSQL driver
- Liquibase for database migrations
- Maven for dependency management

### DevOps & Tools
- Docker & Docker Compose
- Vitest for testing
- ESLint & Prettier (configured)
- GitHub for version control

## 📋 Prerequisites

- **Node.js** 22 (LTS) or higher
- **Java** 21 or higher
- **PostgreSQL** 15 or higher
- **Docker** (optional, for containerized setup)
- **Firebase Project** (for authentication - see setup below)

Note: The frontend includes an `.nvmrc` set to `22` to help Node version managers align with the project. On Windows you can use nvm-windows or install Node 22 via Winget/Chocolatey.

## 🚀 Quick Start

### Method 1: Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PikuButBetter
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Firebase and database credentials
   ```

3. **Run with Docker**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080

### Method 2: Local Development

#### Backend Setup
```bash
cd backend

# Create PostgreSQL database
createdb bracket_battle

# Set environment variables (or use application.properties)
export DB_URL=jdbc:postgresql://localhost:5432/bracket_battle
export DB_USERNAME=postgres
export DB_PASSWORD=your_password

# Run the application
./mvnw spring-boot:run
```

#### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your Firebase configuration to .env.local

# Start development server
npm run dev
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DB_URL=jdbc:postgresql://localhost:5432/bracket_battle
DB_USERNAME=postgres
DB_PASSWORD=your_password

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Firebase Configuration (get these from Firebase Console)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Firebase Setup

1. Create a new Firebase project at https://console.firebase.google.com
2. Enable Authentication and configure Google sign-in provider
3. Get your Firebase configuration from Project Settings
4. Add the configuration to your `.env` file

## Firebase credentials (Option A: Base64 env)

To run the backend with Firebase Auth, provide service account credentials via a base64-encoded environment variable.

1. Generate base64 from your service-account JSON (Windows PowerShell):

```
powershell -NoProfile -Command "$b = [Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\\path\\to\\service-account.json')); $b"
```

Or use the helper script in this repo:

```
./scripts/encode-firebase-credentials.ps1 -Path C:\path\to\service-account.json -ToClipboard
```

2. Paste the base64 string into `backend/.env`:

```
FIREBASE_CREDENTIALS_JSON=<paste_here>
```

3. Recreate containers:

```
docker compose up -d --build
```

4. Verify env is loaded and Firebase initialized:

```
docker compose config
docker compose logs backend --tail=200
```

If you prefer file-based credentials, mount the JSON and set `GOOGLE_APPLICATION_CREDENTIALS` instead (see docker-compose.yml notes).

## 📚 API Reference

### Brackets
- `GET /api/brackets` - Get all brackets
- `GET /api/brackets/{id}` - Get specific bracket
- `POST /api/brackets` - Create new bracket
- `GET /api/brackets/popular` - Get popular brackets

### Items
- `GET /api/brackets/{id}/items` - Get bracket items
- `POST /api/brackets/{id}/items` - Add item to bracket

### Results
- `POST /api/brackets/{id}/results` - Save bracket results
- `GET /api/brackets/{id}/results` - Get all bracket results
- `GET /api/brackets/{id}/users/{userId}/results` - Get user's bracket results
- `GET /api/users/{userId}/results` - Get all user results

## 🗂️ Project Structure

```
PikuButBetter/
├── frontend/                   # React TypeScript application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── MediaPreview.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── ...
│   │   ├── pages/            # Application pages
│   │   │   ├── HomePage.tsx
│   │   │   ├── BracketPage.tsx
│   │   │   ├── CustomBracketPage.tsx
│   │   │   ├── ResultsPage.tsx
│   │   │   └── BrowsePage.tsx
│   │   ├── contexts/         # React contexts
│   │   │   ├── AuthContext.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   └── SessionBattleContext.tsx
│   │   ├── services/         # API services
│   │   ├── types/           # TypeScript definitions
│   │   └── config/          # Configuration files
│   ├── public/              # Static assets
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── backend/                  # Spring Boot API
│   ├── src/main/java/com/bracketbattle/
│   │   ├── controller/      # REST controllers
│   │   ├── model/          # JPA entities
│   │   ├── repository/     # Data repositories
│   │   ├── service/        # Business logic
│   │   └── BracketBattleApplication.java
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   └── db/changelog/   # Liquibase migrations
│   ├── pom.xml
│   └── Dockerfile
├── docker-compose.yml       # Container orchestration
├── .env                    # Environment variables
└── README.md
```

## 🧪 Testing

### Frontend
```bash
cd frontend
npm test              # Run tests
npm run test:ui       # Run tests with UI
```

### Backend
```bash
cd backend
./mvnw test          # Run all tests
```

## 🚀 Deployment

### Production Build

**Frontend:**
```bash
cd frontend
npm run build
```

**Backend:**
```bash
cd backend
./mvnw clean package
```

### Docker Production
```bash
docker-compose -f docker-compose.prod.yml up --build
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🐛 Troubleshooting

### Common Issues

**Database Connection Issues:**
- Ensure PostgreSQL is running and accessible
- Check database credentials in `.env` file
- Verify database `bracket_battle` exists

**Firebase Authentication Issues:**
- Verify Firebase configuration in `.env` file
- Ensure Google sign-in is enabled in Firebase Console
- Check CORS settings in Firebase

**CORS Issues:**
- Update `CORS_ALLOWED_ORIGINS` in backend configuration
- Ensure frontend URL matches CORS settings

## 📞 Support

For support, please open an issue on GitHub or contact the development team.
