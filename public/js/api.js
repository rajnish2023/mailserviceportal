async function post(url,data){
return fetch(url,{
method:"POST",
headers:{"Content-Type":"application/json"},
credentials:"include",
body:JSON.stringify(data)
}).then(res=>res.json())
}