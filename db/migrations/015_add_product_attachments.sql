-- Migration: 015_add_product_attachments.sql
-- Description: Adds image_url and pdf_url to products table for attaching images and brochures.

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pdf_url TEXT;
