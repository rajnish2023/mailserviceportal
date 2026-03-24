const router = require("express").Router()
const dashboardCtrl = require("../controllers/dashboardController");
const templateCtrl = require("../controllers/templateController");
const analyticsCtrl = require("../controllers/analyticsController");
const projectCtrl    = require("../controllers/projectController");
const auth = require("../middleware/auth");

// AUTH PAGES
router.get("/", (req,res)=>{
res.render("auth/login",{layout:false})
})

router.get("/register",(req,res)=>{
res.render("auth/register",{layout:false})
})

router.get("/forgot",(req,res)=>{
res.render("auth/forgot",{layout:false})
})

router.get("/reset/:token",(req,res)=>{
res.render("auth/reset",{layout:false})
})


// DASHBOARD
router.get("/dashboard", auth,dashboardCtrl.getDashboard)
router.get("/templates", auth,dashboardCtrl.getTemplates)


//PROJECT
router.get(   "/projects",                   auth, projectCtrl.getProjects);          
router.get(   "/projects/list",              auth, projectCtrl.listProjects);          
router.get(   "/projects/:id",               auth, projectCtrl.getProjectDetail);       
router.get(   "/projects/:id/templates",     auth, projectCtrl.getProjectTemplates);    
router.post(  "/projects/create",            auth, projectCtrl.createProject);
router.put(   "/projects/update/:id",        auth, projectCtrl.updateProject);
router.delete("/projects/delete/:id",        auth, projectCtrl.deleteProject);
router.post(  "/projects/:id/resend/:logId", auth, projectCtrl.resendLog);

// TEMPLATE
router.get("/template/new",auth,templateCtrl.createNewTemplate);
router.post("/templates/create", auth, templateCtrl.createTemplate);
router.get("/template/edit/:id", auth, templateCtrl.editTemplate);
router.patch("/templates/toggle/:id", auth, templateCtrl.toggleTemplate);
router.put("/templates/update/:id", auth, templateCtrl.updateTemplate);
router.delete("/templates/delete/:id", auth, templateCtrl.deleteTemplate);
router.post("/templates/send/:id",  templateCtrl.sendTemplate);
router.post("/templates/zoho-test/:id", auth, templateCtrl.testZohoConnection);   
router.get( "/templates/zoho-settings/:id", auth, templateCtrl.getZohoSettings);      
router.put( "/templates/zoho-settings/:id", auth, templateCtrl.saveZohoSettings);   
router.post("/api/form/:apiKey", templateCtrl.handleFormSubmit);


// ANALYTICS
router.get('/analytics', auth, analyticsCtrl.getAnalytics);
router.get('/analytics/stats', auth, analyticsCtrl.getQuickStats);
router.get('/analytics/log/:id/json', auth, analyticsCtrl.getLogDetailJson);
router.delete('/analytics/log/:id', auth, analyticsCtrl.deleteLog);






module.exports = router