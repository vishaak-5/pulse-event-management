# Build: compile with the Maven wrapper on a full JDK.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B -DskipTests package && cp target/event-system-*.jar app.jar

# Run: small JRE image. Free hosts give ~512 MB, so cap the heap.
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/app.jar app.jar
ENV JAVA_TOOL_OPTIONS="-Xmx320m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
