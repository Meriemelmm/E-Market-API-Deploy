const Products = require("../models/products");
const Category = require("../models/categories");
const NotificationEmitter = require('../events/notificationEmitter');
const ImageService = require('../services/ImageService');
// const { file } = require("bun");

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           description: The product's title
 *         description:
 *           type: string
 *           description: The product description
 *         price:
 *           type: number
 *           description: The product price
 *         stock:
 *           type: number
 *           description: The product stock
 *         category_id:
 *           type: string
 *           description: The product category id
 *         imageUrl:
 *           type: string
 *           description: The product image
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *       required:
 *         - title
 *         - description
 *         - price
 *         - stock
 *         - category_id
 */

// get all products

/**
 * @swagger
 * /products:
 *   get:
 *     summary: get all products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products got successfully
 *       500:
 *         description: Server error
 */

async function getProducts(req, res, next) {
  try {
    // Query params
    const {
      q, // keywords
      category, // single category id
      categories, // comma-separated category ids
      minPrice,
      maxPrice,
      dateFrom,
      dateTo,
      sort, // price, -price, date, -date, popularity, -popularity
      page = 1,
      limit = 12,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 100);
    const skip = (pageNum - 1) * limitNum;

    // Base filters: only active, non-deleted products for public listing
    const filter = { isActive: true, deletedAt: null };

    // Keyword search - use text index when available
    let useTextSearch = false;
    if (q && typeof q === 'string' && q.trim().length > 0) {
      filter.$text = { $search: q.trim() };
      useTextSearch = true;
    }

    // Categories filter (single or multiple)
    const catList = [];
    if (category) catList.push(category);
    if (categories) {
      const parts = Array.isArray(categories) ? categories : String(categories).split(',');
      parts.forEach((c) => c && catList.push(String(c).trim()))
    }
    if (catList.length > 0) {
      filter.categories = { $in: catList };
    }

    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // Date range
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    // Sorting
    const sortParam = Array.isArray(sort) ? sort[0] : sort; // use first if multiple
    const sortObj = {};
    let requiresAggregation = false;

    if (sortParam === 'price') sortObj.price = 1;
    else if (sortParam === '-price') sortObj.price = -1;
    else if (sortParam === 'date') sortObj.createdAt = 1;
    else if (sortParam === '-date') sortObj.createdAt = -1;
    else if (sortParam === 'popularity' || sortParam === '-popularity') {
      requiresAggregation = true; // popularity needs review counts
    } else if (useTextSearch) {
      // If text search and no explicit sort, sort by relevance first then newest
      sortObj.score = { $meta: 'textScore' };
      sortObj.createdAt = -1;
    } else {
      // Default sort: newest first
      sortObj.createdAt = -1;
    }

    // If sorting by popularity, use aggregation to compute reviewCount
    if (requiresAggregation) {
      const popularityDesc = sortParam !== 'popularity'; // true for '-popularity'

      const pipeline = [];

      // $match with filters (including $text when present)
      pipeline.push({ $match: filter });

      // If text search, add score and possibly order fallback
      if (useTextSearch) {
        pipeline.push({ $addFields: { score: { $meta: 'textScore' } } });
      }

      // Join reviews (collection name inferred from model 'View' -> 'views')
      pipeline.push(
        {
          $lookup: {
            from: 'views',
            localField: '_id',
            foreignField: 'productId',
            as: 'reviews'
          }
        },
        {
          $addFields: {
            reviewCount: { $size: '$reviews' },
            avgRating: { $cond: [{ $gt: [{ $size: '$reviews' }, 0] }, { $avg: '$reviews.rating' }, null] }
          }
        },
        { $project: { reviews: 0 } }
      );

      // Sort by popularity (reviewCount), then relevance (if any), then newest
      const popularitySort = popularityDesc ? -1 : 1;
      const sortStage = { $sort: { reviewCount: popularitySort, createdAt: -1 } };
      if (useTextSearch) {
        sortStage.$sort = { reviewCount: popularitySort, score: -1, createdAt: -1 };
      }
      pipeline.push(sortStage);

      // Facet for pagination and total count
      pipeline.push({
        $facet: {
          data: [{ $skip: skip }, { $limit: limitNum }],
          meta: [{ $count: 'total' }]
        }
      });

      const aggRes = await Products.aggregate(pipeline);
      const data = aggRes[0]?.data || [];
      const total = aggRes[0]?.meta?.[0]?.total || 0;
      const totalPages = Math.ceil(total / limitNum) || 1;

      return res.status(200).json({
        success: true,
        message: 'Products fetched successfully',
        data,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          sort: sortParam || (useTextSearch ? 'relevance,-date' : '-date'),
          filters: { q: q || null, categories: catList, minPrice: minPrice ? Number(minPrice) : null, maxPrice: maxPrice ? Number(maxPrice) : null }
        }
      });
    }

    // Simple find with sorting and pagination
    const query = Products.find(filter);
    if (useTextSearch) {
      query.select({ score: { $meta: 'textScore' } });
      
      sortObj.score = { $meta: 'textScore' };
    }
    const [data, total] = await Promise.all([
      query.sort(sortObj).skip(skip).limit(limitNum),
      Products.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;
    res.status(200).json({
      success: true,
      message: 'Products fetched successfully',
      data,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        sort: sortParam || (useTextSearch ? 'relevance,-date' : '-date'),
        filters: { q: q || null, categories: catList, minPrice: minPrice ? Number(minPrice) : null, maxPrice: maxPrice ? Number(maxPrice) : null }
      }
    });
  } catch (error) {
    next(error);
  }
}

// get a specific product
/**
 * @swagger
 * /products/{id}:
 *   get:
 *     summary: get one specific product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The product ID
 *     responses:
 *       200:
 *         description: product got successfully
 *       500:
 *         description: Server error
 */
async function getOneProduct(req, res, next) {
  try {
    const id = req.params.id;
    const product = await Products.findById(id);
    if (!product) {
      res.status(404).json({
        success: false,
        status: 404,
        message: "product not found",
        data: null,
      });
    }
    res.status(200).json({
      success: true,
      status: 200,
      message: "product ound succesfully",
      data: {
        product: product,
      }
    });
  } catch (error) {
    next(error);
  }
}

// create a product
/**
 * @swagger
 * /products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Product created successfully
 *       500:
 *         description: Server error
 */

async function createProduct(req, res, next) {
  try {
    const { title, description, price, stock, categories } = req.body;
    const seller = req.user._id;

    const existingProduct = await Products.findOne({ title });
    if (existingProduct) {
      return res.status(400).json({ message: "Product already exists" });
    }

    // process images with ImageService
    let images = [];
    if (req.files && req.files.length > 0) {
      const processedImages = await ImageService.processMultipleImages(req.files);
      images = processedImages.map(img => img.original.url);
    }

    const categoryExists = await Category.find({ _id: { $in: categories } });
    if (categoryExists.length !== categories.length) {
      return res.status(404).json({ message: "One or more categories not found" });
    }


    const product = await Products.create({
      title,
      description,
      price,
      stock,
      categories,
      seller,
      images, 
      isActive: true,
    });

    if (process.env.NODE_ENV !== "test") {
      NotificationEmitter.emit("NEW_PRODUCT", {
        recipient: product.seller,
        productId: product._id,
        productName: product.title,
      });
    }

    res.status(201).json({
      success: true,
      status: 200,
      message: "Product created successfully",
      data: { product },
    });
  } catch (error) {
    next(error);
  }
}

// Edit product
/**
 * @swagger
 * /products/{id}:
 *   put:
 *     summary: Update an existing product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               stock:
 *                 type: number
 *               category:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       400:
 *         description: Invalid input or category not found
 *       500:
 *         description: Server error
 */
async function editProduct(req, res, next) {
  try {
    const id = req.params.id;
    // const newImages = req.files?.map((file) => `/uploads/products/${file.filename}`) || [];

    const product = await Products.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
    
    let newImages = [];
    if (req.files && req.files.length > 0) {
      const processedImages = await ImageService.processMultipleImages(req.files);
      newImages = processedImages.map(img => img.original.url);
    }

    const updatedProduct = await Products.findByIdAndUpdate(
      id,
      {
        ...req.body,
        ...(newImages.length > 0 && { images: newImages }),
      },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      status: 200,
      message: "product Updated successfully ",
      data: {
        product: updatedProduct,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Delete product
/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     summary: Delete product
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user ID
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       500:
 *         description: Server error
 */

async function deleteProduct(req, res, next) {
  try {
    const deleteProduct = await Products.findByIdAndDelete(req.params.id);

    if (!deleteProduct) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "product not found",
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      status: 200,
      message: "Product deleted successfully",
      data: null,
    });
  } catch (error) {
    next(error);
  }
}

async function activateProduct(req, res, next) {
  try {
    const id = req.params.id;
    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.isActive = true;
    await product.save();

    res.status(200).json({
      success: true,
      status: 200, 
      message: "Product activated successfully",
      data: {
        product: product,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function deactivationProduct(req, res, next) {
  try {
    const id = req.params.id;
    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        status: 404,
        message: "product not found",
        data: null,
      });
    }

    product.isActive = false;
    await product.save();

    res.status(200).json({ 
      success: true,
      status: 200,
      message: "Product deactivated successfully", 
      data: {
        product: product,
      },
    });
  } catch (error) {
    next(error);
  }
}
async function searchProducts(req, res) {
};


module.exports = {
  getProducts,
  getOneProduct,
  createProduct,
  editProduct,
  deleteProduct,
  deactivationProduct,
  activateProduct,
    searchProducts
};