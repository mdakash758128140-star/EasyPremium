import { orders } from "./create-order";

export default function handler(req,res){

res.json({
total:orders.length,
orders:orders
});

}
