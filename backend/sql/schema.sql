-- AfricaMenu — schéma initial (MySQL 8+ / InnoDB, utf8mb4)
-- Prérequis : base créée (ex. CREATE DATABASE AfricaMenu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;)
-- Le nom doit correspondre à DB_NAME dans .env

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `full_name` VARCHAR(160) NULL,
  `phone` VARCHAR(32) NULL COMMENT 'Téléphone principal (souvent le même que restaurant.whatsapp à l’inscription)',
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `account_status` VARCHAR(20) NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_account_status` (`account_status`),
  KEY `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `restaurants` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(180) NULL,
  -- Champ technique `city` = quartier / zone du restaurant (même valeur que `restaurant.city` ou `restaurant.quartier` dans l’API).
  `city` VARCHAR(120) NULL COMMENT 'Quartier ou zone géographique du restaurant',
  `country` VARCHAR(100) NULL,
  `subscription_status` VARCHAR(20) NOT NULL DEFAULT 'trial',
  `subscription_started_at` TIMESTAMP NULL DEFAULT NULL,
  `subscription_ends_at` TIMESTAMP NULL DEFAULT NULL,
  `subscription_amount_cfa` DECIMAL(12, 0) NOT NULL DEFAULT 0,
  `subscription_plan_key` VARCHAR(48) NULL DEFAULT NULL,
  `menu_suspended` TINYINT(1) NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `whatsapp` VARCHAR(32) NULL,
  `logo_url` VARCHAR(512) NULL,
  `banner_url` VARCHAR(512) NULL,
  `theme_color` VARCHAR(16) NOT NULL DEFAULT '#FF7A00',
  `onboarding_seen` TINYINT(1) NOT NULL DEFAULT 0,
  `needs_setup_help` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_restaurants_slug` (`slug`),
  KEY `idx_restaurants_user_id` (`user_id`),
  KEY `idx_restaurants_subscription` (`subscription_status`),
  KEY `idx_restaurants_subscription_ends_at` (`subscription_ends_at`),
  KEY `idx_restaurants_sub_status_ends` (`subscription_status`, `subscription_ends_at`),
  KEY `idx_restaurants_menu_suspended` (`menu_suspended`),
  KEY `idx_restaurants_created_at` (`created_at`),
  KEY `idx_restaurants_needs_setup_help` (`needs_setup_help`),
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
  `description` TEXT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `image` VARCHAR(512) NULL,
  `has_sizes` TINYINT(1) NOT NULL DEFAULT 1,
  `is_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_products_restaurant_id` (`restaurant_id`),
  KEY `idx_products_category_id` (`category_id`),
  KEY `idx_products_public_menu` (`restaurant_id`, `is_visible`, `category_id`, `id`),
  KEY `idx_products_created_at` (`created_at`),
  CONSTRAINT `fk_products_restaurant`
    FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_products_category`
    FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_variants` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `image` VARCHAR(512) NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_product_variants_product_id` (`product_id`),
  KEY `idx_product_variants_menu_order` (`product_id`, `sort_order`, `id`),
  CONSTRAINT `fk_product_variants_product`
    FOREIGN KEY (`product_id`) REFERENCES `products` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NULL,
  `restaurant_id` INT UNSIGNED NULL,
  `action` VARCHAR(96) NOT NULL,
  `detail` VARCHAR(2048) NULL,
  `impersonation` TINYINT(1) NOT NULL DEFAULT 0,
  `subject_user_id` INT UNSIGNED NULL,
  `actor_type` VARCHAR(16) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_created_at` (`created_at`),
  KEY `idx_audit_logs_user_id` (`user_id`),
  KEY `idx_audit_logs_restaurant_id` (`restaurant_id`),
  KEY `idx_audit_logs_restaurant_created` (`restaurant_id`, `created_at`),
  KEY `idx_audit_logs_action_created` (`action`, `created_at`),
  KEY `idx_audit_logs_impersonation` (`impersonation`, `created_at`),
  CONSTRAINT `fk_audit_logs_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_restaurant`
    FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_logs_subject_user`
    FOREIGN KEY (`subject_user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(48) NOT NULL,
  `restaurant_id` INT UNSIGNED NULL,
  `user_id` INT UNSIGNED NULL,
  `restaurant_name` VARCHAR(160) NOT NULL DEFAULT '',
  `phone` VARCHAR(32) NULL,
  `detail` VARCHAR(2048) NULL,
  `link_url` VARCHAR(255) NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_admin_notif_created` (`created_at`),
  KEY `idx_admin_notif_read_created` (`is_read`, `created_at`),
  KEY `idx_admin_notif_type` (`type`),
  KEY `idx_admin_notif_dedupe` (`type`, `restaurant_id`, `is_read`, `id`),
  CONSTRAINT `fk_admin_notif_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_admin_notif_restaurant`
    FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `upload_files` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `restaurant_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NULL,
  `filename` VARCHAR(255) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_upload_files_filename` (`filename`),
  KEY `idx_upload_files_restaurant_id` (`restaurant_id`),
  KEY `idx_upload_files_user_id` (`user_id`),
  CONSTRAINT `fk_upload_files_restaurant`
    FOREIGN KEY (`restaurant_id`) REFERENCES `restaurants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_upload_files_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `platform_settings` (
  `setting_key` VARCHAR(64) NOT NULL,
  `setting_value` LONGTEXT NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

