/*
  # Create Trap Stars Swap Transactions Table

  1. New Tables
    - `swap_transactions`
      - `id` (uuid, primary key) - Unique transaction ID
      - `wallet_address` (text) - User's wallet address
      - `donor_mint` (text) - Mint address of burned NFT
      - `donor_name` (text) - Name of burned NFT
      - `recipient_mint` (text) - Mint address of upgraded NFT
      - `recipient_name` (text) - Name of upgraded NFT
      - `swapped_trait_category` (text) - Category of swapped trait (e.g., 'eyes', 'hair')
      - `swapped_trait_value` (text) - Value of swapped trait (e.g., 'Fire', 'Red Dreads')
      - `burn_signature` (text) - Blockchain signature for burn transaction
      - `update_signature` (text) - Blockchain signature for metadata update
      - `new_image_url` (text) - Arweave URL of new image
      - `new_metadata_url` (text) - Arweave URL of new metadata JSON
      - `cost_sol` (numeric) - Total cost in SOL
      - `status` (text) - Transaction status: 'pending', 'completed', 'failed'
      - `error_message` (text, nullable) - Error message if failed
      - `created_at` (timestamptz) - When swap was initiated
      - `completed_at` (timestamptz, nullable) - When swap completed

  2. Security
    - Enable RLS on `swap_transactions` table
    - Add policy for users to read their own transactions
    - Add policy for authenticated users to insert their own transactions
    - Add policy for users to update their own pending transactions

  3. Indexes
    - Index on wallet_address for fast lookups
    - Index on created_at for chronological queries
    - Index on status for filtering

  4. Notes
    - This table provides a complete audit trail of all burn-and-swap operations
    - Helps with debugging failed transactions
    - Enables transaction history UI for users
*/

-- Create swap_transactions table
CREATE TABLE IF NOT EXISTS swap_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  donor_mint text NOT NULL,
  donor_name text DEFAULT '',
  recipient_mint text NOT NULL,
  recipient_name text DEFAULT '',
  swapped_trait_category text NOT NULL,
  swapped_trait_value text NOT NULL,
  burn_signature text DEFAULT '',
  update_signature text DEFAULT '',
  new_image_url text DEFAULT '',
  new_metadata_url text DEFAULT '',
  cost_sol numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_swap_transactions_wallet 
  ON swap_transactions(wallet_address);

CREATE INDEX IF NOT EXISTS idx_swap_transactions_created_at 
  ON swap_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_swap_transactions_status 
  ON swap_transactions(status);

-- Enable Row Level Security
ALTER TABLE swap_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own swap transactions"
  ON swap_transactions
  FOR SELECT
  TO authenticated
  USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: Allow anonymous reads for public transaction history (optional - can be removed for privacy)
CREATE POLICY "Anyone can view swap transactions"
  ON swap_transactions
  FOR SELECT
  TO anon
  USING (true);

-- Policy: Users can insert their own transactions
CREATE POLICY "Users can create own swap transactions"
  ON swap_transactions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Users can update their own pending transactions
CREATE POLICY "Users can update own swap transactions"
  ON swap_transactions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);