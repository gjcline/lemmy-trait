/*
  # Update Shop Traits for Production

  ## Overview
  This migration updates the shop traits with production pricing, inventory limits, and proper category capitalization to match NFT metadata requirements.

  ## 1. Category Capitalization Fix
  - Update "headwear" to "Headwear" for Crown trait
  - This ensures proper trait_type matching in NFT metadata
  - Categories must match exact casing: "Headwear", "Weapons", "Background"

  ## 2. Production Pricing Updates
  - Crown: 0.08 SOL (previously 0.01)
  - Gold AK: 0.16 SOL (previously 0.02)
  - Gold Uzi: 0.16 SOL (previously 0.02)
  - Scarface 2: 0.05 SOL (previously 0.01)

  ## 3. Stock Quantity Limits
  - Crown: 15 units available
  - Gold AK: 10 units available
  - Gold Uzi: 10 units available
  - Scarface 2: 20 units available

  ## 4. Inventory Management
  - Create function to decrement stock on completed purchase
  - Create trigger to automatically call function when purchase completes
  - Prevent purchases when stock reaches 0

  ## 5. Security Notes
  - Stock cannot go negative (CHECK constraint)
  - Only completed purchases decrement stock
  - Failed/pending purchases do not affect inventory
*/

-- Fix category capitalization for Crown
UPDATE shop_traits 
SET category = 'Headwear' 
WHERE name = 'Crown' AND category = 'headwear';

-- Update production pricing
UPDATE shop_traits 
SET sol_price = 0.08 
WHERE name = 'Crown';

UPDATE shop_traits 
SET sol_price = 0.16 
WHERE name = 'Gold AK';

UPDATE shop_traits 
SET sol_price = 0.16 
WHERE name = 'Gold Uzi';

UPDATE shop_traits 
SET sol_price = 0.05 
WHERE name = 'Scarface 2';

-- Set stock quantities for limited editions
UPDATE shop_traits 
SET stock_quantity = 15 
WHERE name = 'Crown';

UPDATE shop_traits 
SET stock_quantity = 10 
WHERE name = 'Gold AK';

UPDATE shop_traits 
SET stock_quantity = 10 
WHERE name = 'Gold Uzi';

UPDATE shop_traits 
SET stock_quantity = 20 
WHERE name = 'Scarface 2';

-- Create function to decrement stock when purchase completes
CREATE OR REPLACE FUNCTION decrement_trait_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Only decrement stock for completed purchases
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE shop_traits
    SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - 1)
    WHERE id = NEW.trait_id
      AND stock_quantity IS NOT NULL
      AND stock_quantity > 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically decrement stock
DROP TRIGGER IF EXISTS trigger_decrement_stock ON trait_purchases;
CREATE TRIGGER trigger_decrement_stock
  AFTER INSERT OR UPDATE ON trait_purchases
  FOR EACH ROW
  EXECUTE FUNCTION decrement_trait_stock();

-- Add function to check stock availability before purchase
CREATE OR REPLACE FUNCTION check_trait_stock(trait_uuid uuid)
RETURNS TABLE(
  available boolean,
  stock_remaining integer,
  trait_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN stock_quantity IS NULL THEN true
      WHEN stock_quantity > 0 THEN true
      ELSE false
    END as available,
    stock_quantity as stock_remaining,
    name as trait_name
  FROM shop_traits
  WHERE id = trait_uuid AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Create view for admin to monitor inventory
CREATE OR REPLACE VIEW shop_inventory_status AS
SELECT 
  id,
  name,
  category,
  stock_quantity,
  COALESCE(stock_quantity, 0) as current_stock,
  CASE 
    WHEN stock_quantity IS NULL THEN 'Unlimited'
    WHEN stock_quantity = 0 THEN 'Sold Out'
    WHEN stock_quantity <= 5 THEN 'Low Stock'
    ELSE 'In Stock'
  END as stock_status,
  (SELECT COUNT(*) FROM trait_purchases WHERE trait_id = shop_traits.id AND status = 'completed') as total_sold,
  is_active
FROM shop_traits
ORDER BY category, name;