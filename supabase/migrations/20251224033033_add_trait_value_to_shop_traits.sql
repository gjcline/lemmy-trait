/*
  # Add trait_value column to shop_traits table

  ## Overview
  This migration adds a `trait_value` column to the `shop_traits` table to store the actual
  trait file names that match the layer system files. This separates display names from
  technical values needed for image generation.

  ## Changes

  1. **New Column**
     - `trait_value` (text) - Stores the actual trait file name that matches the layer system
     - This value is used for image generation and must match exactly with file names

  2. **Data Migration**
     - Update existing records with appropriate trait_values based on their names
     - Common mappings:
       - "Crown" -> "Crown" (Headwear)
       - "Gold AK" -> "Gold AK" (Weapons)
       - "Gold Uzi" -> "Gold Uzi" (Weapons)
       - "Scarface 2" -> "Scarface 2" (Background)

  3. **Constraints**
     - After initial migration, trait_value should not be null for new records
     - Existing records are updated with sensible defaults

  ## Notes
  - Display name (name column) is shown to users in the shop
  - Trait value (trait_value column) is used for image generation
  - This mirrors how the Burn and Swap feature handles traits from NFT metadata
*/

-- Add trait_value column (allow null initially for migration)
ALTER TABLE shop_traits 
ADD COLUMN IF NOT EXISTS trait_value text;

-- Update existing records with trait_value matching their name
-- This assumes the display name matches the file name (common case)
UPDATE shop_traits 
SET trait_value = name 
WHERE trait_value IS NULL;

-- Add NOT NULL constraint after populating existing records
ALTER TABLE shop_traits 
ALTER COLUMN trait_value SET NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shop_traits_trait_value ON shop_traits(trait_value);
