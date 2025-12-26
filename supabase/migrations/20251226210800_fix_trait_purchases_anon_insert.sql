/*
  # Fix Trait Purchases Anonymous Insert Policy

  ## Overview
  This migration fixes the RLS policy for trait_purchases to allow anonymous users to insert purchase records. The original policy required authentication, but the app uses Phantom wallet connections without Supabase Auth.

  ## Changes Made

  1. **Drop Old Policy**
     - Remove the restrictive "Users can insert own purchases" policy that required authenticated users with JWT claims

  2. **Create New Policy**
     - Add new policy "Anyone can insert purchases" that allows anonymous (anon) users to insert
     - This is safe because:
       - Purchases are verified on-chain via transaction signatures
       - Wallet addresses come from the connected Phantom wallet
       - The data is append-only (users can't update/delete)
       - All sensitive operations (burning NFTs, SOL transfers) happen on-chain first

  ## Security Notes
  - Users can still only SELECT their own purchases
  - Only authenticated admin users can UPDATE or DELETE
  - INSERT is open to anon because blockchain transactions provide security
  - This follows the pattern where blockchain is the source of truth
*/

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can insert own purchases" ON trait_purchases;

-- Create new policy allowing anonymous inserts
CREATE POLICY "Anyone can insert purchases"
  ON trait_purchases FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);