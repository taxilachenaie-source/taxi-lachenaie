"use client";


import { deleteReservation } from "./actions";


export default function DeleteButton({
id
}:{
id:string
}) {


async function handleDelete(){

const confirmation = confirm(
"Supprimer cette réservation ?"
);


if(!confirmation) return;


await deleteReservation(id);

}


return (

<button
onClick={handleDelete}
className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
>

Supprimer

</button>

)

}