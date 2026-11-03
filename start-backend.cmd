@echo off
rem Starts the Spring Boot API on http://localhost:8080
if "%JAVA_HOME%"=="" set "JAVA_HOME=%USERPROFILE%\.jdks\jdk-21.0.12.1+1"
cd /d "%~dp0backend"
call mvnw.cmd spring-boot:run
