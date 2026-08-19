-- Paid listing promotion: pin a listing to the top of the market for N minutes.
ALTER TABLE banana_listings ADD COLUMN promoted_until TEXT;
