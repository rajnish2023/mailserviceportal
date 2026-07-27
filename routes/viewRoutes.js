const router = require("express").Router()
const dashboardCtrl = require("../controllers/dashboardController");
const templateCtrl = require("../controllers/templateController");
const analyticsCtrl = require("../controllers/analyticsController");
const projectCtrl    = require("../controllers/projectController");
const userCtrl = require("../controllers/userController");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

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

// USER & TEMPLATE MANAGEMENT (ADMIN ONLY)
router.get("/admin/users", auth, admin, userCtrl.getUsersPage);
router.post("/admin/users", auth, admin, userCtrl.createUser);
router.put("/admin/users/:id", auth, admin, userCtrl.updateUser);
router.delete("/admin/users/:id", auth, admin, userCtrl.deleteUser);
router.post("/admin/templates/transfer", auth, admin, userCtrl.transferTemplate);
router.post("/admin/projects/transfer", auth, admin, userCtrl.transferProject);

// Helper route to promote active user to Admin (safe for development bootstrap)
router.get("/make-me-admin", auth, async (req, res) => {
  try {
    const User = require("../models/User");
    await User.findByIdAndUpdate(req.user._id || req.user.id, { role: "admin" });
    res.send("<h1>You are now an Admin!</h1><p>Please <a href='/dashboard'>go back to Dashboard</a> and refresh.</p>");
  } catch (err) {
    res.status(500).send("Error: " + err.message);
  }
});


// ANALYTICS
router.get('/analytics', auth, analyticsCtrl.getAnalytics);
router.get('/analytics/stats', auth, analyticsCtrl.getQuickStats);
router.get('/analytics/log/:id/json', auth, analyticsCtrl.getLogDetailJson);
router.delete('/analytics/log/:id', auth, analyticsCtrl.deleteLog);






module.exports = router