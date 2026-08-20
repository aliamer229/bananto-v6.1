import fetch from "node-fetch";

async function run() {
  const req = await fetch("http://localhost:3000/api/admin/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "prd_test_123",
      title: "Test Game",
      price: 10,
    })
  });
  console.log(req.status);
  console.log(await req.text());
}
run();
