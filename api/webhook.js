import { orders } from "./create-order";

export default function handler(req,res){

if(req.method !== "POST"){
return res.status(405).end();
}

const {orderId,status}=req.body;

const order = orders.find(o=>o.id===orderId);

if(!order){
return res.status(404).json({error:"Order not found"});
}

order.status=status;

res.json({success:true,order});

}
