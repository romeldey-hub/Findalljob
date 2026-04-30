-- Grant pro subscription and admin role to the seeded admin account
UPDATE profiles
SET
  subscription_status = 'pro',
  role                = 'admin'
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'romeldey@gmail.com'
);
