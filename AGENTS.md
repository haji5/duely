# AI Agent Guidelines for Duely Codebase

Welcome! This document provides essential knowledge for AI agents working on the Duely project. By following these conventions, you ensure your implementations match the existing architecture and align with the project's unique practices.

## 🏗️ System Architecture & Big Picture
- **Stack**: React 19 (TypeScript, Vite 7, Tailwind CSS 4) + Spring Boot 4.1 (Java 21, Jackson 3, Hibernate 7). Postgres 15 and Valkey 8.
- **Core Entity Flow**: `Bracket` has many `Item`s and `Result`s. Controllers return entities or small aggregation DTOs (`ItemRankingDto`, `CommentDto`); request bodies are records with Bean Validation (no MapStruct or big DTO layers). Fields that must not be public (`Bracket.createdBy`, `Result.userId`, `submissionToken`) carry `@JsonIgnore`, which the Valkey cache also honours, so ownership checks must read the repository, never the cache.
- **Network Proxying (CRITICAL PITFALL)**:
  - In Docker, `nginx` serves on port 3000 and maps `/api/*` to `http://backend:8080/*` (stripping the `/api` prefix). nginx does not proxy `/api/actuator/`.
  - The backend controllers (like `BracketController`) have **no prefix** mapped (`@GetMapping("/brackets")`, NOT `/api/brackets`).
  - Locally, the Vite dev server mirrors this: `/api/*` is proxied to `http://localhost:8080` with the prefix stripped, and `VITE_API_URL` defaults to `/api`.
  - nginx forwards the browser's scheme and port (`X-Forwarded-Proto/Port`, https/443 behind the Cloudflare tunnel) so Spring treats tunnel requests as same-origin. Only the tunnel container's fixed address (172.29.53.250) may set `X-Forwarded-For`.
- **Rankings**: the leaderboard is the `item_stats` table, updated by `ItemStatsRepository.applyRun` in the same transaction as each result. Score = normalised finishing position `(n-1-i)/(n-1)`; wins/matches come from the real matches the client submits. `frontend/src/utils/rankings.ts` mirrors the formula; keep them in sync.
- **Caching (`Valkey`)**: Spring `@Cacheable`/`@CacheEvict` backed by Valkey with absolute TTLs (`CacheConfig.CACHES`). Every write must evict exactly the keys it changes. Unknown cache names fail fast. If the cached JSON shape changes, bump `KEY_PREFIX` in `CacheConfig`. Browsers never cache API responses (Spring Security's default `no-store`).
- **Rate limiting**: `ratelimit/RateLimiter` keeps fixed-window counters in Valkey (`app.rate-limit.buckets.*`). Call `rateLimiter.tryAcquire(bucket, subject)` in controllers; GETs are limited by `ReadRateLimitInterceptor`. It fails open when Valkey is unreachable.

## 🧑‍💻 Developer Workflows
- **Backend Testing**: `mvn verify` inside `/backend` (no Maven wrapper; Docker must be running). Unit tests are `*Test` (surefire), integration tests are `*IT` (failsafe) and extend `support/IntegrationTest`, which starts Postgres and Valkey in Testcontainers (`@ServiceConnection`), mocks Firebase with `@MockitoBean FirebaseAuth` (fake tokens `USER_A`, `USER_B`, `USER_C`, `ADMIN`) and replaces DNS with `FakeDnsConfig`. Any other Spring context test must mock `FirebaseAuth` too, since `FirebaseConfig` refuses to start without credentials.
- **Frontend Testing**: Vitest with `@testing-library/react`: `npm run typecheck && npm test` inside `/frontend`. Pure logic (tournament, rankings, media URLs) lives in `src/utils` with unit tests next to it.
- **Database Migrations**: Changes to schema **MUST** be implemented using Liquibase XML changelogs in `backend/src/main/resources/db/changelog/`. Do not rely on `hibernate.ddl-auto=update`.
- **Dependencies**: `frontend/package.json` overrides `@grpc/grpc-js` because Firebase still pins a vulnerable version (Firestore isn't used). Keep `npm audit --omit=dev` clean; CI runs it.

## 📦 Project-Specific Conventions & Patterns
- **Security & Firebase**:
  - Token-based auth via `FirebaseAuthenticationFilter` (built in `SecurityConfig`, not a `@Component`). Get the caller with `CurrentUser.uidOrNull(authentication)`: the Firebase uid, or null for guests. An invalid token degrades to anonymous.
  - There is no CSRF layer, deliberately: the bearer token travels in the `Authorization` header, which browsers never attach cross-site. Don't add cookie-based auth without revisiting this.
  - Errors go through `GlobalExceptionHandler`: throw `ResponseStatusException` (404/403/409), `InvalidRequestException` (400 with a field `errors` map) or `RateLimitExceededException` (429 with `Retry-After`).
- **Input Sanitization**:
  - All user text (names, descriptions, titles, comments) goes through `Sanitizer.stripToPlain`, which strips markup and stores **plain, decoded text** (`&lt;b&gt;` becomes `<b>`).
  - Therefore the frontend must always render user content as text. **Never use `dangerouslySetInnerHTML` (or any HTML sink) for user content.**
- **Media URLs**: `media/MediaUrlValidator` checks every stored URL: https only, public hosts (resolved once per host per request), and per type: `video` must be a YouTube link with an extractable id, `song` is Spotify (no `spotify.link`) or an audio URL, `image` any public https URL. `frontend/src/utils/mediaUtils.ts` mirrors these rules.
- **Frontend State**:
  - `apiCache.ts` is a small TTL cache. Per-user keys include the uid. To wipe it on sign-in changes, use `resetApiAuthState()` in `api.ts` (AuthContext already does).
  - Use `useAuth().currentUser` for the signed-in user. Guests' own runs live in `SessionBattleContext` (sessionStorage).
  - Show distinct loading, error (with retry) and empty states; never render "not found" or "no brackets" for a failed request. Use `errorMessage()` from `api.ts` for the server's message.
  - Use `randomId()` (not `crypto.randomUUID`, which needs a secure context) for client ids and submission tokens.

Follow these patterns strictly to remain productive and maintain project coherence!
