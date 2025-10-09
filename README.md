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
- **Dark mode support** - Theme toggle with persistent preferences

### Advanced Features
- **Multiple result views** - Individual battles, personal aggregates, global community rankings
- **Battle history** - Track all your previous battles and results
- **Popular brackets** - Discover trending content from the community
- **Media optimization** - Lazy loading, error handling, and performance optimization
- **Redis caching** - High-performance caching for brackets and results with cache management
- **Rate limiting** - Protection against abuse with 5 submissions per minute per user
- **Input sanitization** - XSS protection with HTML sanitization using Jsoup
- **Health monitoring** - Actuator endpoints for database and Redis health checks

## 🏗️ Architecture

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS 4 + Framer Motion 12
- **Authentication**: Firebase Auth with Google provider
- **Backend**: Java 21 + Spring Boot 3.3.3
- **Database**: PostgreSQL 15 with Liquibase migrations
- **Cache**: Redis 8 with Lettuce client
- **API**: RESTful JSON endpoints with CORS support
- **Security**: Spring Security with Firebase token validation
- **Containerization**: Docker + Docker Compose

## 🛠️ Technology Stack

### Frontend
- React 19.1 with TypeScript 5.7
- Vite 7 for build tooling
- TailwindCSS 4 for styling
- Framer Motion 12 for animations
- React Router 7 for navigation
- Axios 1.7 for API communication
- Firebase SDK 12 for authentication
- Vitest 3 for testing

### Backend
- Java 21
- Spring Boot 3.3.3
- Spring Data JPA with Hibernate
- Spring Security for authentication/authorization
- Spring Data Redis for caching
- PostgreSQL driver
- Liquibase for database migrations
- Firebase Admin SDK 9.2 for token verification
- Resilience4j 2.1 for rate limiting
- Jsoup 1.18 for HTML sanitization
- Spring Boot Actuator for monitoring
- Maven for dependency management

### Infrastructure
- PostgreSQL 15 (Alpine)
- Redis 8 (Alpine) with persistence
- Docker & Docker Compose
- Nginx (for frontend in production)

### DevOps & Tools
- Docker & Docker Compose
- Vitest for testing
- GitHub for version control

## 📋 Prerequisites

- **Node.js** 22 or higher
- **Java** 21 or higher
- **PostgreSQL** 15 or higher (optional if using Docker)
- **Redis** 8 or higher (optional if using Docker)
- **Docker** (optional, for containerized setup)
- **Firebase Project** (for authentication - see setup below)

Note: The frontend includes an `.nvmrc` set to `22` to help Node version managers align with the project. On Windows you can use nvm-windows or install Node 22 via Winget/Chocolatey.

## 🚀 Quick Start

### Method 1: Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd duely
   ```

2. **Set up environment variables**

   Create a `.env` file in the root directory with database and CORS settings:
   ```env
   # Database Configuration
   DB_URL=jdbc:postgresql://postgres:5432/bracket_battle
   DB_USERNAME=postgres
   DB_PASSWORD=your_secure_password

   # Server Configuration
   SERVER_PORT=8080

   # CORS Configuration
   CORS_ALLOWED_ORIGINS=http://localhost:3000

   # Firebase Frontend Configuration
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

   Create `backend/.env` with Firebase backend credentials:
   ```env
   FIREBASE_ENABLED=true
   FIREBASE_CREDENTIALS_JSON=your_base64_encoded_service_account_json
   ```

3. **Run with Docker**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080
   - Health Check: http://localhost:8080/actuator/health

### Method 2: Local Development

#### Backend Setup
```bash
cd backend

# Create PostgreSQL database
createdb bracket_battle

# Ensure Redis is running
redis-server

# Set environment variables (or use application.properties)
set DB_URL=jdbc:postgresql://localhost:5432/bracket_battle
set DB_USERNAME=postgres
set DB_PASSWORD=your_password
set REDIS_HOST=localhost
set REDIS_PORT=6379

# Run the application (Windows)
mvnw.cmd spring-boot:run
```

#### Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
# Copy frontend\.env.example to frontend\.env.local and configure

# Start development server
npm run dev
```

## 🔧 Configuration

### Environment Variables

#### Root `.env` file
```env
# Database Configuration
DB_URL=jdbc:postgresql://postgres:5432/bracket_battle
DB_USERNAME=postgres
DB_PASSWORD=your_password

# Server Configuration
SERVER_PORT=8080

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Redis Configuration (optional, defaults provided)
REDIS_HOST=redis
REDIS_PORT=6379

# Firebase Frontend Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

#### Backend `.env` file (`backend/.env`)
```env
# Firebase Backend Configuration
FIREBASE_ENABLED=true
FIREBASE_CREDENTIALS_JSON=your_base64_encoded_service_account_json
```

### Firebase Setup

#### Frontend Configuration
1. Create a new Firebase project at https://console.firebase.google.com
2. Enable Authentication and configure Google sign-in provider
3. Get your Firebase configuration from Project Settings > General
4. Add the configuration to your root `.env` file (VITE_* variables)

#### Backend Configuration
1. In Firebase Console, go to Project Settings > Service Accounts
2. Click "Generate New Private Key" to download the service account JSON
3. Encode the JSON file to base64 (Windows PowerShell):
   ```powershell
   $bytes = [System.IO.File]::ReadAllBytes("C:\path\to\serviceAccountKey.json")
   $base64 = [System.Convert]::ToBase64String($bytes)
   $base64 | Set-Clipboard
   ```
4. Paste the base64 string into `backend/.env` as `FIREBASE_CREDENTIALS_JSON`
5. Alternatively, set `GOOGLE_APPLICATION_CREDENTIALS` to the file path

### Redis Configuration

Redis is used for caching brackets, items, and results to improve performance. Configuration options in `application.properties`:

- **Cache TTL**: 10 minutes (600,000ms)
- **Connection Pool**: Max 8 active, 2 min idle
- **Timeout**: 2 seconds for operations

Cache keys are prefixed with `bracket-battle:` for organization.

### Rate Limiting

API rate limits are configured per user:
- **Results submission**: 5 requests per minute per user
- **Response**: HTTP 429 when exceeded with retry-after information

## 📚 API Reference

### Brackets
- `GET /brackets` - Get all brackets
- `GET /brackets/{id}` - Get specific bracket
- `POST /brackets` - Create new bracket (requires authentication)
- `GET /brackets/popular` - Get popular brackets
- `GET /brackets/{id}/items` - Get bracket items
- `POST /brackets/{id}/items` - Add item to bracket (requires authentication)

### Results
- `POST /brackets/{id}/results` - Save bracket results (requires authentication, rate limited)
- `GET /brackets/{id}/results` - Get all bracket results
- `GET /brackets/{id}/users/{userId}/results` - Get user's bracket results
- `GET /users/{userId}/results` - Get all user results

### Cache Management
- `POST /admin/cache/clear` - Clear all caches (requires authentication)
- `GET /admin/cache/stats` - Get cache statistics (requires authentication)

### Health & Monitoring
- `GET /actuator/health` - Application health status
- `GET /actuator/info` - Application information
- `GET /actuator/caches` - Cache information

All API endpoints are prefixed with `/api` when accessed through the frontend proxy.

## 🗂️ Project Structure

```
duely/
├── frontend/                   # React TypeScript application
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   │   ├── LoginButton.tsx
│   │   │   ├── MediaPreview.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   └── UserProfile.tsx
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
│   │   │   └── api.ts
│   │   ├── utils/           # Utility functions
│   │   │   ├── apiCache.ts
│   │   │   ├── bracketSorting.ts
│   │   │   ├── debounce.ts
│   │   │   └── mediaUtils.ts
│   │   ├── types/           # TypeScript definitions
│   │   └── config/          # Configuration files
│   │       └── firebase.ts
│   ├── public/              # Static assets
│   ├── .nvmrc               # Node version specification
│   ├── .env.example         # Environment template
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── backend/                  # Spring Boot API
│   ├── src/main/java/com/bracketbattle/
│   │   ├── advice/          # Global exception handling
│   │   │   └── GlobalExceptionHandler.java
│   │   ├── config/          # Configuration classes
│   │   │   ├── CacheConfig.java
│   │   │   ├── JacksonConfig.java
│   │   │   ├── RateLimiterConfig.java
│   │   │   ├── ReadRateLimiterInterceptor.java
│   │   │   ├── RedisHealthIndicator.java
│   │   │   └── WebMvcConfig.java
│   │   ├── controller/      # REST controllers
│   │   │   ├── BracketController.java
│   │   │   ├── CacheManagementController.java
│   │   │   └── CsrfController.java
│   │   ├── dto/            # Data Transfer Objects
│   │   │   ├── AddItemRequest.java
│   │   │   ├── CreateBracketRequest.java
│   │   │   └── SaveResultRequest.java
│   │   ├── model/          # JPA entities
│   │   │   ├── Bracket.java
│   │   │   ├── Item.java
│   │   │   └── Result.java
│   │   ├── repository/     # Data repositories
│   │   │   ├── BracketRepository.java
│   │   │   ├── ItemRepository.java
│   │   │   └── ResultRepository.java
│   │   ├── security/       # Security configuration
│   │   │   ├── SecurityConfig.java
│   │   │   └── firebase/
│   │   │       ├── FirebaseAuthenticationFilter.java
│   │   │       └── FirebaseConfig.java
│   │   ├── service/        # Business logic
│   │   │   ├── BracketService.java
│   │   │   └── CacheMonitoringService.java
│   │   ├── util/           # Utility classes
│   │   │   └── Sanitizer.java
│   │   └── BracketBattleApplication.java
│   ├── src/main/resources/
│   │   ├── application.properties
│   │   └── db/changelog/   # Liquibase migrations
│   │       └── db.changelog-master.xml
│   ├── .env.example        # Backend environment template
│   ├── pom.xml
│   └── Dockerfile
├── docker-compose.yml       # Container orchestration
├── .env                    # Environment variables (not in git)
├── .gitignore
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
mvnw.cmd test         # Run all tests (Windows)
./mvnw test           # Run all tests (Linux/Mac)
```

## 🚀 Deployment

### Production Build

**Frontend:**
```bash
cd frontend
npm run build
# Output in frontend/build directory
```

**Backend:**
```bash
cd backend
mvnw.cmd clean package      # Windows
./mvnw clean package         # Linux/Mac
# JAR file in backend/target directory
```

### Docker Production
For production deployment, ensure you:
1. Use strong passwords and secure credentials
2. Configure proper CORS origins for your domain
3. Enable HTTPS/SSL termination
4. Set appropriate cache TTL values
5. Configure Redis persistence and backup
6. Monitor actuator endpoints for health

## 🛡️ Security Features

- **Firebase Authentication**: Secure Google sign-in with JWT token validation
- **Spring Security**: Role-based access control (USER role required for mutations)
- **Rate Limiting**: Per-user rate limits to prevent abuse
- **Input Sanitization**: XSS protection using Jsoup HTML sanitizer
- **CORS Protection**: Configurable allowed origins
- **CSRF Protection**: Token-based CSRF protection for state-changing operations
- **Validation**: Request validation using Jakarta Validation annotations

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
- Check Docker container logs: `docker-compose logs postgres`

**Redis Connection Issues:**
- Ensure Redis is running and accessible
- Check Redis health: `docker-compose logs redis`
- Verify Redis connection in actuator: http://localhost:8080/actuator/health

**Firebase Authentication Issues:**
- Verify Firebase configuration in `.env` file
- Ensure Google sign-in is enabled in Firebase Console
- Check Firebase credentials are properly base64 encoded in `backend/.env`
- Review backend logs for Firebase initialization errors: `docker-compose logs backend`

**CORS Issues:**
- Update `CORS_ALLOWED_ORIGINS` in `.env` to match your frontend URL
- Ensure the protocol (http/https) matches exactly
- Check browser console for specific CORS errors

**Rate Limiting Issues:**
- If you see HTTP 429 errors, wait 60 seconds before retrying
- Rate limit is 5 submissions per minute per authenticated user
- Check actuator for rate limiter health: http://localhost:8080/actuator/health

**Cache Issues:**
- Clear all caches via admin endpoint: `POST /admin/cache/clear`
- Check cache statistics: `GET /admin/cache/stats`
- Verify Redis is running and connected

## 📞 Support

For support, please open an issue on GitHub or contact the development team.
