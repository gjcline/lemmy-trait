/*
  # Fix Function Search Paths - Security Hardening
  
  ## Overview
  This migration adds search_path restrictions to database functions to prevent SQL injection attacks.
  
  ## Changes Made
  
  ### 1. get_available_stock() Function
  - Add `SET search_path = public, pg_temp` 
  - Prevents malicious search_path manipulation
  - No functional changes - pure security hardening
  
  ### 2. update_purchase_status() Function  
  - Add `SET search_path = public, pg_temp`
  - Prevents malicious search_path manipulation
  - No functional changes - pure security hardening
  
  ## Important Notes
  - These changes have ZERO impact on application functionality
  - Similar to reserve_trait_stock() which already has search_path protection
  - Does NOT modify any RLS policies (those are intentional design decisions)
  - Does NOT affect trait_purchases, transaction_logs, or swap_transactions tables
  - Shop functionality, swap functionality, and error logging remain unchanged
  
  ## Security Impact
  - Hardens functions against search_path-based SQL injection
  - Follows PostgreSQL security best practices
  - Aligns with existing security patterns in reserve_trait_stock()
*/

-- Update get_available_stock() to include search_path protection
CREATE OR REPLACE FUNCTION get_available_stock(trait_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  available integer;
BEGIN
  SELECT
    CASE
      WHEN stock_quantity IS NULL THEN 999999
      ELSE GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))
    END
  INTO available
  FROM shop_traits
  WHERE id = trait_uuid;

  RETURN COALESCE(available, 0);
END;
$$;

-- Update update_purchase_status() to include search_path protection
CREATE OR REPLACE FUNCTION update_purchase_status(
  purchase_uuid uuid,
  new_status text,
  new_step text,
  err_code text DEFAULT NULL,
  err_message text DEFAULT NULL,
  err_details jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE trait_purchases
  SET
    status = new_status,
    transaction_step = new_step,
    error_code = err_code,
    error_message = err_message,
    error_details = COALESCE(err_details, error_details),
    updated_at = now(),
    completed_at = CASE WHEN new_status = 'completed' THEN now() ELSE completed_at END
  WHERE id = purchase_uuid;

  -- Log the status change
  INSERT INTO transaction_logs (purchase_id, log_level, step, message, details)
  VALUES (
    purchase_uuid,
    CASE WHEN new_status = 'failed' THEN 'error' ELSE 'info' END,
    new_step,
    COALESCE(err_message, 'Status updated to ' || new_status),
    COALESCE(err_details, '{}'::jsonb)
  );
END;
$$;