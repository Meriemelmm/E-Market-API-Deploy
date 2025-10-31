const express = require("express");
const { strictLimiter } = require("../middlewares/rate-limiter");

const upload = require("../middlewares/uploadImages");
const {
  getProducts,
  getOneProduct,
  createProduct,
  editProduct,
  deleteProduct,
  deactivationProduct,
  activateProduct
} = require("../controllers/productController");
const validate = require("../middlewares/validate");
const {
  createProductSchema,
  updateProductSchema,
} = require("../validators/productValidation");


const { checkProductOwnership } = require("../middlewares/checkProductOwnership");

const router = express.Router();

router.get("/", getProducts);
router.get("/:id", getOneProduct);
const auth=require('../middlewares/auth');

router.post("/",auth, strictLimiter, upload.array("images", 5), validate(createProductSchema), createProduct);
router.put("/:id",auth, strictLimiter, checkProductOwnership, upload.array("images", 5), validate(updateProductSchema), editProduct);
router.post("/", auth,strictLimiter, upload.array("images", 5), validate(createProductSchema), createProduct);
router.put("/:id",auth, strictLimiter, checkProductOwnership, upload.array("images", 5), validate(updateProductSchema), editProduct);

router.delete("/:id",auth, checkProductOwnership, deleteProduct);
router.patch("/:id/activate", auth,checkProductOwnership, activateProduct);
router.patch("/:id/deactivate",auth, checkProductOwnership, deactivationProduct);

module.exports = router;