document.getElementById("loginForm").addEventListener("submit", async (e)=>{
e.preventDefault()

const email = document.getElementById("email").value
const password = document.getElementById("password").value

const res = await fetch("/auth/login",{
method:"POST",
headers:{"Content-Type":"application/json"},
credentials:"include",
body:JSON.stringify({email,password})
})

const data = await res.text()

if(data === "success"){
window.location.href="/dashboard"
}else{
console.log(data);
}
})