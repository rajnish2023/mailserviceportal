document.getElementById("forgotForm").addEventListener("submit", async e=>{
e.preventDefault()

const email = document.getElementById("email")

clearError(email)

if(!email.value) return showError(email,"Required")

const res = await API.post("/auth/forgot",{email:email.value})

alert(res)
})