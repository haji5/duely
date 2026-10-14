# AI Agent Guidelines for Duely Codebase

Welcome! This document provides essential knowledge for AI agents working on the Duely project. By following these conventions, you ensure your implementations match the existing architecture and align with the project's unique practices.

## 🏗️ System Architecture & Big Picture
- **Stack**: React 19 (TypeScript, Vite, Tailwind CSS 4) + Spring Boot 3 (Java 21).
- **Core Entity Flow**: `Bracket` has many `Item`s and `Result`s. Data generally flows through the controller directly into JPA Entities without DTO transformation objects apart from inputs (no MapStruct or massive DTO layers; endpoints return entities or custom aggregations).
- **Network Proxying (CRITICAL PITFALL)**:
  - In Docker, `nginx` serves on port 3000 and maps `/api/*` to `http://backend:8080/*` (stripping the `/api` prefix).
  - The backend controllers (like `BracketController`) have **no prefix** mapped (`@GetMapping("/brackets")`, NOT `/api/brackets`).
  - Locally, the Vite dev server mirrors this: `/api/*` is proxied to `http://localhost:8080` with the prefix stripped, and `VITE_API_URL` defaults to `/api`.
- **Caching (`Valkey`)**: Heavy reliance on caching via Spring's `@Cacheable`, `@CacheEvict`, natively backed by Valkey (Redis-compatible). See `CacheConfig.java` for TTL bounds. Cache invalidation or mutation updates are strictly necessary when writing POST/PUT routines on brackets and items.

## 🧑‍💻 Developer Workflows
- **Backend Testing**: Standard Maven lifecycle (`mvn test` inside `/backend`; there is no Maven wrapper). There are no backend tests yet; any Spring context test must mock Firebase (`@MockBean FirebaseAuth`), since `FirebaseConfig` refuses to start without credentials.
- **Frontend Testing**: Vitest with `@testing-library/react` (`npm run test` inside `/frontend`).
- **Database Migrations**: Changes to schema **MUST** be implemented using Liquibase XML changelogs in `backend/src/main/resources/db/changelog/`. Do not rely on `hibernate.ddl-auto=update`.

## 📦 Project-Specific Conventions & Patterns
- **Security & Firebase**: 
  - Token-based JWT auth via `FirebaseAuthenticationFilter`. Context is accessed via `SecurityContextHolder.getContext().getAuthentication().getPrincipal()` yielding the Firebase User ID (String).
  - Explicit rate limiting is per endpoint using `Resilience4j` logic in `BracketController` manually with `RateLimiter.decorateSupplier()` or using custom `ReadRateLimiterInterceptor`.
- **Input Sanitization**: 
  - Cross-Site Scripting (XSS) is mitigated strictly on backend through the custom `Sanitizer.java` utility (powered by Jsoup). This must wrap all text input like bracket descriptions and titles.
- **Frontend State**:
  - Global `apiCache.ts` is implemented manually. To wipe session data on logouts, use `resetApiAuthState()` in `api.ts`.
  - Auth context is exposed globally; use the `AuthContext` to get the current Firebase user and identity.
- **Media Previews**: Check out `com.bracketbattle.model.Item` structure; `mediaUrl` validation requires specific proxy handling or SSRF protections when processing YouTube vs images.

Follow these patterns strictly to remain productive and maintain project coherence!

