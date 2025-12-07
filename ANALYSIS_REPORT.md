# Codebase Analysis Report

## 1. Critical Performance Bottlenecks

### 1.1 In-Memory Ranking Calculation (Memory Explosion Risk)
**File:** `backend/src/main/java/com/bracketbattle/service/BracketService.java`

The method `calculateBracketRankings` loads **all** results for a bracket into memory and iterates through them to calculate scores.

```java
// BracketService.java
private List<ItemRankingDto> calculateBracketRankings(Long bracketId) {
    // 1. Fetches ALL results (could be thousands)
    List<Result> results = resultRepository.findByBracketIdOrderByCreatedAtDesc(bracketId);

    // ...

    // 2. Iterates in-memory
    for (Result result : results) {
        // ... deserializes JSON ranking for every result
    }
}
```
**Why it's bad:** Time complexity is O(N*M) (Results * Items). Memory usage is O(N). As the app scales, a popular bracket with 10,000 results will cause an `OutOfMemoryError` or massive CPU spikes, blocking the thread.
**Fix:** Move aggregation to the database using a native SQL query or a `RESULT_ITEMS` table to allow `GROUP BY` and `SUM` operations in PostgreSQL.

### 1.2 Inefficient JSON Storage & Deserialization
**File:** `backend/src/main/java/com/bracketbattle/model/Result.java`

Ranking data is stored as a JSON string and deserialized on every access.

```java
// Result.java
@Column(name = "ranking", nullable = false, columnDefinition = "TEXT")
private String rankingJson;

public List<Long> getRanking() {
    // Triggers JSON parsing EVERY time this getter is called
    return OBJECT_MAPPER.readValue(rankingJson, ...);
}
```
**Why it's bad:** JSON deserialization is CPU-intensive. Since `calculateBracketRankings` calls `getRanking()` for every result, this amplifies the CPU load significantly.
**Fix:** Use PostgreSQL's `jsonb` type (if using Hibernate 6+) for better performance, or normalize the data into a `result_items` table.

### 1.3 Missing Pagination
**Files:** `BracketRepository.java`, `BracketService.java`

Methods like `getAllBrackets` and `findPopularBrackets` fetch potentially unlimited rows.

```java
@Query("SELECT b FROM Bracket b LEFT JOIN b.results r GROUP BY b.id ORDER BY COUNT(r.id) DESC")
List<Bracket> findPopularBrackets();
```
**Why it's bad:** Loading the entire database table into a list will crash the application as data grows.
**Fix:** Implement `Pageable` in repositories and controllers (e.g., `Page<Bracket> findPopularBrackets(Pageable pageable)`).

## 2. Security Risks

### 2.1 Unsafe Inline Styles (CSP)
**File:** `backend/src/main/java/com/bracketbattle/security/SecurityConfig.java`

```java
.policyDirectives("... style-src 'self' 'unsafe-inline'; ...")
```
**Why it's bad:** Allowing `unsafe-inline` in the Content Security Policy (CSP) significantly weakens protection against Cross-Site Scripting (XSS) attacks. It allows attackers to inject malicious CSS or scripts via style attributes.
**Fix:** Use a nonce-based CSP or extract all inline styles to external CSS files (Tailwind usually handles this well in build steps).

### 2.2 Potential SSRF (Server-Side Request Forgery)
**File:** `backend/src/main/java/com/bracketbattle/service/BracketService.java`

While there is a manual check (`isPotentiallyDangerousUrl`), it relies on application-level DNS resolution which can be bypassed (e.g., DNS rebinding attacks).

```java
// BracketService.java
private boolean isPotentiallyDangerousUrl(String url) {
    // Manually checks IP ranges
    java.net.InetAddress addr = resolveHostWithTimeout(host, 2000);
    // ...
}
```
**Why it's bad:** Time-of-check vs. Time-of-use (TOCTOU) vulnerability. The IP resolved during the check might differ from the IP used by the HTTP client if the DNS record has a short TTL.
**Fix:** Configure the HTTP client itself to use a custom `SocketFactory` that validates IPs *after* connection establishment but *before* sending data, or use a dedicated proxy for outbound requests.

### 2.3 Redundant CSRF Complexity
**Files:** `SecurityConfig.java`, `CsrfTokenFilter.java`

The application disables standard CSRF but implements a custom `X-CSRF-Token` header check.

**Why it's bad:** If the application uses stateless JWTs (Bearer tokens), CSRF protection is generally unnecessary because browsers do not automatically attach auth headers. If it *does* rely on cookies (implied by `allowCredentials(true)`), the custom implementation might be less robust than Spring Security's built-in `CsrfFilter`.
**Fix:** If using only Bearer tokens, remove CSRF completely. If using Cookies, use Spring's standard `.csrf(...)`.

## 3. Code Quality & Maintainability

### 3.1 Frontend Logic Complexity
**File:** `frontend/src/pages/BracketPage.tsx`

The `BracketPage` component contains over 400 lines of complex tournament logic (`createTournament`, `seedBracket`, `findNextRealMatch`).

**Why it's bad:** Hard to read, maintain, and test. State logic is tightly coupled with UI rendering.
**Fix:** Extract the tournament logic into a custom hook (e.g., `useTournamentEngine`) or a pure TypeScript utility class.

### 3.2 Frontend N+1 Data Fetching
**File:** `frontend/src/pages/BracketPage.tsx`

```typescript
// BracketPage.tsx
const [bracket, items] = await Promise.all([
    bracketApi.getBracket(parseInt(id)),
    bracketApi.getBracketItems(parseInt(id)) // Fetches ALL items
]);
```
**Why it's bad:** For a bracket with 500 items, the frontend downloads all of them at once.
**Fix:** If items are large, implement pagination or lazy loading. For a "tournament" mode, this might be acceptable, but ensure the payload size is monitored.

### 3.3 Hardcoded Secrets in Logic
**File:** `backend/src/main/resources/application.properties`

While you use `${VAR:default}` placeholders, the default values (like `password` for DB) should be ensured to never be used in production.
**Fix:** Ensure production environment variables are strictly enforced and the application fails to start if strong secrets aren't provided.
