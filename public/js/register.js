document.getElementById("registerForm").addEventListener("submit", async e=>{
e.preventDefault()

const name = document.getElementById("name")
const email = document.getElementById("email")
const password = document.getElementById("password")
const confirmPassword = document.getElementById("confirmPassword")

clearError(name)
clearError(email)

if(!name.value) return showError(name,"Required")
if(!email.value) return showError(email,"Required")
if(password.value!==confirmPassword.value) return showError(confirmPassword,"Not match")

const res = await post("/auth/register",{name:name.value,email:email.value,password:password.value})

if(res.includes("success")){
window.location="/"
}else alert(res)
})