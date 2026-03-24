const router = require("express").Router()
const authCtrl = require("../controllers/authController")
const auth = require("../middleware/auth");


router.post('/register', authCtrl.register)
router.post('/login',           authCtrl.login);            
router.post('/logout',          authCtrl.logout);          
router.get( '/me',              authCtrl.me);             
router.post('/forgot-password', authCtrl.forgotPassword);   
router.post('/reset-password',  authCtrl.resetPassword); 

router.get( "/profile",                auth,  authCtrl.getProfile);
router.post("/update",          auth, authCtrl.updateProfile);
router.post("/change-password", auth, authCtrl.changePassword);   

module.exports = router