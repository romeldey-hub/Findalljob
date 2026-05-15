-- Add Razorpay payment columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS razorpay_payment_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS razorpay_order_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS razorpay_customer_id text;

-- Create index for payment lookup
CREATE INDEX IF NOT EXISTS idx_profiles_razorpay_payment ON profiles(razorpay_payment_id);
CREATE INDEX IF NOT EXISTS idx_profiles_razorpay_order ON profiles(razorpay_order_id);
