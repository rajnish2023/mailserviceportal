async function createProject(){
const name = document.getElementById("projectName").value
const domain = document.getElementById("domain").value

const res = await post("/api/project",{name,domain})

alert("Project Created",res)
}