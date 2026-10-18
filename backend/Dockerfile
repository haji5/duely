# Build stage
FROM maven:3.9.16-eclipse-temurin-21-alpine AS build

WORKDIR /app

# Resolve dependencies first so they are cached between source changes
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Tests need Docker (Testcontainers) and run in CI instead
COPY src ./src
RUN mvn -B clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:21-jre-alpine

WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Spring Boot's repackaged jar is the only *.jar in target/ (the original is *.jar.original)
COPY --from=build /app/target/*.jar app.jar
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

# Heap is a share of the container's memory limit (mem_limit in docker-compose.yml).
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75.0 -XX:+UseStringDeduplication"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
