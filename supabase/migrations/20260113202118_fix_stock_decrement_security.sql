/*
  # Fix Stock Decrement Trigger Security

  1. Changes
    - Drop and recreate the `decrement_trait_stock()` function with `SECURITY DEFINER` attribute
    - This allows the trigger to update stock quantities even when purchases are made by anonymous users
    - Add indexes on `trait_purchases` for better query performance
  
  2. Security
    - Function runs with elevated privileges to update stock
    - RLS policies on `shop_traits` remain in effect for direct queries
    - Only the trigger can use this function to update stock
  
  3. Performance
    - Add index on `trait_purchases.status` for faster filtering
    - Add index on `trait_purchases.created_at` for better sorting
*/

-- Drop existing function and triggers with CASCADE
DROP FUNCTION IF EXISTS decrement_trait_stock() CASCADE;

-- Recreate function with SECURITY DEFINER to allow stock updates from anonymous purchases
CREATE OR REPLACE FUNCTION decrement_trait_stock()
RETURNS TRIGGER
SECURITY DEFINER -- This allows the function to bypass RLS and update stock
SET search_path = public
AS $$
BEGIN
  -- Only decrement stock when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE shop_traits
    SET stock_quantity = stock_quantity - 1
    WHERE id = NEW.trait_id
    AND stock_quantity > 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
CREATE TRIGGER trigger_decrement_stock
  AFTER INSERT OR UPDATE ON trait_purchases
  FOR EACH ROW
  EXECUTE FUNCTION decrement_trait_stock();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trait_purchases_status ON trait_purchases(status);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_created_at ON trait_purchases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_wallet ON trait_purchases(wallet_address);
