/*
  # Comprehensive Transaction Tracking and Stock Management

  ## Overview
  This migration implements robust transaction tracking, atomic stock reservations, and detailed error logging to prevent inventory errors and provide complete visibility into purchase failures.

  ## 1. New Columns Added to trait_purchases

  ### Transaction Lifecycle Tracking
  - `transaction_step` (text) - Current step: 'validation', 'payment', 'burn', 'metadata', 'recording', 'completed'
  - `error_code` (text) - Categorized error codes: STOCK_DEPLETED, PAYMENT_FAILED, METADATA_FAILED, etc.
  - `retry_count` (integer) - Number of automatic retry attempts made
  - `reserved_at` (timestamptz) - When stock was reserved for this purchase
  - `payment_started_at` (timestamptz) - When payment processing began
  - `completed_at` (timestamptz) - When transaction fully completed
  - `error_details` (jsonb) - Full error context including stack traces and parameters

  ### Stock Reservation Support
  - Reserved stock is held for 10 minutes during checkout
  - Automatic cleanup releases expired reservations
  - Prevents race conditions on limited inventory items

  ## 2. New Columns Added to shop_traits

  ### Stock Reservation Tracking
  - `reserved_quantity` (integer) - Number of items currently reserved in active checkouts
  - Actual available stock = stock_quantity - reserved_quantity
  - Prevents overselling during concurrent checkouts

  ## 3. New Table: transaction_logs

  ### Granular Step-by-Step Logging
  - `id` (uuid) - Unique log entry ID
  - `purchase_id` (uuid) - Reference to trait_purchases record
  - `log_level` (text) - info, warning, error
  - `step` (text) - Which step generated this log
  - `message` (text) - Log message
  - `details` (jsonb) - Additional context (wallet address, amounts, etc.)
  - `created_at` (timestamptz) - When log was created

  ## 4. Database Functions

  ### reserve_trait_stock(trait_uuid, wallet_addr)
  - Atomically checks and reserves stock with row-level locking
  - Creates purchase record in 'pending' status
  - Returns purchase_id or error
  - Prevents race conditions on last item

  ### release_expired_reservations()
  - Finds reservations older than 10 minutes
  - Returns reserved stock to available pool
  - Updates purchase status to 'failed' with timeout error
  - Should be called periodically (every minute)

  ### get_available_stock(trait_uuid)
  - Returns actual available quantity (stock_quantity - reserved_quantity)
  - Accounts for active reservations

  ## 5. Security
  - RLS enabled on transaction_logs table
  - Public can insert logs (for client-side error tracking)
  - Admin can view all logs
  - Reservation functions use SECURITY DEFINER for atomic operations

  ## 6. Indexes
  - Index on transaction_step for filtering
  - Index on error_code for categorization
  - Index on reserved_at for cleanup queries
  - Index on purchase_id in transaction_logs for fast lookups

  ## 7. Important Notes
  - All existing purchases are unaffected (new columns have defaults)
  - Stock reservations timeout after 10 minutes automatically
  - Error tracking captures full context for debugging
  - Admin dashboard will show all transaction states including failures
*/

-- Add new tracking columns to trait_purchases
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'transaction_step'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN transaction_step text DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'error_code'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN error_code text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN retry_count integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'reserved_at'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN reserved_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'payment_started_at'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN payment_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trait_purchases' AND column_name = 'error_details'
  ) THEN
    ALTER TABLE trait_purchases ADD COLUMN error_details jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add stock reservation tracking to shop_traits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shop_traits' AND column_name = 'reserved_quantity'
  ) THEN
    ALTER TABLE shop_traits ADD COLUMN reserved_quantity integer DEFAULT 0 CHECK (reserved_quantity >= 0);
  END IF;
END $$;

-- Create transaction_logs table for granular logging
CREATE TABLE IF NOT EXISTS transaction_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES trait_purchases(id) ON DELETE CASCADE,
  log_level text NOT NULL DEFAULT 'info' CHECK (log_level IN ('info', 'warning', 'error')),
  step text NOT NULL,
  message text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trait_purchases_transaction_step ON trait_purchases(transaction_step);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_error_code ON trait_purchases(error_code);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_reserved_at ON trait_purchases(reserved_at);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_payment_started ON trait_purchases(payment_started_at);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_purchase_id ON transaction_logs(purchase_id);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_created_at ON transaction_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transaction_logs_level ON transaction_logs(log_level);

-- Enable RLS on transaction_logs
ALTER TABLE transaction_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert logs (for client-side error tracking)
CREATE POLICY "Anyone can insert transaction logs"
  ON transaction_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated users to view all logs
CREATE POLICY "Authenticated users can view all logs"
  ON transaction_logs FOR SELECT
  TO authenticated
  USING (true);

-- Allow anon users to view logs
CREATE POLICY "Anon users can view logs"
  ON transaction_logs FOR SELECT
  TO anon
  USING (true);

-- Function to get actual available stock (accounting for reservations)
CREATE OR REPLACE FUNCTION get_available_stock(trait_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
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

-- Function to atomically reserve stock and create purchase record
CREATE OR REPLACE FUNCTION reserve_trait_stock(
  trait_uuid uuid,
  wallet_addr text,
  target_mint text,
  payment_type text,
  sol_amt numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purchase_uuid uuid;
  available_stock integer;
  trait_name_val text;
BEGIN
  -- Lock the trait row to prevent race conditions
  SELECT
    CASE
      WHEN stock_quantity IS NULL THEN 999999
      ELSE GREATEST(0, stock_quantity - COALESCE(reserved_quantity, 0))
    END,
    name
  INTO available_stock, trait_name_val
  FROM shop_traits
  WHERE id = trait_uuid AND is_active = true
  FOR UPDATE;

  -- Check if stock is available
  IF available_stock <= 0 THEN
    RAISE EXCEPTION 'STOCK_DEPLETED: % is currently out of stock', trait_name_val;
  END IF;

  -- Increment reserved quantity
  UPDATE shop_traits
  SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
  WHERE id = trait_uuid;

  -- Create purchase record with 'pending' status
  INSERT INTO trait_purchases (
    wallet_address,
    trait_id,
    payment_method,
    sol_amount,
    target_nft_mint,
    status,
    transaction_step,
    reserved_at
  ) VALUES (
    wallet_addr,
    trait_uuid,
    payment_type,
    sol_amt,
    target_mint,
    'pending',
    'validation',
    now()
  ) RETURNING id INTO purchase_uuid;

  -- Log the reservation
  INSERT INTO transaction_logs (purchase_id, log_level, step, message, details)
  VALUES (
    purchase_uuid,
    'info',
    'validation',
    'Stock reserved successfully',
    jsonb_build_object(
      'trait_id', trait_uuid,
      'trait_name', trait_name_val,
      'available_stock', available_stock,
      'wallet_address', wallet_addr
    )
  );

  RETURN purchase_uuid;
END;
$$;

-- Function to release expired reservations (call periodically)
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS TABLE(released_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_purchases uuid[];
  release_count integer;
BEGIN
  -- Find expired pending purchases (older than 10 minutes)
  SELECT array_agg(id)
  INTO expired_purchases
  FROM trait_purchases
  WHERE status = 'pending'
    AND reserved_at IS NOT NULL
    AND reserved_at < now() - interval '10 minutes';

  -- If no expired purchases, return 0
  IF expired_purchases IS NULL THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  release_count := array_length(expired_purchases, 1);

  -- Update each trait's reserved quantity
  UPDATE shop_traits
  SET reserved_quantity = GREATEST(0, reserved_quantity - subq.count)
  FROM (
    SELECT trait_id, COUNT(*) as count
    FROM trait_purchases
    WHERE id = ANY(expired_purchases)
    GROUP BY trait_id
  ) subq
  WHERE shop_traits.id = subq.trait_id;

  -- Mark purchases as failed with timeout error
  UPDATE trait_purchases
  SET
    status = 'failed',
    transaction_step = 'timeout',
    error_code = 'RESERVATION_TIMEOUT',
    error_message = 'Purchase reservation expired after 10 minutes',
    updated_at = now()
  WHERE id = ANY(expired_purchases);

  -- Log the releases
  INSERT INTO transaction_logs (purchase_id, log_level, step, message, details)
  SELECT
    id,
    'warning',
    'timeout',
    'Reservation expired and stock released',
    jsonb_build_object('expired_at', now())
  FROM trait_purchases
  WHERE id = ANY(expired_purchases);

  RETURN QUERY SELECT release_count;
END;
$$;

-- Function to update purchase status with logging
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

-- Update the stock decrement function to handle reservations
DROP FUNCTION IF EXISTS decrement_trait_stock() CASCADE;

CREATE OR REPLACE FUNCTION decrement_trait_stock()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only decrement stock when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE shop_traits
    SET
      stock_quantity = GREATEST(0, stock_quantity - 1),
      reserved_quantity = GREATEST(0, reserved_quantity - 1)
    WHERE id = NEW.trait_id
    AND stock_quantity > 0;

  -- Release reservation if purchase failed
  ELSIF NEW.status = 'failed' AND OLD.status = 'pending' AND OLD.reserved_at IS NOT NULL THEN
    UPDATE shop_traits
    SET reserved_quantity = GREATEST(0, reserved_quantity - 1)
    WHERE id = NEW.trait_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER trigger_decrement_stock
  AFTER INSERT OR UPDATE ON trait_purchases
  FOR EACH ROW
  EXECUTE FUNCTION decrement_trait_stock();

-- Create a view for admin to monitor transactions with full context
CREATE OR REPLACE VIEW admin_transaction_overview AS
SELECT
  tp.id,
  tp.wallet_address,
  tp.status,
  tp.transaction_step,
  tp.error_code,
  tp.error_message,
  tp.payment_method,
  tp.sol_amount,
  tp.retry_count,
  tp.created_at,
  tp.reserved_at,
  tp.payment_started_at,
  tp.completed_at,
  tp.updated_at,
  st.name as trait_name,
  st.category as trait_category,
  st.stock_quantity,
  st.reserved_quantity,
  (tp.updated_at - tp.created_at) as total_duration,
  CASE
    WHEN tp.status = 'pending' AND tp.reserved_at < now() - interval '10 minutes' THEN 'EXPIRED'
    WHEN tp.status = 'pending' AND tp.reserved_at IS NOT NULL THEN 'ACTIVE_RESERVATION'
    WHEN tp.status = 'completed' THEN 'SUCCESS'
    WHEN tp.status = 'failed' THEN 'FAILED'
    ELSE 'UNKNOWN'
  END as transaction_state
FROM trait_purchases tp
LEFT JOIN shop_traits st ON tp.trait_id = st.id
ORDER BY tp.created_at DESC;
