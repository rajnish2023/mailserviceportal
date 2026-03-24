function showError(input,msg){
let e = document.createElement("div")
e.className="text-danger"
e.innerText=msg
input.parentNode.appendChild(e)
}

function clearError(input){
const err = input.parentNode.querySelector(".text-danger")
if(err) err.remove()
}