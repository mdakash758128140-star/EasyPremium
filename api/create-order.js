let orders = [];

export default function handler(req, res) {

if (req.method !== "POST") {
return res.status(405).json({message:"Method not allowed"});
}

const {product,email,price} = req.body;

const order = {
id: "ORD-" + Date.now(),
product,
email,
price,
status:"pending"
};

orders.push(order);

res.status(200).json({
success:true,
order
});

}
