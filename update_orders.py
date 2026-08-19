import sys

with open('src/lib/orders.server.ts', 'r') as f:
    content = f.read()

# Add d1Batch to imports if needed
if 'd1Batch' not in content:
    content = content.replace('from "./db.server"', 'from "./db.server"') # Just checking
    if 'd1First, d1Run' in content:
        content = content.replace('d1First, d1Run', 'd1First, d1Run, d1Batch')

# Look for the wallet payment section
old_payment = """  if (needsWalletPayment) {
    // 1. Deduct from wallet
    await d1Run(
      `UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND wallet_balance >= ?`,
      itemsTotal, user.id, itemsTotal
    );
    
    // 2. Record ledger transaction
    await d1Run(
      `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
       VALUES (?, ?, 'payment', ?, ?, ?, ?)`,
      randomId("wlt"), user.id, -itemsTotal, `شراء طلب ${code}`, orderId, now
    );
  }"""

# Since d1Batch might be more complex to insert accurately without breaking surrounding code,
# I will use a more robust replacement strategy.
# But for now, let's try to replace the whole block.

new_payment = """  const now = new Date().toISOString();
  const orderId = randomId("ord");
  const threadId = randomId("thr");
  const code = `BN-${Date.now().toString().slice(-6)}`;

  if (needsWalletPayment) {
    await d1Batch([
      {
        sql: `UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND wallet_balance >= ?`,
        params: [itemsTotal, user.id, itemsTotal]
      },
      {
        sql: `INSERT INTO wallet_transactions (id, user_id, kind, amount, description, order_id, created_at)
               VALUES (?, ?, 'payment', ?, ?, ?, ?)`,
        params: [randomId("wlt"), user.id, -itemsTotal, `شراء طلب ${code}`, orderId, now]
      }
    ]);
  }"""

# Check if the variables are defined before.
# I need to be careful with the context.

# Let's read the file again to find the exact lines.
