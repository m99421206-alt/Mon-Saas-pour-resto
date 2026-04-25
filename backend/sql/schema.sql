-- AfricaMenu — schéma initial (MySQL 8+ / InnoDB, utf8mb4)
-- Prérequis : base créée (ex. CREATE DATABASE africamenu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;)
-- Le nom doit correspondre à DB_NAME dans .env

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `restaurants` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `whatsapp` VARCHAR(32) NULL,
  `logo_url` VARCHAR(512) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_restaurants_user_id` (`user_id`),
  CONSTRAINT `fk_restaurants_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categories` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `restaurant_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_categories_restaurant_id` (`restaurant_id`),
  CONSTRAINT `fk_categories_restaurant`
    FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `restaurant_id` INT UNSIGNED NOT NULL,
  `category_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `image` VARCHAR(512) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_products_restaurant_id` (`restaurant_id`),
  KEY `idx_products_category_id` (`category_id`),
  CONSTRAINT `fk_products_restaurant`
    FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_products_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
