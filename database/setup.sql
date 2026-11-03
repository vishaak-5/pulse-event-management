-- Run once as the MySQL root user (e.g. in MySQL Workbench).
-- Creates the database and the application's own login.
-- Tables are created automatically by the backend on first start.
--
-- Replace CHANGE_ME with a password of your own, and put the same value in
-- backend/config/application.properties (copy backend/config.example.properties).

CREATE DATABASE IF NOT EXISTS event_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'eventapp'@'localhost' IDENTIFIED BY 'CHANGE_ME';
GRANT ALL PRIVILEGES ON event_system.* TO 'eventapp'@'localhost';
FLUSH PRIVILEGES;
