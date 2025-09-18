# Duely

A full-stack web application where users repeatedly choose between two options (songs, videos, or images) in tournament-style brackets.

## Architecture

- **Frontend**: React (TypeScript) + TailwindCSS + Framer Motion
- **Backend**: Java Spring Boot (REST API)
- **Database**: PostgreSQL
- **API Format**: JSON

## Features

- Tournament-style bracket elimination
- Media preview on hover (audio for songs, video for videos, image zoom for images)
- Real-time bracket progression
- Final ranking display
- Responsive design with smooth animations

## Quick Start

### Prerequisites
- Node.js 18+
- Java 17+
- PostgreSQL 15+
- Docker (optional)

### Backend Setup
```bash
cd backend
./mvnw spring-boot:run
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Database Setup
```bash
# Create PostgreSQL database
createdb bracket_battle

# Application will auto-create tables on startup
```

### Docker Setup
```bash
# Build and run with Docker Compose
docker-compose up --build
```

## API Endpoints

- `GET /api/brackets/{id}/items` - Get bracket items
- `POST /api/brackets/{id}/results` - Save bracket results
- `GET /api/brackets/popular` - Get popular brackets

## Project Structure

```
PikuButBetter/
├── frontend/          # React TypeScript app
├── backend/           # Spring Boot API
├── docker-compose.yml # Docker setup
└── README.md
```
